import Link from "next/link"
import { Handshake, Percent, Pill, Sigma } from "lucide-react"
import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { formatPercent } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarSeriesChart, LineSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

export default async function ProfitSplitPage() {
  try {
    const [kpi, monthly, waterfall, detail] = await Promise.all([
      querySnowflake(`select sum(CARVYKTI_NET_SALES) sales, sum(PRETAX_PROFIT) profit, sum(LEGEND_PROFIT_SHARE) share,
          sum(iff(year(FISCAL_PERIOD) = 2025 and month(FISCAL_PERIOD) <= 9, CARVYKTI_NET_SALES, 0)) sales_ly
        from ${FIN}.PROFIT_SPLIT where FISCAL_PERIOD >= '2026-01-01' or year(FISCAL_PERIOD) = 2025`),
      querySnowflake(`select to_char(FISCAL_PERIOD,'YYYY-MM') MONTH,
          round(sum(iff(REGION = 'United States', CARVYKTI_NET_SALES, 0))) "United States",
          round(sum(iff(REGION = 'Europe', CARVYKTI_NET_SALES, 0))) "Europe",
          round(sum(iff(REGION = 'Rest of World', CARVYKTI_NET_SALES, 0))) "Rest of World",
          round(sum(LEGEND_PROFIT_SHARE)) "Legend share"
        from ${FIN}.PROFIT_SPLIT group by 1 order by 1`),
      querySnowflake(`select 'Net sales' STEP, round(sum(CARVYKTI_NET_SALES)) AMT, 1 o from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Cost of goods', -round(sum(COST_OF_GOODS)), 2 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Commercial', -round(sum(COMMERCIAL_EXPENSES)), 3 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Medical affairs', -round(sum(MEDICAL_AFFAIRS_EXPENSES)), 4 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Pre-tax profit', round(sum(PRETAX_PROFIT)), 5 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Janssen 50%', -round(sum(JANSSEN_PROFIT_SHARE)), 6 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        union all select 'Legend 50%', round(sum(LEGEND_PROFIT_SHARE)), 7 from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026
        order by o`),
      querySnowflake(`select to_char(FISCAL_PERIOD,'YYYY-MM') MONTH, REGION, CARVYKTI_NET_SALES, COST_OF_GOODS, COMMERCIAL_EXPENSES,
          MEDICAL_AFFAIRS_EXPENSES, PRETAX_PROFIT, LEGEND_PROFIT_SHARE, STATUS, SOURCE_FILE
        from ${FIN}.PROFIT_SPLIT where FISCAL_PERIOD >= '2026-07-01' order by FISCAL_PERIOD desc, REGION`),
    ])
    // KPI query mixes 2025 and 2026; split here for clarity
    const ytd = await querySnowflake(`select sum(CARVYKTI_NET_SALES) sales, sum(PRETAX_PROFIT) profit, sum(LEGEND_PROFIT_SHARE) share
      from ${FIN}.PROFIT_SPLIT where year(FISCAL_PERIOD) = 2026`)
    const y = ytd[0]
    const growth = Number(y.SALES) / Number(kpi[0].SALES_LY) - 1

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Carvykti collaboration · Janssen (J&J)" title="Profit split"
          description="Replaces the SharePoint Excel profit-split workbooks. 50/50 pre-tax profit share ex-Greater China."
          actions={<Button asChild variant="outline"><Link href={`/chat?q=${encodeURIComponent("How has Legend's Carvykti profit share trended in 2026 by region, and what drove the change in margin?")}`}>Analyze with Assistant</Link></Button>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Carvykti net sales · 2026 YTD" value={usd(y.SALES)} hint={`${formatPercent(growth)} vs Jan–Sep 2025`} icon={Pill} />
          <StatCard label="Collaboration pre-tax profit" value={usd(y.PROFIT)} icon={Sigma} />
          <StatCard label="Legend 50% share" value={usd(y.SHARE)} icon={Handshake} />
          <StatCard label="Profit margin" value={formatPercent(Number(y.PROFIT) / Number(y.SALES))} hint="Pre-tax, ex-Greater China" icon={Percent} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Net sales by region" description="Monthly, with Legend profit share">
            <BarSeriesChart data={plain(monthly).slice(-15)} x="MONTH" stacked height={300} series={[{ key: "United States" }, { key: "Europe" }, { key: "Rest of World" }]} />
          </Section>
          <Section title="2026 YTD profit bridge" description="Net sales to Legend share">
            <BarSeriesChart data={plain(waterfall)} x="STEP" height={300} series={[{ key: "AMT", label: "USD" }]} />
          </Section>
        </div>
        <Section title="Legend profit share trend">
          <LineSeriesChart data={plain(monthly)} x="MONTH" height={220} series={[{ key: "Legend share" }]} />
        </Section>
        <Section title="Calculation detail · last 3 months" flush>
          {detail.length === 0 ? <EmptyState title="No profit split data" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Month</TableHead><TableHead>Region</TableHead><TableHead numeric>Net sales</TableHead><TableHead numeric>COGS</TableHead>
                <TableHead numeric>Commercial</TableHead><TableHead numeric>Medical</TableHead><TableHead numeric>Pre-tax</TableHead>
                <TableHead numeric>Legend share</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {detail.map((r) => (
                  <TableRow key={r.MONTH + r.REGION}>
                    <TableCell>{r.MONTH}</TableCell><TableCell>{r.REGION}</TableCell>
                    <TableCell numeric>{usd(r.CARVYKTI_NET_SALES)}</TableCell><TableCell numeric>{usd(r.COST_OF_GOODS)}</TableCell>
                    <TableCell numeric>{usd(r.COMMERCIAL_EXPENSES)}</TableCell><TableCell numeric>{usd(r.MEDICAL_AFFAIRS_EXPENSES)}</TableCell>
                    <TableCell numeric>{usd(r.PRETAX_PROFIT)}</TableCell><TableCell numeric className="font-semibold">{usd(r.LEGEND_PROFIT_SHARE)}</TableCell>
                    <TableCell><Badge variant={r.STATUS === "Final" ? "success" : "warning"}>{r.STATUS}</Badge></TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-[11px] text-muted-foreground" title={r.SOURCE_FILE}>{String(r.SOURCE_FILE).split("/").pop()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[profit-split]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load profit split" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
