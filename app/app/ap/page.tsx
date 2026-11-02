import Link from "next/link"
import { AlarmClock, CalendarClock, Copy, Receipt } from "lucide-react"
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
import { BarSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

const DUE = ["Overdue", "Due in 0-14 days", "Due in 15-30 days", "Due in 30+ days"]

export default async function PayablesPage() {
  try {
    const [kpi, byVendor, spend, dupes, upcoming] = await Promise.all([
      querySnowflake(`select sum(OPEN_AMOUNT) open_ap, sum(iff(DUE_BUCKET = 'Overdue', OPEN_AMOUNT, 0)) overdue,
          sum(iff(DUE_BUCKET in ('Overdue','Due in 0-14 days','Due in 15-30 days'), OPEN_AMOUNT, 0)) next30, count(*) bills
        from ${FIN}.V_AP_AGING`),
      querySnowflake(`select VENDOR_NAME, ${DUE.map((b) => `round(sum(iff(DUE_BUCKET = '${b}', OPEN_AMOUNT, 0))) "${b}"`).join(", ")}, round(sum(OPEN_AMOUNT)) TOTAL
        from ${FIN}.V_AP_AGING group by 1 order by TOTAL desc limit 10`),
      querySnowflake(`select to_char(date_trunc(month, b.BILL_DATE),'YYYY-MM') MONTH, v.CATEGORY, round(sum(b.AMOUNT_USD)) AMT
        from ${FIN}.AP_BILLS b join ${FIN}.DIM_VENDOR v using (VENDOR_ID)
        where b.BILL_DATE between '2025-10-01' and '2026-10-27' group by 1,2 order by 1`),
      querySnowflake(`select REFERENCE, COUNTERPARTY, AMOUNT, DETAIL from ${FIN}.V_CLOSE_EXCEPTIONS where EXCEPTION_TYPE = 'Possible duplicate vendor bill'`),
      querySnowflake(`select BILL_ID, VENDOR_NAME, VENDOR_CATEGORY, BILL_DATE, DUE_DATE, OPEN_AMOUNT, DUE_BUCKET
        from ${FIN}.V_AP_AGING where DUE_DATE <= '2026-11-26' order by DUE_DATE limit 15`),
    ])
    const k = kpi[0]
    const cats = [...new Set(spend.map((r) => r.CATEGORY))]
    const top = cats.map((c) => ({ c, t: spend.filter((r) => r.CATEGORY === c).reduce((s, r) => s + Number(r.AMT), 0) })).sort((a, b) => b.t - a.t).slice(0, 5).map((x) => x.c)
    const months = [...new Set(spend.map((r) => r.MONTH))]
    const spendData = months.map((m) => {
      const row: Record<string, any> = { MONTH: m }
      for (const r of spend.filter((x) => x.MONTH === m)) {
        const key = top.includes(r.CATEGORY) ? r.CATEGORY : "Other"
        row[key] = (row[key] ?? 0) + Number(r.AMT)
      }
      return row
    })

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Procure to pay" title="Accounts payable" description="Open vendor bills, upcoming payments and spend as of Oct 27, 2026"
          actions={<Button asChild variant="outline"><Link href={`/chat?q=${encodeURIComponent("Which vendors drove the change in spend in September 2026 versus August, and are there any duplicate bills?")}`}>Explain vendor spend</Link></Button>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open AP" value={usd(k.OPEN_AP)} hint={`${k.BILLS} open bills`} icon={Receipt} />
          <StatCard label="Overdue" value={usd(k.OVERDUE)} icon={AlarmClock} />
          <StatCard label="Cash out next 30 days" value={usd(k.NEXT30)} hint="Overdue + due by Nov 26" icon={CalendarClock} />
          <StatCard label="Possible duplicates" value={String(dupes.length)} hint={dupes.length ? usd(dupes.reduce((s, d) => s + Number(d.AMOUNT), 0)) + " at risk" : "None"} icon={Copy} />
        </div>
        {dupes.length > 0 && (
          <Section title="Duplicate bill check" description="Same vendor and vendor invoice number posted more than once" flush>
            <Table>
              <TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead numeric>Amount</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>{dupes.map((d) => (
                <TableRow key={d.REFERENCE}><TableCell className="font-mono text-xs">{d.REFERENCE}</TableCell><TableCell>{d.COUNTERPARTY}</TableCell><TableCell numeric>{usd(d.AMOUNT, 2)}</TableCell><TableCell className="text-muted-foreground">{d.DETAIL}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          </Section>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Monthly vendor spend by category" description="Bills posted, last 13 months">
            <BarSeriesChart data={spendData} x="MONTH" stacked height={300} series={[...top, "Other"].map((key) => ({ key }))} />
          </Section>
          <Section title="Open AP by vendor and due date">
            <BarSeriesChart data={plain(byVendor)} x="VENDOR_NAME" horizontal stacked height={300} series={DUE.map((key) => ({ key }))} />
          </Section>
        </div>
        <Section title="Payment run — due through Nov 26" flush>
          {upcoming.length === 0 ? <EmptyState title="Nothing due" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead>Category</TableHead><TableHead>Billed</TableHead><TableHead>Due</TableHead><TableHead numeric>Open</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{upcoming.map((r) => (
                <TableRow key={r.BILL_ID}>
                  <TableCell className="font-mono text-xs">{r.BILL_ID}</TableCell><TableCell>{r.VENDOR_NAME}</TableCell>
                  <TableCell className="text-muted-foreground">{r.VENDOR_CATEGORY}</TableCell><TableCell>{formatDate(r.BILL_DATE)}</TableCell>
                  <TableCell>{formatDate(r.DUE_DATE)}</TableCell><TableCell numeric>{usd(r.OPEN_AMOUNT, 2)}</TableCell>
                  <TableCell><Badge variant={r.DUE_BUCKET === "Overdue" ? "destructive" : "secondary"}>{r.DUE_BUCKET}</Badge></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </Section>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[ap]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load payables" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
