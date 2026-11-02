import Link from "next/link"
import { AlertTriangle, Banknote, ClipboardCheck, HandCoins, Receipt, TrendingUp } from "lucide-react"
import { querySnowflake } from "@/lib/snowflake"
import { FIN, OPEN_PERIOD } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { formatPercent } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  try {
    const [kpi, trend, cash, exceptions, close] = await Promise.all([
      querySnowflake(`
        select
          sum(iff(FISCAL_PERIOD = '2026-09-01' and ACCOUNT_TYPE = 'Revenue', ACTUAL_AMOUNT, 0)) rev_sep,
          sum(iff(FISCAL_PERIOD = '2025-09-01' and ACCOUNT_TYPE = 'Revenue', ACTUAL_AMOUNT, 0)) rev_sep_ly,
          sum(iff(FISCAL_PERIOD between '2026-01-01' and '2026-09-01', NET_INCOME_CONTRIBUTION, 0)) ni_ytd,
          sum(iff(FISCAL_PERIOD = '2026-09-01', NET_INCOME_CONTRIBUTION, 0)) ni_sep,
          (select sum(BALANCE) from ${FIN}.V_BALANCE_SHEET where FISCAL_PERIOD = '2026-10-01' and ACCOUNT_ID = '1000') cash,
          (select sum(AMOUNT_USD - AMOUNT_PAID) from ${FIN}.AR_INVOICES) open_ar,
          (select sum(OPEN_AMOUNT) from ${FIN}.V_AR_AGING where DAYS_PAST_DUE > 0) past_due_ar,
          (select sum(AMOUNT_USD - AMOUNT_PAID) from ${FIN}.AP_BILLS where STATUS <> 'Void') open_ap
        from ${FIN}.V_INCOME_STATEMENT`),
      querySnowflake(`
        select PERIOD_NAME,
          round(sum(iff(ACCOUNT_TYPE = 'Revenue', ACTUAL_AMOUNT, 0))) "Revenue",
          round(sum(iff(ACCOUNT_TYPE in ('COGS','OpEx'), ACTUAL_AMOUNT, 0))) "Operating costs",
          round(sum(NET_INCOME_CONTRIBUTION)) "Net income"
        from ${FIN}.V_INCOME_STATEMENT where FISCAL_PERIOD between '2025-01-01' and '2026-09-01'
        group by 1 order by 1`),
      querySnowflake(`select to_char(FISCAL_PERIOD,'YYYY-MM') PERIOD,
          iff(TYPE = 'Actual', ENDING_CASH, null) "Actual cash", iff(TYPE = 'Forecast' or FISCAL_PERIOD = '2026-09-01', ENDING_CASH, null) "Forecast"
        from ${FIN}.V_CASH_FORECAST where FISCAL_PERIOD >= '2025-07-01' order by FISCAL_PERIOD`),
      querySnowflake(`select EXCEPTION_TYPE, REFERENCE, COUNTERPARTY, AMOUNT, SEVERITY from ${FIN}.V_CLOSE_EXCEPTIONS order by SEVERITY, AMOUNT desc limit 6`),
      querySnowflake(`select count(*) total, count_if(STATUS = 'Complete') done from ${FIN}.CLOSE_TASKS where FISCAL_PERIOD = ?`, { binds: [OPEN_PERIOD] }),
    ])
    const k = kpi[0]
    const yoy = Number(k.REV_SEP) / Number(k.REV_SEP_LY) - 1
    const c = close[0]

    return (
      <main className={PAGE}>
        <PageHeader
          eyebrow="Legend Biotech · Corporate Finance"
          title="Finance overview"
          description="September 2026 is closed. October 2026 close is in progress."
          actions={<Button asChild><Link href="/chat">Ask the Finance Assistant</Link></Button>}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue · Sep 2026" value={usd(k.REV_SEP)} hint={`${formatPercent(yoy)} vs Sep 2025`} icon={TrendingUp} />
          <StatCard label="Net income · YTD Sep" value={usd(k.NI_YTD)} hint={`Sep: ${usd(k.NI_SEP)}`} icon={HandCoins} />
          <StatCard label="Cash & equivalents" value={usd(k.CASH)} hint="As of Oct 27, 2026" icon={Banknote} />
          <StatCard label="October close" value={`${c.DONE}/${c.TOTAL} tasks`} hint="Business day 4 of close" icon={ClipboardCheck} />
          <StatCard label="Open receivables" value={usd(k.OPEN_AR)} hint={`${usd(k.PAST_DUE_AR)} past due`} icon={Receipt} />
          <StatCard label="Open payables" value={usd(k.OPEN_AP)} hint="Vendor bills unpaid" icon={Receipt} />
          <StatCard label="Close exceptions" value={exceptions.length >= 6 ? "6+" : String(exceptions.length)} hint="Flagged by automated checks" icon={AlertTriangle} className="lg:col-span-2" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Revenue, costs and net income" description="Monthly, Jan 2025 – Sep 2026">
            <LineSeriesChart data={plain(trend)} x="PERIOD_NAME" series={[{ key: "Revenue" }, { key: "Operating costs" }, { key: "Net income" }]} />
          </Section>
          <Section title="Cash position and 6-month forecast" description="Trailing 3-month average net cash flow, projected">
            <LineSeriesChart data={plain(cash)} x="PERIOD" series={[{ key: "Actual cash" }, { key: "Forecast" }]} />
          </Section>
        </div>
        <Section title="Top close exceptions" description="From automated sub-ledger, duplicate and journal checks"
          actions={<Button variant="outline" size="sm" asChild><Link href="/close">Open close workspace</Link></Button>} flush>
          {exceptions.length === 0 ? <EmptyState title="No exceptions" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Exception</TableHead><TableHead>Reference</TableHead><TableHead>Counterparty / user</TableHead>
                <TableHead numeric>Amount</TableHead><TableHead>Severity</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exceptions.map((e) => (
                  <TableRow key={e.REFERENCE + e.EXCEPTION_TYPE}>
                    <TableCell className="font-medium">{e.EXCEPTION_TYPE}</TableCell>
                    <TableCell className="font-mono text-xs">{e.REFERENCE}</TableCell>
                    <TableCell>{e.COUNTERPARTY}</TableCell>
                    <TableCell numeric>{usd(e.AMOUNT, 2)}</TableCell>
                    <TableCell><Badge variant={e.SEVERITY === "High" ? "destructive" : "warning"}>{e.SEVERITY}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[overview]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load overview" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
