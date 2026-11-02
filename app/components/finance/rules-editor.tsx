"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, FlaskConical, Loader2, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/empty-state"
import { usd } from "@/lib/money"
import { cn } from "@/lib/utils"

type Rule = { RULE_ID: string; TASK_CODE: string; RULE_NAME: string; DESCRIPTION: string; CHECK_SQL: string; SEVERITY: string; FIX_ACTION: string; ENABLED: boolean; OPEN_ISSUES: number; UPDATED_BY: string }

const fetchJson = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

async function update(body: object) {
  const r = await fetch("/api/close/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? "Update failed")
  return j
}

function RuleRow({ rule, onSaved }: { rule: Rule; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [sql, setSql] = useState(rule.CHECK_SQL)
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<Record<string, any>[] | null>(null)

  async function run(kind: string, body: object) {
    setBusy(kind); setMsg(null)
    try {
      const j = await update({ ruleId: rule.RULE_ID, ...body })
      if (j.findings) { setPreview(j.findings); setMsg({ ok: true, text: `${j.findings.length} finding(s) with this SQL` }) }
      else { setMsg({ ok: true, text: "Saved" }); onSaved() }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy("") }
  }

  return (
    <div className={cn("rounded-lg border", !rule.ENABLED && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
          <span className="font-mono text-xs text-muted-foreground">{rule.RULE_ID}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{rule.RULE_NAME}</span>
            <span className="block truncate text-xs text-muted-foreground">{rule.DESCRIPTION}</span>
          </span>
        </button>
        <Badge variant="outline" className="font-mono">{rule.TASK_CODE}</Badge>
        <select value={rule.SEVERITY} onChange={(e) => run("sev", { severity: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Default severity">
          <option>High</option><option>Medium</option>
        </select>
        <Badge variant="secondary" className="font-mono text-[10px]">{rule.FIX_ACTION}</Badge>
        {rule.OPEN_ISSUES > 0 && <Badge variant="destructive">{rule.OPEN_ISSUES} open</Badge>}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={rule.ENABLED} onChange={(e) => run("en", { enabled: e.target.checked })} /> Enabled
        </label>
      </div>
      {open && (
        <div className="space-y-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Must be a read-only SELECT returning <code>REFERENCE, COUNTERPARTY, AMOUNT, DETAIL, SEVERITY</code>. No rows = pass.
            Placeholders: <code>{"{{PERIOD}}"}</code>, <code>{"{{AS_OF}}"}</code>.
          </p>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={8} spellCheck={false}
            className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Rule SQL" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => run("test", { checkSql: sql, test: true })} disabled={!!busy}>
              {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Test rule
            </Button>
            <Button size="sm" onClick={() => run("save", { checkSql: sql })} disabled={!!busy || sql === rule.CHECK_SQL}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            {msg && <span className={cn("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</span>}
            <span className="ml-auto text-xs text-muted-foreground">Last changed by {rule.UPDATED_BY}</span>
          </div>
          {preview && preview.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left">Reference</th><th className="px-2 py-1 text-left">Counterparty</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1 text-left">Detail</th></tr></thead>
                <tbody>{preview.map((p, i) => <tr key={i} className="border-t"><td className="px-2 py-1 font-mono">{p.REFERENCE}</td><td className="px-2 py-1">{p.COUNTERPARTY}</td><td className="px-2 py-1 text-right tabular-nums">{p.AMOUNT == null ? "—" : usd(p.AMOUNT)}</td><td className="px-2 py-1">{p.DETAIL}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RulesEditor() {
  const qc = useQueryClient()
  const { data, error, isPending } = useQuery<Rule[]>({ queryKey: ["close-rules"], queryFn: () => fetchJson("/api/close/rules") })
  if (error) return <EmptyState variant="error" title="Could not load rules" description={(error as Error).message} />
  if (isPending) return <Skeleton className="h-64 w-full" />
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        These rules define what &ldquo;done&rdquo; means for the close. The close agent and the daily 7:00 AM ET Snowflake task run every enabled rule;
        each finding becomes an issue routed to the task owner. Edits are stored in the <code>FINANCE.CLOSE_CHECK_RULES</code> table.
      </p>
      {data!.map((r) => <RuleRow key={r.RULE_ID + r.CHECK_SQL.length} rule={r} onSaved={() => qc.invalidateQueries({ queryKey: ["close-rules"] })} />)}
    </div>
  )
}
