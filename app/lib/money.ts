import { EMPTY } from "@/lib/format"

/** 12_345_678 → "$12.3M", -950_000 → "-$950K" */
export function usd(value: unknown, digits = 1): string {
  if (value === null || value === undefined || value === "") return EMPTY
  const n = Number(value)
  if (!Number.isFinite(n)) return EMPTY
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/** Normalise Snowflake DATE / Date values to "YYYY-MM-DD". */
export function isoDate(value: unknown): string {
  if (!value) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

/** Make query rows JSON/RSC-safe: Dates → ISO date strings, numeric strings stay as-is. */
export function plain<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((r) => {
    const o: Record<string, any> = {}
    for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? isoDate(v) : v
    return o as T
  })
}
