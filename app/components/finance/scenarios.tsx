"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Banknote, Handshake, Loader2, Save, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { BarSeriesChart, LineSeriesChart } from "@/components/finance/charts"
import { Section } from "@/components/finance/section"
import { usd } from "@/lib/money"
import { cn } from "@/lib/utils"

type Row = Record<string, any>
type Saved = { SCENARIO_ID: string; SCENARIO_TYPE: string; NAME: string; DESCRIPTION: string; PARAMS: Record<string, number | null> }

const fetchJson = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

function Slider({ label, value, onChange, min, max, step = 1, suffix, hint }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix: string; hint?: string
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-primary">{value > 0 && suffix !== " days" && suffix !== " mo" ? "+" : ""}{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]" aria-label={label} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </label>
  )
}

function SavedPicker({ type, saved, onPick }: { type: string; saved: Saved[]; onPick: (p: Saved["PARAMS"]) => void }) {
  const list = saved.filter((s) => s.SCENARIO_TYPE === type)
  if (list.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((s) => (
        <button key={s.SCENARIO_ID} onClick={() => onPick(s.PARAMS)} title={s.DESCRIPTION}
          className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-primary/5">
          {s.NAME}
        </button>
      ))}
    </div>
  )
}

function SaveButton({ type, params, onSaved }: { type: string; params: object; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  async function save() {
    const name = window.prompt("Name this scenario")
    if (!name) return
    setBusy(true)
    const r = await fetch("/api/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name, params }) })
    setBusy(false)
    setMsg(r.ok ? "Saved" : "Save failed")
    if (r.ok) onSaved()
    setTimeout(() => setMsg(""), 2500)
  }
  return (
    <Button variant="outline" size="sm" onClick={save} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {msg || "Save scenario"}
    </Button>
  )
}

function Delta({ v }: { v: number }) {
  return <span className={cn(v >= 0 ? "text-success" : "text-destructive")}>{v >= 0 ? "+" : ""}{usd(v)} vs base</span>
}

/* ------------------------------------------------------------------ cash runway */
function CashRunway({ saved, refresh }: { saved: Saved[]; refresh: () => void }) {
  const [p, setP] = useState({ janssenDelay: 0, rdChange: 0, milestoneDelay: 0, growthAdj: 0 })
  const qs = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)]))
  const { data, error, isPending, isFetching } = useQuery<Row[]>({
    queryKey: ["cash", p], queryFn: () => fetchJson(`/api/scenarios?type=cash&${qs}`), placeholderData: (prev) => prev,
  })
  const last = data?.[data.length - 1]
  const min = data?.reduce((a, r) => (r.SCEN_ENDING_CASH < a.SCEN_ENDING_CASH ? r : a), data[0])
  const chart = data?.map((r) => ({ MONTH: r.MONTH_NAME, "Base case": Math.round(r.BASE_ENDING_CASH), Scenario: Math.round(r.SCEN_ENDING_CASH) })) ?? []
  const flows = data?.map((r) => ({ MONTH: r.MONTH_NAME, "Base net flow": Math.round(r.BASE_INFLOW - r.BASE_OUTFLOW), "Scenario net flow": Math.round(r.SCEN_INFLOW - r.SCEN_OUTFLOW) })) ?? []
  const question = `Using the cash runway what-if with Janssen payment delay ${p.janssenDelay} days, R&D spend change ${p.rdChange}%, milestone delay ${p.milestoneDelay} months and revenue growth adjustment ${p.growthAdj}pp, explain what happens to cash through Sep 2027 versus base, what drives the gap, and what actions finance should consider.`

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Section title="Cash runway levers" description="Oct 2026 – Sep 2027, from Jul–Sep 2026 run-rate"
        actions={<SaveButton type="CASH_RUNWAY" params={p} onSaved={refresh} />}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="sm:col-span-2 xl:col-span-1"><SavedPicker type="CASH_RUNWAY" saved={saved} onPick={(x) => setP({ janssenDelay: Number(x.janssenDelay ?? 0), rdChange: Number(x.rdChange ?? 0), milestoneDelay: Number(x.milestoneDelay ?? 0), growthAdj: Number(x.growthAdj ?? 0) })} /></div>
          <Slider label="Janssen payment delay" value={p.janssenDelay} onChange={(v) => setP({ ...p, janssenDelay: v })} min={0} max={120} step={5} suffix=" days" hint="Extra days beyond current collaboration-partner payment behavior" />
          <Slider label="R&D / CRO spend" value={p.rdChange} onChange={(v) => setP({ ...p, rdChange: v })} min={-30} max={60} step={5} suffix="%" hint="ICON, IQVIA, Charles River, WuXi payments" />
          <Slider label="$25M milestone slip" value={p.milestoneDelay} onChange={(v) => setP({ ...p, milestoneDelay: v })} min={0} max={10} suffix=" mo" hint="Base: received Nov 2026" />
          <Slider label="Revenue growth" value={p.growthAdj} onChange={(v) => setP({ ...p, growthAdj: v })} min={-30} max={30} step={5} suffix="pp" hint="Change to annual growth rate" />
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <Button size="sm" asChild><Link href={`/chat?q=${encodeURIComponent(question)}`}><Sparkles className="h-4 w-4" /> Explain with Assistant</Link></Button>
            <Button size="sm" variant="ghost" onClick={() => setP({ janssenDelay: 0, rdChange: 0, milestoneDelay: 0, growthAdj: 0 })}>Reset</Button>
          </div>
        </div>
      </Section>
      <div className="min-w-0 space-y-6 xl:col-span-2">
        {error ? <EmptyState variant="error" title="Scenario failed" description={(error as Error).message} /> : isPending ? (
          <Skeleton className="h-[420px] w-full" />
        ) : (
          <>
            <div className={cn("grid gap-4 sm:grid-cols-3 transition-opacity", isFetching && "opacity-60")}>
              <StatCard label="Cash · Sep 2027" value={usd(last!.SCEN_ENDING_CASH)} hint={<Delta v={last!.SCEN_ENDING_CASH - last!.BASE_ENDING_CASH} />} icon={Banknote} />
              <StatCard label="Lowest month-end cash" value={usd(min!.SCEN_ENDING_CASH)} hint={min!.MONTH_NAME} icon={TrendingDown} />
              <StatCard label="12-month net cash flow" value={usd(data!.reduce((s, r) => s + r.SCEN_INFLOW - r.SCEN_OUTFLOW, 0))} hint={`Base ${usd(data!.reduce((s, r) => s + r.BASE_INFLOW - r.BASE_OUTFLOW, 0))}`} icon={TrendingUp} />
            </div>
            <Section title="Month-end cash: base vs scenario">
              <LineSeriesChart data={chart} x="MONTH" height={260} series={[{ key: "Base case" }, { key: "Scenario" }]} yDomain={["auto", "auto"]} />
            </Section>
            <Section title="Monthly net cash flow">
              <BarSeriesChart data={flows} x="MONTH" height={220} series={[{ key: "Base net flow" }, { key: "Scenario net flow" }]} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ profit split */
function ProfitSplit({ saved, refresh }: { saved: Saved[]; refresh: () => void }) {
  // null growth = keep the region's trailing YoY growth
  const [p, setP] = useState<{ us: number | null; eu: number | null; row: number | null; cogs: number; comm: number }>({ us: null, eu: null, row: null, cogs: 0, comm: 0 })
  const qs = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, v === null ? "" : String(v)]))
  const { data, error, isPending, isFetching } = useQuery<Row[]>({
    queryKey: ["profit", p], queryFn: () => fetchJson(`/api/scenarios?type=profit&${qs}`), placeholderData: (prev) => prev,
  })
  const fy = (k: string) => (data ?? []).filter((r) => r.MONTH_NAME.startsWith("2027")).reduce((s, r) => s + Number(r[k]), 0)
  const months = [...new Set((data ?? []).map((r) => r.MONTH_NAME))]
  const chart = months.map((m) => {
    const rs = (data ?? []).filter((r) => r.MONTH_NAME === m)
    return { MONTH: m, "Base Legend share": Math.round(rs.reduce((s, r) => s + r.BASE_LEGEND_SHARE, 0)), "Scenario Legend share": Math.round(rs.reduce((s, r) => s + r.SCEN_LEGEND_SHARE, 0)) }
  })
  const regions = ["United States", "Europe", "Rest of World"].map((reg) => {
    const rs = (data ?? []).filter((r) => r.REGION === reg && r.MONTH_NAME.startsWith("2027"))
    return { REGION: reg, Base: Math.round(rs.reduce((s, r) => s + r.BASE_SALES, 0)), Scenario: Math.round(rs.reduce((s, r) => s + r.SCEN_SALES, 0)) }
  })
  const growthSlider = (key: "us" | "eu" | "row", label: string) => (
    <div className="space-y-1">
      <Slider label={label} value={p[key] ?? 0} onChange={(v) => setP({ ...p, [key]: v })} min={-20} max={100} step={5} suffix="%"
        hint={p[key] === null ? "Using trailing YoY growth (base)" : "Annual growth assumption"} />
      {p[key] !== null && <button className="text-xs text-primary hover:underline" onClick={() => setP({ ...p, [key]: null })}>Use base growth</button>}
    </div>
  )
  const question = `Using the profit split what-if with US growth ${p.us ?? "base"}%, Europe growth ${p.eu ?? "base"}%, Rest of World growth ${p.row ?? "base"}%, COGS change ${p.cogs}pp and commercial expense change ${p.comm}pp, explain Legend's FY2027 Carvykti profit share versus base and which region drives the difference.`

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Section title="Carvykti levers" description="Q4 2026 – FY2027 · 50/50 with Janssen"
        actions={<SaveButton type="PROFIT_SPLIT" params={p} onSaved={refresh} />}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="sm:col-span-2 xl:col-span-1"><SavedPicker type="PROFIT_SPLIT" saved={saved} onPick={(x) => setP({ us: x.us ?? null, eu: x.eu ?? null, row: x.row ?? null, cogs: Number(x.cogs ?? 0), comm: Number(x.comm ?? 0) })} /></div>
          {growthSlider("us", "US net sales growth")}
          {growthSlider("eu", "Europe net sales growth")}
          {growthSlider("row", "Rest of World growth")}
          <Slider label="COGS" value={p.cogs} onChange={(v) => setP({ ...p, cogs: v })} min={-5} max={8} step={0.5} suffix="pp" hint="Change in COGS as % of sales (base ≈ 26%)" />
          <Slider label="Commercial expense" value={p.comm} onChange={(v) => setP({ ...p, comm: v })} min={-5} max={8} step={0.5} suffix="pp" hint="Change as % of sales (base ≈ 20%)" />
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <Button size="sm" asChild><Link href={`/chat?q=${encodeURIComponent(question)}`}><Sparkles className="h-4 w-4" /> Explain with Assistant</Link></Button>
            <Button size="sm" variant="ghost" onClick={() => setP({ us: null, eu: null, row: null, cogs: 0, comm: 0 })}>Reset</Button>
          </div>
        </div>
      </Section>
      <div className="min-w-0 space-y-6 xl:col-span-2">
        {error ? <EmptyState variant="error" title="Scenario failed" description={(error as Error).message} /> : isPending ? (
          <Skeleton className="h-[420px] w-full" />
        ) : (
          <>
            <div className={cn("grid gap-4 sm:grid-cols-3 transition-opacity", isFetching && "opacity-60")}>
              <StatCard label="FY2027 Carvykti net sales" value={usd(fy("SCEN_SALES"))} hint={<Delta v={fy("SCEN_SALES") - fy("BASE_SALES")} />} icon={TrendingUp} />
              <StatCard label="FY2027 Legend profit share" value={usd(fy("SCEN_LEGEND_SHARE"))} hint={<Delta v={fy("SCEN_LEGEND_SHARE") - fy("BASE_LEGEND_SHARE")} />} icon={Handshake} />
              <StatCard label="FY2027 pre-tax margin" value={`${((fy("SCEN_PRETAX") / fy("SCEN_SALES")) * 100).toFixed(1)}%`} hint={`Base ${((fy("BASE_PRETAX") / fy("BASE_SALES")) * 100).toFixed(1)}%`} icon={Banknote} />
            </div>
            <Section title="Legend monthly profit share: base vs scenario">
              <LineSeriesChart data={chart} x="MONTH" height={260} series={[{ key: "Base Legend share" }, { key: "Scenario Legend share" }]} yDomain={["auto", "auto"]} />
            </Section>
            <Section title="FY2027 net sales by region">
              <BarSeriesChart data={regions} x="REGION" height={220} series={[{ key: "Base" }, { key: "Scenario" }]} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

export function ScenarioWorkbench() {
  const [tab, setTab] = useState<"cash" | "profit">("cash")
  const qc = useQueryClient()
  const { data: saved = [] } = useQuery<Saved[]>({ queryKey: ["saved-scenarios"], queryFn: () => fetchJson("/api/scenarios?type=saved") })
  const refresh = () => qc.invalidateQueries({ queryKey: ["saved-scenarios"] })
  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border p-1">
        {([["cash", "Cash runway"], ["profit", "Carvykti profit split"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "cash" ? <CashRunway saved={saved} refresh={refresh} /> : <ProfitSplit saved={saved} refresh={refresh} />}
      <div className="text-xs text-muted-foreground">
        Calculated live in Snowflake by <Badge variant="outline" className="font-mono">CASH_RUNWAY_SCENARIO</Badge> and{" "}
        <Badge variant="outline" className="font-mono">PROFIT_SPLIT_SCENARIO</Badge>. The Assistant uses the same functions as tools.
      </div>
    </div>
  )
}
