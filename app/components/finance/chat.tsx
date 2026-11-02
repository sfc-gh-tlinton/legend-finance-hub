"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Bot, ChevronDown, Loader2, Send, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Markdown } from "@/components/finance/markdown"
import { useAssistant } from "@/components/finance/assistant-context"
import { formatValue } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Starter questions tuned to the page the user is looking at. */
const SUGGESTIONS: Record<string, string[]> = {
  "/": [
    "What drove the change in net income from August to September 2026?",
    "What exceptions are blocking the October close?",
    "Summarize Legend's financial position at the end of September 2026",
  ],
  "/income-statement": [
    "Why was R&D over budget in September 2026?",
    "Which expense lines grew fastest year over year?",
    "Explain the GL anomalies in September 2026",
  ],
  "/balance-sheet": [
    "Why did cash change from August to September 2026?",
    "How has DSO trended in 2026 and why?",
    "Why doesn't the AR sub-ledger tie to the GL?",
  ],
  "/ar": [
    "Which customers have the most past-due AR and why is it growing?",
    "Is Janssen-Cilag paying later than its terms? Since when?",
    "Which open invoices should collections prioritize?",
  ],
  "/ap": [
    "Which vendors drove the change in spend in September 2026 versus August?",
    "Are there any duplicate vendor bills?",
    "What do we owe in the next 30 days by vendor?",
  ],
  "/close": [
    "What exceptions are blocking the October close?",
    "Which close tasks are still manual Excel work and how many hours do they take?",
    "How has our days-to-close improved since moving to Snowflake?",
  ],
  "/profit-split": [
    "Show Carvykti profit split to Legend by region for 2026",
    "How has Carvykti pre-tax margin trended in 2026?",
    "Which region grew Carvykti net sales the most year over year?",
  ],
  "/scenarios": [
    "What happens to our cash by Sep 2027 if Janssen-Cilag keeps paying 50 days late and R&D rises 20%?",
    "What is Legend's FY2027 Carvykti profit share if US growth slows to 10%?",
    "How much would a 6-month slip in the $25M milestone hurt our cash low point?",
  ],
  "/finops": [
    "Which business units drove Snowflake spend last month and how much is untagged?",
    "Which warehouses grew the most since June 2026?",
    "Which business units are over their Snowflake budget?",
  ],
}
const ALL = Object.values(SUGGESTIONS).flat()

export function Chat({ compact = false }: { compact?: boolean }) {
  const { msgs, busy, send } = useAssistant()
  const path = usePathname()
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  const suggestions = path === "/chat" ? [...new Set(ALL)].slice(0, 8) : SUGGESTIONS[path] ?? SUGGESTIONS["/"]
  const submit = (q: string) => { send(q); setInput("") }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", compact ? "h-full" : "min-h-[70vh]")}>
      <div ref={scrollRef} className={cn("min-h-0 flex-1 space-y-4", compact && "overflow-y-auto px-4 pt-4")}>
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Try asking</p>
            <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => submit(s)}
                  className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
            {m.role === "assistant" && !compact && <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>}
            <Card className={cn("min-w-0 px-3 py-2.5", compact ? "max-w-full" : "max-w-3xl px-4 py-3", m.role === "user" && "bg-primary text-primary-foreground")}>
              {m.role === "user" ? <p className="text-sm">{m.text}</p> : (
                <div className="min-w-0 space-y-3">
                  {m.status && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{m.status}</p>}
                  {m.text && <Markdown text={m.text} />}
                  {m.tables?.map((t, k) => (
                    <details key={k} className="rounded-md border text-xs">
                      <summary className="flex cursor-pointer items-center gap-1 px-3 py-2 text-muted-foreground"><ChevronDown className="h-3 w-3" /> Result data ({t.rows.length} rows)</summary>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-muted"><tr>{t.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
                          <tbody>{t.rows.map((r, j) => <tr key={j} className="border-t">{r.map((v, x) => <td key={x} className="px-2 py-1 tabular-nums">{formatValue(v)}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                  {m.sql?.map((s, k) => (
                    <details key={k} className="rounded-md border text-xs">
                      <summary className="cursor-pointer px-3 py-2 text-muted-foreground">SQL generated by Cortex Analyst</summary>
                      <pre className="overflow-x-auto whitespace-pre-wrap bg-muted/40 p-3 font-mono">{s}</pre>
                    </details>
                  ))}
                  {m.error && <p className="text-sm text-destructive">{m.error}</p>}
                </div>
              )}
            </Card>
            {m.role === "user" && !compact && <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted"><User className="h-4 w-4" /></span>}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(input) }}
        className={cn("flex gap-2 rounded-xl border bg-background p-2", compact ? "mx-4 mb-4" : "sticky bottom-4 shadow-sm")}>
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
          placeholder={compact ? "Ask about this page…" : "Ask about P&L, balance sheet, AR/AP, close, profit split or Snowflake spend…"}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" aria-label="Message" />
        <Button type="submit" disabled={busy || !input.trim()} size="sm" aria-label="Send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </form>
    </div>
  )
}
