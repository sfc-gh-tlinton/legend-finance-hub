import { querySnowflake } from "@/lib/snowflake"
import { FIN, OPEN_PERIOD } from "@/lib/constants"
import { plain } from "@/lib/money"

export const dynamic = "force-dynamic"

/** GET /api/close/issues — all issues for the open period, plus owners. ?id=… adds that issue's event trail. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")
  try {
    if (id) {
      const events = await querySnowflake(
        `select EVENT_AT, ACTOR, EVENT_TYPE, MESSAGE from ${FIN}.CLOSE_ISSUE_EVENTS where ISSUE_ID = ? order by EVENT_AT`, { binds: [id] })
      return Response.json(events.map((e) => ({ ...e, EVENT_AT: e.EVENT_AT instanceof Date ? e.EVENT_AT.toISOString() : String(e.EVENT_AT) })))
    }
    const [issues, owners] = await Promise.all([
      querySnowflake(`select i.*, o.FULL_NAME OWNER_NAME, o.TITLE OWNER_TITLE from ${FIN}.CLOSE_ISSUES i
        left join ${FIN}.CLOSE_OWNERS o on o.OWNER = i.OWNER where i.FISCAL_PERIOD = ?::date
        order by iff(i.STATUS = 'Resolved', 1, 0), iff(i.SEVERITY = 'High', 0, 1), i.AMOUNT desc nulls last`, { binds: [OPEN_PERIOD] }),
      querySnowflake(`select OWNER, FULL_NAME, TITLE, IS_APPROVER from ${FIN}.CLOSE_OWNERS order by IS_APPROVER desc, OWNER`),
    ])
    const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null)
    return Response.json({
      issues: plain(issues.map((i) => ({ ...i, PROPOSED_AT: ts(i.PROPOSED_AT), RESOLVED_AT: ts(i.RESOLVED_AT), NOTIFIED_AT: ts(i.NOTIFIED_AT), CREATED_AT: ts(i.CREATED_AT), ESCALATED_AT: ts(i.ESCALATED_AT) }))),
      owners,
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[close/issues]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Failed to load issues" }, { status: 500 })
  }
}

const ACTIONS = new Set(["PROPOSE", "APPROVE", "REJECT", "RESOLVE", "COMMENT"])

/** POST { issueId, action, actor, note?, option? } → APPLY_CLOSE_ACTION (approval rules enforced in Snowflake). */
export async function POST(req: Request) {
  try {
    const b = await req.json()
    if (!ACTIONS.has(b.action)) return Response.json({ error: "Unknown action" }, { status: 400 })
    const [row] = await querySnowflake(`call ${FIN}.APPLY_CLOSE_ACTION(?, ?, ?, ?, ?)`, {
      binds: [String(b.issueId), b.action, String(b.actor ?? ""), String(b.note ?? "").slice(0, 2000), b.option ? String(b.option) : null],
    })
    const v = Object.values(row)[0]
    const result = typeof v === "string" ? JSON.parse(v) : v
    if (!result.ok) return Response.json(result, { status: 400 })
    // re-run checks so the board and task checklist reflect the fix immediately
    if (b.action === "APPROVE" || b.action === "RESOLVE") {
      await querySnowflake(`call ${FIN}.RUN_CLOSE_CHECKS(?::date, ?)`, { binds: [OPEN_PERIOD, `FIX_BY_${b.actor}`] })
    }
    return Response.json(result)
  } catch (e) {
    console.error(new Date().toISOString(), "[close/issues/action]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 })
  }
}
