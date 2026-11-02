import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"

export const dynamic = "force-dynamic"

/** GET — all close check rules with the latest finding count. */
export async function GET() {
  try {
    const rows = await querySnowflake(`
      select r.*, coalesce(o.OPEN_ISSUES, 0) OPEN_ISSUES
      from ${FIN}.CLOSE_CHECK_RULES r
      left join (select RULE_ID, count(*) OPEN_ISSUES from ${FIN}.CLOSE_ISSUES where STATUS <> 'Resolved' group by 1) o using (RULE_ID)
      order by SORT_ORDER`)
    return Response.json(rows.map((r) => ({ ...r, UPDATED_AT: r.UPDATED_AT instanceof Date ? r.UPDATED_AT.toISOString() : r.UPDATED_AT })))
  } catch (e) {
    console.error(new Date().toISOString(), "[close/rules]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Failed to load rules" }, { status: 500 })
  }
}

const SEVERITIES = new Set(["High", "Medium"])
const FIXES = new Set(["INVESTIGATE", "POST_AR_INVOICE", "VOID_DUPLICATE_BILL", "REVIEW_JOURNAL", "CONFIRM_PROFIT_SPLIT", "SEND_COLLECTIONS"])

/**
 * POST { ruleId, enabled?, severity?, checkSql?, description?, test? }
 * test: true → dry-run the SQL and return sample findings without saving.
 * Rule SQL is read-only by contract: it must be a single SELECT/WITH statement.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json()
    const ruleId = String(b.ruleId ?? "")
    if (!/^R\d{2}$/.test(ruleId)) return Response.json({ error: "Invalid rule id" }, { status: 400 })
    if (b.checkSql !== undefined) {
      const sql = String(b.checkSql).trim().replace(/;+\s*$/, "")
      if (!/^(select|with)\b/i.test(sql) || sql.includes(";")) {
        return Response.json({ error: "Rule SQL must be a single SELECT (or WITH … SELECT) statement" }, { status: 400 })
      }
      if (/\b(insert|update|delete|merge|drop|create|alter|grant|revoke|truncate|call|execute)\b/i.test(sql)) {
        return Response.json({ error: "Rule SQL may only read data" }, { status: 400 })
      }
      if (b.test) {
        const preview = sql.replaceAll("{{PERIOD}}", "'2026-10-01'").replaceAll("{{AS_OF}}", "'2026-10-27'")
        const rows = await querySnowflake(
          `select x.REFERENCE::string REFERENCE, x.COUNTERPARTY::string COUNTERPARTY, x.AMOUNT::number(18,2) AMOUNT, x.DETAIL::string DETAIL, x.SEVERITY::string SEVERITY from (${preview}) x limit 20`)
        return Response.json({ ok: true, findings: rows })
      }
      await querySnowflake(`update ${FIN}.CLOSE_CHECK_RULES set CHECK_SQL = ?, UPDATED_BY = current_user(), UPDATED_AT = current_timestamp() where RULE_ID = ?`, { binds: [sql, ruleId] })
    }
    if (b.enabled !== undefined) {
      await querySnowflake(`update ${FIN}.CLOSE_CHECK_RULES set ENABLED = ?, UPDATED_AT = current_timestamp() where RULE_ID = ?`, { binds: [Boolean(b.enabled), ruleId] })
    }
    if (b.severity !== undefined) {
      if (!SEVERITIES.has(b.severity)) return Response.json({ error: "Invalid severity" }, { status: 400 })
      await querySnowflake(`update ${FIN}.CLOSE_CHECK_RULES set SEVERITY = ?, UPDATED_AT = current_timestamp() where RULE_ID = ?`, { binds: [b.severity, ruleId] })
    }
    if (b.fixAction !== undefined) {
      if (!FIXES.has(b.fixAction)) return Response.json({ error: "Invalid fix action" }, { status: 400 })
      await querySnowflake(`update ${FIN}.CLOSE_CHECK_RULES set FIX_ACTION = ?, UPDATED_AT = current_timestamp() where RULE_ID = ?`, { binds: [b.fixAction, ruleId] })
    }
    if (b.description !== undefined) {
      await querySnowflake(`update ${FIN}.CLOSE_CHECK_RULES set DESCRIPTION = ? where RULE_ID = ?`, { binds: [String(b.description).slice(0, 500), ruleId] })
    }
    return Response.json({ ok: true })
  } catch (e) {
    console.error(new Date().toISOString(), "[close/rules/update]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Rule update failed" }, { status: 500 })
  }
}
