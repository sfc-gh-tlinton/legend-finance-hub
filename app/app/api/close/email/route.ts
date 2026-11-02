import { querySnowflake } from "@/lib/snowflake"
import { askAgent } from "@/lib/agent"
import { FIN } from "@/lib/constants"

export const dynamic = "force-dynamic"

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** POST { issueId } → Assistant drafts an email to the issue owner. { issueId, subject, body, actor, send: true } → send it. */
export async function POST(req: Request) {
  try {
    const b = await req.json()
    const [issue] = await querySnowflake(
      `select i.*, o.FULL_NAME, o.EMAIL from ${FIN}.CLOSE_ISSUES i join ${FIN}.CLOSE_OWNERS o on o.OWNER = i.OWNER where i.ISSUE_ID = ?`,
      { binds: [String(b.issueId)] })
    if (!issue) return Response.json({ error: "Issue not found" }, { status: 404 })

    if (b.send) {
      const subject = String(b.subject ?? "").slice(0, 200)
      const html = escapeHtml(String(b.body ?? "").slice(0, 8000)).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")
      await querySnowflake(`call ${FIN}.SEND_CLOSE_EMAIL(?, ?, ?)`, { binds: [issue.EMAIL, subject, html] })
      await querySnowflake(
        `insert into ${FIN}.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE) select ?, ?, 'EMAILED', ?`,
        { binds: [issue.ISSUE_ID, String(b.actor ?? "APP"), `Email "${subject}" sent to ${issue.FULL_NAME}`] })
      return Response.json({ ok: true })
    }

    const text = await askAgent(
      `Draft a short, professional email from the Corporate Controller to ${issue.FULL_NAME} (${issue.OWNER}) about this month-end close issue. ` +
      `Issue: ${issue.TITLE}. Reference: ${issue.REFERENCE}. Counterparty: ${issue.COUNTERPARTY}. Amount: ${issue.AMOUNT}. Detail: ${issue.DETAIL}. ` +
      `Due date: ${String(issue.SLA_DUE).slice(0, 10)}. Look up any supporting facts you need, explain the likely root cause and the specific action needed. ` +
      `Return exactly this format and nothing else:\nSUBJECT: <subject line>\nBODY:\n<plain-text email body, no markdown>`)
    const m = text.match(/SUBJECT:\s*(.+)\n+BODY:\s*\n?([\s\S]+)/i)
    return Response.json({
      subject: (m?.[1] ?? `Action needed: ${issue.TITLE} ${issue.REFERENCE}`).trim(),
      body: (m?.[2] ?? text).replace(/\*\*/g, "").trim(),
      to: `${issue.FULL_NAME} <${issue.EMAIL}>`,
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[close/email]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Email failed" }, { status: 500 })
  }
}
