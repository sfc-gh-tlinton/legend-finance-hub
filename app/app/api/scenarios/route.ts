import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain } from "@/lib/money"

export const dynamic = "force-dynamic"

/** Parse a numeric query param within bounds; empty → null (means "use baseline"). */
function num(sp: URLSearchParams, key: string, min: number, max: number, nullable = false): number | null {
  const raw = sp.get(key)
  if (raw === null || raw === "") return nullable ? null : 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return nullable ? null : 0
  return Math.min(max, Math.max(min, n))
}

/**
 * GET /api/scenarios?type=cash&janssenDelay=..&rdChange=..&milestoneDelay=..&growthAdj=..
 * GET /api/scenarios?type=profit&us=..&eu=..&row=..&cogs=..&comm=..
 * GET /api/scenarios?type=saved
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  try {
    const type = sp.get("type")
    if (type === "cash") {
      const binds = [num(sp, "janssenDelay", 0, 180), num(sp, "rdChange", -50, 100), num(sp, "milestoneDelay", 0, 12), num(sp, "growthAdj", -50, 50)]
      const rows = await querySnowflake(`select * from table(${FIN}.CASH_RUNWAY_SCENARIO(?::float, ?::float, ?::float, ?::float)) order by MONTH`, { binds })
      return Response.json(plain(rows))
    }
    if (type === "profit") {
      const binds = [num(sp, "us", -50, 150, true), num(sp, "eu", -50, 150, true), num(sp, "row", -50, 150, true), num(sp, "cogs", -10, 15), num(sp, "comm", -10, 15)]
      const rows = await querySnowflake(`select * from table(${FIN}.PROFIT_SPLIT_SCENARIO(?::float, ?::float, ?::float, ?::float, ?::float)) order by MONTH, REGION`, { binds })
      return Response.json(plain(rows))
    }
    if (type === "saved") {
      const rows = await querySnowflake(`select SCENARIO_ID, SCENARIO_TYPE, NAME, DESCRIPTION, PARAMS, CREATED_BY, CREATED_AT from ${FIN}.SCENARIOS order by CREATED_AT`)
      return Response.json(plain(rows).map((r) => ({ ...r, PARAMS: typeof r.PARAMS === "string" ? JSON.parse(r.PARAMS) : r.PARAMS })))
    }
    return Response.json({ error: "Unknown type" }, { status: 400 })
  } catch (e) {
    console.error(new Date().toISOString(), "[scenarios]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Scenario query failed" }, { status: 500 })
  }
}

/** POST { type: "CASH_RUNWAY" | "PROFIT_SPLIT", name, description, params } — save a named scenario. */
export async function POST(req: Request) {
  try {
    const b = await req.json()
    const type = b.type === "PROFIT_SPLIT" ? "PROFIT_SPLIT" : "CASH_RUNWAY"
    const name = String(b.name ?? "").trim().slice(0, 100)
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 })
    const params = JSON.stringify(b.params ?? {})
    await querySnowflake(
      `insert into ${FIN}.SCENARIOS (SCENARIO_TYPE, NAME, DESCRIPTION, PARAMS) select ?, ?, ?, parse_json(?)`,
      { binds: [type, name, String(b.description ?? "").slice(0, 500), params] },
    )
    return Response.json({ ok: true })
  } catch (e) {
    console.error(new Date().toISOString(), "[scenarios/save]", e)
    return Response.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 })
  }
}
