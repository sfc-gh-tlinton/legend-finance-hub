import Link from "next/link"
import { AlarmClock, CalendarClock, Receipt, Timer } from "lucide-react"
import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarSeriesChart, LineSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

const BUCKETS = ["Current", "1-30", "31-60", "61-90", "90+"]

export default async function ReceivablesPage() {
  try {
    const [kpi, byCustomer, dso, top] = await Promise.all([
      querySnowflake(`select sum(OPEN_AMOUNT) open_ar, sum(iff(DAYS_PAST_DUE > 0, OPEN_AMOUNT, 0)) past_due,
          sum(iff(DAYS_PAST_DUE > 60, OPEN_AMOUNT, 0)) over_60, count(*) invoices,
          (select DSO_DAYS from ${FIN}.V_WORKING_CAPITAL where FISCAL_PERIOD = '2026-09-01') dso
        from ${FIN}.V_AR_AGING`),
      querySnowflake(`select CUSTOMER_NAME, SEGMENT,
          ${BUCKETS.map((b) => `round(sum(iff(AGING_BUCKET = '${b}', OPEN_AMOUNT, 0))) "${b}"`).join(", ")},
          round(sum(OPEN_AMOUNT)) TOTAL
        from ${FIN}.V_AR_AGING group by 1,2 order by TOTAL desc`),
      querySnowflake(`select to_char(date_trunc(month, i.PAID_DATE),'YYYY-MM') MONTH, c.SEGMENT,
          round(avg(datediff(day, i.DUE_DATE, i.PAID_DATE)), 1) DAYS_LATE
        from ${FIN}.AR_INVOICES i join ${FIN}.DIM_CUSTOMER c using (CUSTOMER_ID)
        where i.PAID_DATE >= '2025-07-01' group by 1,2 order by 1`),
      querySnowflake(`select INVOICE_ID, CUSTOMER_NAME, INVOICE_DATE, DUE_DATE, OPEN_AMOUNT, DAYS_PAST_DUE, AGING_BUCKET
        from ${FIN}.V_AR_AGING where DAYS_PAST_DUE > 0 order by OPEN_AMOUNT desc limit 12`),
    ])
    const k = kpi[0]
    // pivot segment lines for the days-late chart
    const months = [...new Set(dso.map((r) => r.MONTH))]
    const segs = [...new Set(dso.map((r) => r.SEGMENT))]
    const lateData = months.map((m) => Object.fromEntries([["MONTH", m], ...segs.map((s) => [s, dso.find((r) => r.MONTH === m && r.SEGMENT === s)?.DAYS_LATE ?? null])]))

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Order to cash" title="Accounts receivable" description="Open invoices and aging as of Oct 27, 2026"
          actions={<Button asChild variant="outline"><Link href={`/chat?q=${encodeURIComponent("Why is past-due AR growing? Which customers are paying later than their terms and since when?")}`}>Why is past-due growing?</Link></Button>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open AR" value={usd(k.OPEN_AR)} hint={`${k.INVOICES} open invoices`} icon={Receipt} />
          <StatCard label="Past due" value={usd(k.PAST_DUE)} hint={`${((Number(k.PAST_DUE) / Number(k.OPEN_AR)) * 100).toFixed(0)}% of open AR`} icon={AlarmClock} />
          <StatCard label="Over 60 days" value={usd(k.OVER_60)} hint="Reserve review candidates" icon={CalendarClock} />
          <StatCard label="DSO · Sep 2026" value={`${k.DSO} days`} icon={Timer} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Aging by customer" description="Open balance by past-due bucket">
            <BarSeriesChart data={plain(byCustomer).slice(0, 8)} x="CUSTOMER_NAME" horizontal stacked height={320} series={BUCKETS.map((b) => ({ key: b }))} />
          </Section>
          <Section title="Average days paid past due" description="By customer segment, month of payment">
            <LineSeriesChart data={lateData} x="MONTH" height={320} series={segs.map((s) => ({ key: s }))} />
          </Section>
        </div>
        <Section title="Aging detail" flush>
          {byCustomer.length === 0 ? <EmptyState title="No open receivables" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Segment</TableHead>{BUCKETS.map((b) => <TableHead key={b} numeric>{b}</TableHead>)}<TableHead numeric>Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {byCustomer.map((r) => (
                  <TableRow key={r.CUSTOMER_NAME}>
                    <TableCell className="font-medium">{r.CUSTOMER_NAME}</TableCell>
                    <TableCell className="text-muted-foreground">{r.SEGMENT}</TableCell>
                    {BUCKETS.map((b) => <TableCell key={b} numeric className={b !== "Current" && Number(r[b]) > 0 ? "text-destructive" : undefined}>{Number(r[b]) ? usd(r[b]) : "—"}</TableCell>)}
                    <TableCell numeric className="font-semibold">{usd(r.TOTAL)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
        <Section title="Largest past-due invoices" description="Prioritized collection worklist" flush>
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Invoiced</TableHead><TableHead>Due</TableHead><TableHead numeric>Open</TableHead><TableHead numeric>Days past due</TableHead></TableRow></TableHeader>
            <TableBody>
              {top.map((r) => (
                <TableRow key={r.INVOICE_ID}>
                  <TableCell className="font-mono text-xs">{r.INVOICE_ID}</TableCell>
                  <TableCell>{r.CUSTOMER_NAME}</TableCell>
                  <TableCell>{formatDate(r.INVOICE_DATE)}</TableCell>
                  <TableCell>{formatDate(r.DUE_DATE)}</TableCell>
                  <TableCell numeric>{usd(r.OPEN_AMOUNT, 2)}</TableCell>
                  <TableCell numeric><Badge variant={r.DAYS_PAST_DUE > 60 ? "destructive" : "warning"}>{r.DAYS_PAST_DUE}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[ar]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load receivables" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
