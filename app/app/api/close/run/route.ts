import { querySnowflake } from "@/lib/snowflake"
import { askAgent } from "@/lib/agent"
import { FIN, OPEN_PERIOD } from "@/lib/constants"
import { usd } from "@/lib/money"

export const dynamic = "force-dynamic"

type Event =
  | { type: "step"; task: string; name: string; status: string; detail: string }
  | { type: "summary"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }

function parse(v: unknown) {
  return typeof v === "string" ? JSON.parse(v) : v
}

/** Reset the October close demo (issues, fixes, task board). */
export async function DELETE() {
  try {
    await querySnowflake(`call ${FIN}.RESET_CLOSE_DEMO()`)
    return Response.json({ ok: true })
  } catch (e) {
    console.error(new Date().toISOString(), "[close/reset]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Reset failed" }, { status: 500 })
  }
}

/**
 * Run the close agent: executes every enabled rule in CLOSE_CHECK_RULES via RUN_CLOSE_CHECKS
 * (opens/auto-resolves issues and updates CLOSE_TASKS), optionally emails owners, then asks the
 * Cortex Agent for a controller briefing. Streams NDJSON progress events to the UI.
 */
export async function POST(req: Request) {
  const notify = new URL(req.url).searchParams.get("notify") === "1"
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: Event) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"))
      try {
        const rules = await querySnowflake(
          `select RULE_ID, TASK_CODE, RULE_NAME from ${FIN}.CLOSE_CHECK_RULES where ENABLED order by SORT_ORDER`)
        for (const r of rules) emit({ type: "step", task: r.RULE_ID, name: `${r.TASK_CODE} · ${r.RULE_NAME}`, status: "running", detail: "Checking…" })

        const [res] = await querySnowflake(`call ${FIN}.RUN_CLOSE_CHECKS(?::date, 'CLOSE_AGENT')`, { binds: [OPEN_PERIOD] })
        const summary = parse(Object.values(res)[0]) as { rules: any[]; errors: { rule_id: string; error: string }[] }
        for (const r of summary.rules) {
          const err = summary.errors.find((e) => e.rule_id === r.rule_id)
          const status = err ? "Blocked" : r.open_issues === 0 ? "Complete" : r.severity === "High" ? "Blocked" : "Needs Review"
          const detail = err
            ? `Rule failed to run: ${err.error}`
            : r.findings === 0
              ? r.open_issues === 0 ? "Passed — no exceptions." : `${r.open_issues} issue(s) still open.`
              : `${r.findings} exception(s)${r.amount ? `, ${usd(r.amount)}` : ""}. ${r.new_issues} new issue(s) opened, ${r.open_issues} open.`
          emit({ type: "step", task: r.rule_id, name: `${r.task_code} · ${r.rule_name}`, status, detail })
        }

        if (notify) {
          emit({ type: "step", task: "EMAIL", name: "Notify owners", status: "running", detail: "Sending email digests…" })
          const [n] = await querySnowflake(`call ${FIN}.NOTIFY_CLOSE_OWNERS(?::date)`, { binds: [OPEN_PERIOD] })
          const sent = (parse(Object.values(n)[0]) as { owner: string; issues: number }[]) ?? []
          emit({ type: "step", task: "EMAIL", name: "Notify owners", status: "Complete",
            detail: sent.length ? `Emailed ${sent.map((s) => `${s.owner} (${s.issues})`).join(", ")}` : "No new issues to notify" })
        }

        emit({ type: "step", task: "AI", name: "Legend Finance Assistant · controller briefing", status: "running", detail: "Asking the Cortex Agent…" })
        const text = await askAgent(
          "You are reviewing the October 2026 month-end close. Using the open close exceptions (with owner, status and SLA) and close tasks for 2026-10, " +
          "give a short controller briefing: overall status, the blockers by severity with amount, owner and due date, the likely root cause, and the next action. " +
          "Keep it under 200 words.",
        )
        emit({ type: "step", task: "AI", name: "Legend Finance Assistant · controller briefing", status: "Complete", detail: "Briefing ready" })
        emit({ type: "summary", text })
        emit({ type: "done" })
      } catch (e) {
        console.error(new Date().toISOString(), "[close/run]", e)
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } })
}
