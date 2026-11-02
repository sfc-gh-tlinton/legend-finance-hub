import Link from "next/link"
import { Cpu, DollarSign, Tag, TriangleAlert } from "lucide-react"
import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { formatNumber, formatPercent } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

export default async function FinOpsPage() {
  try {
    const [kpi, trend, chargeback, warehouses] = await Promise.all([
      querySnowflake(`select sum(COST_USD) cost, sum(CREDITS_USED) credits, sum(iff(not IS_TAGGED, COST_USD, 0)) untagged,
          (select sum(COST_USD) from ${FIN}.V_FINOPS_MONTHLY where FISCAL_PERIOD = '2026-08-01') prior
        from ${FIN}.V_FINOPS_MONTHLY where FISCAL_PERIOD = '2026-09-01'`),
      querySnowflake(`select to_char(FISCAL_PERIOD,'YYYY-MM') MONTH, ACCOUNT_NAME, round(sum(COST_USD)) COST
        from ${FIN}.V_FINOPS_MONTHLY where FISCAL_PERIOD < '2026-10-01' group by 1,2 order by 1`),
      querySnowflake(`select coalesce(b.BUSINESS_UNIT, m.BUSINESS_UNIT) BU, round(sum(m.COST_USD)) "Actual", max(b.MONTHLY_BUDGET_USD) "Budget"
        from ${FIN}.V_FINOPS_MONTHLY m left join ${FIN}.FINOPS_BUDGET b on b.BUSINESS_UNIT = m.BUSINESS_UNIT and b.FISCAL_PERIOD = m.FISCAL_PERIOD
        where m.FISCAL_PERIOD = '2026-09-01' group by 1 order by "Actual" desc`),
      querySnowflake(`select ACCOUNT_NAME, WAREHOUSE_NAME, BUSINESS_UNIT, PROJECT, IS_TAGGED,
          sum(iff(FISCAL_PERIOD = '2026-09-01', CREDITS_USED, 0)) CREDITS, sum(iff(FISCAL_PERIOD = '2026-09-01', COST_USD, 0)) COST,
          sum(iff(FISCAL_PERIOD = '2026-06-01', COST_USD, 0)) COST_JUN
        from ${FIN}.V_FINOPS_MONTHLY group by 1,2,3,4,5 order by COST desc`),
    ])
    const k = kpi[0]
    const accounts = [...new Set(trend.map((r) => r.ACCOUNT_NAME))]
    const months = [...new Set(trend.map((r) => r.MONTH))]
    const trendData = months.map((m) => Object.fromEntries([["MONTH", m], ...accounts.map((a) => [a, trend.find((r) => r.MONTH === m && r.ACCOUNT_NAME === a)?.COST ?? 0])]))

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="FinOps & cost attribution" title="Snowflake chargeback"
          description="Consumption across GXP, non-GXP and reader accounts attributed to business units via warehouse tags. Full chargeback targeted for 2027."
          actions={<Button asChild variant="outline"><Link href={`/chat?q=${encodeURIComponent("Which warehouses drove the increase in Snowflake spend since June 2026, and how much spend is untagged?")}`}>Explain spend</Link></Button>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Snowflake spend · Sep 2026" value={usd(k.COST)} hint={`${formatPercent(Number(k.COST) / Number(k.PRIOR) - 1)} vs Aug`} icon={DollarSign} />
          <StatCard label="Credits consumed" value={formatNumber(k.CREDITS, 0)} icon={Cpu} />
          <StatCard label="Untagged spend" value={usd(k.UNTAGGED)} hint={`${formatPercent(Number(k.UNTAGGED) / Number(k.COST))} not attributable`} icon={TriangleAlert} />
          <StatCard label="Tag coverage" value={formatPercent(1 - Number(k.UNTAGGED) / Number(k.COST))} hint="Target 100% before 2027 chargeback" icon={Tag} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Monthly spend by account">
            <BarSeriesChart data={trendData} x="MONTH" stacked height={300} series={accounts.map((key) => ({ key }))} />
          </Section>
          <Section title="Chargeback vs budget · Sep 2026" description="By business unit">
            <BarSeriesChart data={plain(chargeback)} x="BU" height={300} series={[{ key: "Actual" }, { key: "Budget" }]} />
          </Section>
        </div>
        <Section title="Warehouse attribution · Sep 2026" flush>
          {warehouses.length === 0 ? <EmptyState title="No consumption" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Account</TableHead><TableHead>Warehouse</TableHead><TableHead>Business unit</TableHead><TableHead>Project</TableHead>
                <TableHead numeric>Credits</TableHead><TableHead numeric>Cost</TableHead><TableHead numeric>vs Jun</TableHead><TableHead>Tag</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {warehouses.map((w) => {
                  const chg = Number(w.COST) / Number(w.COST_JUN) - 1
                  return (
                    <TableRow key={w.ACCOUNT_NAME + w.WAREHOUSE_NAME}>
                      <TableCell className="text-xs text-muted-foreground">{w.ACCOUNT_NAME}</TableCell>
                      <TableCell className="font-mono text-xs">{w.WAREHOUSE_NAME}</TableCell>
                      <TableCell>{w.BUSINESS_UNIT}</TableCell>
                      <TableCell className="text-muted-foreground">{w.PROJECT}</TableCell>
                      <TableCell numeric>{formatNumber(w.CREDITS, 0)}</TableCell>
                      <TableCell numeric>{usd(w.COST)}</TableCell>
                      <TableCell numeric className={chg > 0.5 ? "text-destructive" : undefined}>{formatPercent(chg, 0)}</TableCell>
                      <TableCell>{w.IS_TAGGED ? <Badge variant="success">Tagged</Badge> : <Badge variant="destructive">Untagged</Badge>}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Section>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[finops]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load FinOps" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
