"use client"

import { usePathname, useRouter } from "next/navigation"

const ENTITIES = [
  { id: "ALL", label: "Consolidated" },
  { id: "US01", label: "US01 · Legend USA" },
  { id: "BE01", label: "BE01 · Belgium" },
  { id: "IE01", label: "IE01 · Ireland" },
]

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PeriodPicker({ periods, period, entity }: { periods: string[]; period: string; entity?: string }) {
  const router = useRouter()
  const path = usePathname()
  const go = (p: string, e?: string) => {
    const qs = new URLSearchParams({ period: p })
    if (e) qs.set("entity", e)
    router.push(`${path}?${qs}`)
  }
  return (
    <div className="flex gap-2">
      {entity !== undefined && (
        <select aria-label="Entity" className={SELECT} value={entity} onChange={(e) => go(period, e.target.value)}>
          {ENTITIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      )}
      <select aria-label="Period" className={SELECT} value={period} onChange={(e) => go(e.target.value, entity)}>
        {periods.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  )
}
