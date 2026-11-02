import Link from "next/link"
import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"
import { PeriodPicker } from "@/components/finance/period-picker"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const SECTIONS = ["Revenue", "Cost of Revenue", "Operating Expenses", "Other Income (Expense)"]

export default async function IncomeStatementPage({ searchParams }: { searchParams: Promise<{ period?: string; entity?: string }> }) {
  const sp = await searchParams
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : "2026-09"
  const entity = ["US01", "BE01", "IE01"].includes(sp.entity ?? "") ? sp.entity! : "ALL"
  const start = `${period}-01`
  try {
    const [periods, lines, ccVar, anomalies] = await Promise.all([
      querySnowflake(`select PERIOD_NAME from ${FIN}.DIM_PERIOD where PERIOD_START < '2026-10-01' order by 1 desc`),
      querySnowflake(`
        select CATEGORY, ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, min(SORT_ORDER) SORT_ORDER,
          sum(iff(FISCAL_PERIOD = ?::date, ACTUAL_AMOUNT, 0)) ACTUAL,
          sum(iff(FISCAL_PERIOD = ?::date, BUDGET_AMOUNT, 0)) BUDGET,
          sum(iff(FISCAL_PERIOD = dateadd(month, -1, ?::date), ACTUAL_AMOUNT, 0)) PRIOR_MONTH,
          sum(iff(FISCAL_PERIOD = dateadd(year, -1, ?::date), ACTUAL_AMOUNT, 0)) PRIOR_YEAR,
          sum(iff(FISCAL_PERIOD between date_trunc(year, ?::date) and ?::date, ACTUAL_AMOUNT, 0)) YTD
        from ${FIN}.V_INCOME_STATEMENT where (? = 'ALL' or ENTITY_ID = ?)
        group by 1,2,3,4 order by SORT_ORDER`, { binds: [start, start, start, start, start, start, entity, entity] }),
      querySnowflake(`
        select coalesce(BUSINESS_UNIT, 'Unallocated') BU,
          round(sum(ACTUAL_AMOUNT)) "Actual", round(sum(BUDGET_AMOUNT)) "Budget"
        from ${FIN}.V_INCOME_STATEMENT
        where FISCAL_PERIOD = ?::date and ACCOUNT_TYPE in ('OpEx','COGS') and (? = 'ALL' or ENTITY_ID = ?)
        group by 1 order by "Actual" desc`, { binds: [start, entity, entity] }),
      querySnowflake(`select ACCOUNT_NAME, BUSINESS_UNIT, ENTITY_ID, ACTUAL_AMOUNT, TRAILING_AVG, Z_SCORE
        from ${FIN}.V_GL_ANOMALIES where FISCAL_PERIOD = ?::date order by abs(Z_SCORE) desc`, { binds: [start] }),
    ])

    const sign = (r: Record<string, any>) => (r.ACCOUNT_TYPE === "Revenue" || r.ACCOUNT_TYPE === "Other" ? 1 : -1)
    const total = (rows: Record<string, any>[], key: string) => rows.reduce((s, r) => s + sign(r) * Number(r[key]), 0)
    const cols = ["ACTUAL", "BUDGET", "PRIOR_MONTH", "PRIOR_YEAR", "YTD"] as const
    const rev = lines.filter((l) => l.CATEGORY === "Revenue")
    const gp = lines.filter((l) => ["Revenue", "Cost of Revenue"].includes(l.CATEGORY))
    const op = lines.filter((l) => l.CATEGORY !== "Other Income (Expense)")
    const subtotal = (label: string, rows: Record<string, any>[]) => ({ label, values: cols.map((c) => total(rows, c)) })
    const subtotals: Record<string, { label: string; values: number[] }> = {
      "Cost of Revenue": subtotal("Gross profit", gp),
      "Operating Expenses": subtotal("Operating income", op),
      "Other Income (Expense)": subtotal("Net income", lines),
    }
    const revTotal = total(rev, "ACTUAL")

    // Variance is favorable when revenue beats budget or expense comes in under it.
    const favorable = (r: Record<string, any>) => sign(r) * (Number(r.ACTUAL) - Number(r.BUDGET)) >= 0

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Reporting" title="Income statement"
          description={`${entity === "ALL" ? "Consolidated" : entity} · ${period} · actual vs budget, prior month, prior year and YTD`}
          actions={<PeriodPicker periods={periods.map((p) => p.PERIOD_NAME)} period={period} entity={entity} />} />
        <Section title="Statement of operations" description="USD. Expenses shown as positive amounts." flush>
          {lines.length === 0 ? <EmptyState title="No activity for this period" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Line item</TableHead><TableHead numeric>Actual</TableHead><TableHead numeric>Budget</TableHead>
                <TableHead numeric>Var</TableHead><TableHead numeric>Prior month</TableHead><TableHead numeric>Prior year</TableHead>
                <TableHead numeric>YTD</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {SECTIONS.map((cat) => {
                  const rows = lines.filter((l) => l.CATEGORY === cat)
                  if (rows.length === 0) return null
                  const st = subtotals[cat]
                  return [
                    <TableRow key={cat} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={7} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</TableCell>
                    </TableRow>,
                    ...rows.map((r) => (
                      <TableRow key={r.ACCOUNT_ID}>
                        <TableCell className="pl-6">
                          <Link className="hover:underline" href={`/chat?q=${encodeURIComponent(`Explain what drove ${r.ACCOUNT_NAME} in ${period} versus budget and prior month`)}`}>
                            {r.ACCOUNT_NAME}
                          </Link>
                        </TableCell>
                        <TableCell numeric>{usd(r.ACTUAL)}</TableCell>
                        <TableCell numeric className="text-muted-foreground">{usd(r.BUDGET)}</TableCell>
                        <TableCell numeric className={cn(Number(r.BUDGET) !== 0 && (favorable(r) ? "text-success" : "text-destructive"))}>
                          {Number(r.BUDGET) === 0 ? "—" : usd(Number(r.ACTUAL) - Number(r.BUDGET))}
                        </TableCell>
                        <TableCell numeric>{usd(r.PRIOR_MONTH)}</TableCell>
                        <TableCell numeric>{usd(r.PRIOR_YEAR)}</TableCell>
                        <TableCell numeric>{usd(r.YTD)}</TableCell>
                      </TableRow>
                    )),
                    st && (
                      <TableRow key={st.label} className="border-t-2 font-semibold">
                        <TableCell>{st.label}{st.label === "Net income" && revTotal ? <span className="ml-2 text-xs font-normal text-muted-foreground">{((st.values[0] / revTotal) * 100).toFixed(1)}% margin</span> : null}</TableCell>
                        <TableCell numeric>{usd(st.values[0])}</TableCell>
                        <TableCell numeric>{usd(st.values[1])}</TableCell>
                        <TableCell numeric className={st.values[0] - st.values[1] >= 0 ? "text-success" : "text-destructive"}>{usd(st.values[0] - st.values[1])}</TableCell>
                        <TableCell numeric>{usd(st.values[2])}</TableCell>
                        <TableCell numeric>{usd(st.values[3])}</TableCell>
                        <TableCell numeric>{usd(st.values[4])}</TableCell>
                      </TableRow>
                    ),
                  ]
                })}
              </TableBody>
            </Table>
          )}
        </Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Cost by business unit vs budget" description={`COGS + OpEx, ${period}`}>
            {ccVar.length === 0 ? <EmptyState title="No cost data" /> :
              <BarSeriesChart data={plain(ccVar)} x="BU" series={[{ key: "Actual" }, { key: "Budget" }]} />}
          </Section>
          <Section title="GL anomalies" description="Account / cost-center months ≥ 3σ from trailing 12-month average" flush>
            {anomalies.length === 0 ? <EmptyState title="No anomalies this period" description="Try 2026-09 or 2026-06." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>BU</TableHead><TableHead numeric>Actual</TableHead><TableHead numeric>Avg</TableHead><TableHead numeric>z</TableHead></TableRow></TableHeader>
                <TableBody>
                  {anomalies.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{a.ACCOUNT_NAME} <span className="text-xs text-muted-foreground">{a.ENTITY_ID}</span></TableCell>
                      <TableCell>{a.BUSINESS_UNIT ?? "—"}</TableCell>
                      <TableCell numeric>{usd(a.ACTUAL_AMOUNT)}</TableCell>
                      <TableCell numeric>{usd(a.TRAILING_AVG)}</TableCell>
                      <TableCell numeric><Badge variant={Math.abs(a.Z_SCORE) >= 5 ? "destructive" : "warning"}>{Number(a.Z_SCORE).toFixed(1)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </div>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[income-statement]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load income statement" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
