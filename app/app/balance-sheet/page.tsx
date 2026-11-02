import { querySnowflake } from "@/lib/snowflake"
import { FIN } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineSeriesChart } from "@/components/finance/charts"
import { PAGE, Section } from "@/components/finance/section"
import { PeriodPicker } from "@/components/finance/period-picker"
import { Scale, Droplets, Landmark, Timer } from "lucide-react"

export const dynamic = "force-dynamic"

const CATS = ["Current Assets", "Non-Current Assets", "Current Liabilities", "Equity"]

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ period?: string; entity?: string }> }) {
  const sp = await searchParams
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : "2026-09"
  const entity = ["US01", "BE01", "IE01"].includes(sp.entity ?? "") ? sp.entity! : "ALL"
  const start = `${period}-01`
  try {
    const [periods, lines, wc, recon] = await Promise.all([
      querySnowflake(`select PERIOD_NAME from ${FIN}.DIM_PERIOD order by 1 desc`),
      querySnowflake(`
        select CATEGORY, ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, min(SORT_ORDER) SORT_ORDER,
          sum(iff(FISCAL_PERIOD = ?::date, BALANCE, 0)) CUR,
          sum(iff(FISCAL_PERIOD = dateadd(month, -1, ?::date), BALANCE, 0)) PRIOR,
          sum(iff(FISCAL_PERIOD = dateadd(month, -12, ?::date), BALANCE, 0)) PY
        from ${FIN}.V_BALANCE_SHEET where (? = 'ALL' or ENTITY_ID = ?)
        group by 1,2,3,4 order by SORT_ORDER`, { binds: [start, start, start, entity, entity] }),
      querySnowflake(`select PERIOD_NAME, round(CASH_BALANCE) "Cash", round(AR_BALANCE) "Receivables", round(AP_BALANCE) "Payables", DSO_DAYS, DPO_DAYS
        from ${FIN}.V_WORKING_CAPITAL where FISCAL_PERIOD between '2025-01-01' and ?::date order by FISCAL_PERIOD`, { binds: [start] }),
      querySnowflake(`select * from ${FIN}.V_SUBLEDGER_RECON order by LEDGER, ENTITY_ID`),
    ])
    const sum = (f: (r: Record<string, any>) => boolean, k = "CUR") => lines.filter(f).reduce((s, r) => s + Number(r[k]), 0)
    const assets = sum((r) => r.ACCOUNT_TYPE === "Asset")
    const le = sum((r) => r.ACCOUNT_TYPE !== "Asset")
    const curA = sum((r) => r.CATEGORY === "Current Assets")
    const curL = sum((r) => r.CATEGORY === "Current Liabilities")
    const last = wc[wc.length - 1] ?? {}

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Reporting" title="Balance sheet" description={`${entity === "ALL" ? "Consolidated" : entity} · period end ${period}`}
          actions={<PeriodPicker periods={periods.map((p) => p.PERIOD_NAME)} period={period} entity={entity} />} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total assets" value={usd(assets)} hint={Math.abs(assets - le) < 1 ? "Balanced ✓" : `Out of balance ${usd(assets - le)}`} icon={Scale} />
          <StatCard label="Current ratio" value={curL ? (curA / curL).toFixed(1) + "x" : "—"} hint="Current assets / current liabilities" icon={Droplets} />
          <StatCard label="DSO" value={`${last.DSO_DAYS ?? "—"} days`} hint="Consolidated, month end" icon={Timer} />
          <StatCard label="DPO" value={`${last.DPO_DAYS ?? "—"} days`} hint="Consolidated, month end" icon={Landmark} />
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <Section className="lg:col-span-3" title="Statement of financial position" flush>
            {lines.length === 0 ? <EmptyState title="No balances" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead numeric>{period}</TableHead><TableHead numeric>Prior month</TableHead><TableHead numeric>Change</TableHead><TableHead numeric>Prior year</TableHead></TableRow></TableHeader>
                <TableBody>
                  {CATS.map((cat) => {
                    const rows = lines.filter((l) => l.CATEGORY === cat)
                    return [
                      <TableRow key={cat} className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={5} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</TableCell></TableRow>,
                      ...rows.map((r) => (
                        <TableRow key={r.ACCOUNT_ID}>
                          <TableCell className="pl-6">{r.ACCOUNT_NAME}</TableCell>
                          <TableCell numeric>{usd(r.CUR)}</TableCell>
                          <TableCell numeric className="text-muted-foreground">{usd(r.PRIOR)}</TableCell>
                          <TableCell numeric>{usd(Number(r.CUR) - Number(r.PRIOR))}</TableCell>
                          <TableCell numeric>{usd(r.PY)}</TableCell>
                        </TableRow>
                      )),
                    ]
                  })}
                  <TableRow className="border-t-2 font-semibold"><TableCell>Total assets</TableCell><TableCell numeric>{usd(assets)}</TableCell><TableCell numeric>{usd(sum((r) => r.ACCOUNT_TYPE === "Asset", "PRIOR"))}</TableCell><TableCell /><TableCell numeric>{usd(sum((r) => r.ACCOUNT_TYPE === "Asset", "PY"))}</TableCell></TableRow>
                  <TableRow className="font-semibold"><TableCell>Total liabilities & equity</TableCell><TableCell numeric>{usd(le)}</TableCell><TableCell numeric>{usd(sum((r) => r.ACCOUNT_TYPE !== "Asset", "PRIOR"))}</TableCell><TableCell /><TableCell numeric>{usd(sum((r) => r.ACCOUNT_TYPE !== "Asset", "PY"))}</TableCell></TableRow>
                </TableBody>
              </Table>
            )}
          </Section>
          <div className="space-y-6 lg:col-span-2">
            <Section title="Working capital trend">
              <LineSeriesChart data={plain(wc)} x="PERIOD_NAME" height={240} series={[{ key: "Receivables" }, { key: "Payables" }]} />
            </Section>
            <Section title="Sub-ledger to GL reconciliation" description="Current balances, all periods" flush>
              <Table>
                <TableHeader><TableRow><TableHead>Ledger</TableHead><TableHead numeric>Sub-ledger</TableHead><TableHead numeric>GL</TableHead><TableHead numeric>Diff</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recon.map((r) => (
                    <TableRow key={r.LEDGER + r.ENTITY_ID}>
                      <TableCell>{r.LEDGER} · {r.ENTITY_ID}</TableCell>
                      <TableCell numeric>{usd(r.SUBLEDGER_BALANCE)}</TableCell>
                      <TableCell numeric>{usd(r.GL_BALANCE)}</TableCell>
                      <TableCell numeric>{Math.abs(Number(r.DIFFERENCE)) < 1 ? <Badge variant="success">Tied</Badge> : <Badge variant="destructive">{usd(r.DIFFERENCE, 2)}</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </div>
        </div>
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[balance-sheet]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load balance sheet" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
