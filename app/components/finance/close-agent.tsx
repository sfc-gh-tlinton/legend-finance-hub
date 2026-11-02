"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, CheckCircle2, CircleDashed, Loader2, OctagonX, RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/finance/markdown"
import { cn } from "@/lib/utils"

type Step = { task: string; name: string; status: string; detail: string }

const ICON: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  Complete: <CheckCircle2 className="h-4 w-4 text-success" />,
  Blocked: <OctagonX className="h-4 w-4 text-destructive" />,
  "Needs Review": <TriangleAlert className="h-4 w-4 text-warning" />,
}

export function CloseAgent() {
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>([])
  const [summary, setSummary] = useState("")
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [notify, setNotify] = useState(true)

  async function run() {
    setRunning(true); setSteps([]); setSummary(""); setError("")
    try {
      const res = await fetch(`/api/close/run${notify ? "?notify=1" : ""}`, { method: "POST" })
      if (!res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const l of lines) {
          if (!l.trim()) continue
          const e = JSON.parse(l)
          if (e.type === "step") {
            setSteps((s) => {
              const idx = s.findIndex((x) => x.task === e.task)
              const next = [...s]
              if (idx >= 0) next[idx] = e; else next.push(e)
              return next
            })
            if (e.status !== "running") window.dispatchEvent(new Event("close-issues-changed"))
          } else if (e.type === "summary") setSummary(e.text)
          else if (e.type === "error") setError(e.message)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      window.dispatchEvent(new Event("close-issues-changed"))
      router.refresh()
    }
  }

  async function reset() {
    await fetch("/api/close/run", { method: "DELETE" })
    setSteps([]); setSummary(""); setError("")
    window.dispatchEvent(new Event("close-issues-changed"))
    router.refresh()
  }

  return (
    <Card className="min-w-0 border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Close agent</CardTitle>
          <CardDescription>
            Runs every enabled check rule in Snowflake, opens issues for the owners, updates the checklist, and asks the Assistant for a controller briefing.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={running} aria-label="Reset October close board"><RotateCcw className="h-4 w-4" /></Button>
          <Button onClick={run} disabled={running}>{running ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : "Run close agent"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={running} />
          Email owners about new issues (Snowflake notification integration)
        </label>
        {steps.length === 0 && !running && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDashed className="h-4 w-4" /> Not run yet for October 2026.</p>
        )}
        <ol className="space-y-2">
          {steps.map((s) => (
            <li key={s.task} className="flex gap-3 rounded-md border px-3 py-2 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
              <span className="mt-0.5 shrink-0">{ICON[s.status] ?? ICON.running}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium"><span className="mr-2 font-mono text-xs text-muted-foreground">{s.task}</span>{s.name}</p>
                <p className={cn("text-xs text-muted-foreground", s.status === "Blocked" && "text-destructive")}>{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {summary && (
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Controller briefing</p>
            <Markdown text={summary} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
