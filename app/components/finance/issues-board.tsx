"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Clock, Loader2, Mail, MessageSquare, ShieldCheck, Sparkles, UserRound, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/empty-state"
import { formatDate, formatDateTime } from "@/lib/format"
import { usd } from "@/lib/money"
import { cn } from "@/lib/utils"

type Issue = Record<string, any>
type Owner = { OWNER: string; FULL_NAME: string; TITLE: string; IS_APPROVER: boolean }

/** What the owner can propose for each fix type. Executed only after Controller/CFO approval. */
const FIX_OPTIONS: Record<string, { option: string; label: string; hint: string }[]> = {
  POST_AR_INVOICE: [{ option: "POST_AR_INVOICE", label: "Post correcting journal", hint: "Dr 1100 Accounts Receivable / Cr revenue for the missing invoice" }],
  VOID_DUPLICATE_BILL: [{ option: "VOID_DUPLICATE_BILL", label: "Void duplicate & block payment", hint: "Marks the bill Void and posts a GL reversal in October" }],
  REVIEW_JOURNAL: [
    { option: "ACCEPT", label: "Accept — support on file", hint: "Records the review; journal stays posted" },
    { option: "REVERSE", label: "Reverse in October", hint: "Posts a reversing journal dated Oct 27, 2026" },
  ],
  CONFIRM_PROFIT_SPLIT: [{ option: "CONFIRM_PROFIT_SPLIT", label: "Mark profit split Final", hint: "After Janssen confirms the calculation" }],
  SEND_COLLECTIONS: [{ option: "SEND_COLLECTIONS", label: "Send collections notice", hint: "Emails a collections follow-up and closes the issue" }],
  INVESTIGATE: [],
}

const STATUS_VARIANT: Record<string, "destructive" | "warning" | "secondary" | "success" | "outline"> = {
  Open: "destructive", "Pending Approval": "warning", Resolved: "success",
}

const fetchJson = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

function usePersona(owners: Owner[]) {
  const [persona, setPersona] = useState("CONTROLLER")
  useEffect(() => { const p = localStorage.getItem("close-persona"); if (p) setPersona(p) }, [])
  const set = (p: string) => { setPersona(p); localStorage.setItem("close-persona", p) }
  const me = owners.find((o) => o.OWNER === persona)
  return { persona, setPersona: set, isApprover: !!me?.IS_APPROVER }
}

function IssueDrawer({ issue, persona, isApprover, onClose, onChanged }: {
  issue: Issue | null; persona: string; isApprover: boolean; onClose: () => void; onChanged: () => void
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<{ subject: string; body: string; to: string } | null>(null)
  const [sent, setSent] = useState(false)
  const events = useQuery<{ EVENT_AT: string; ACTOR: string; EVENT_TYPE: string; MESSAGE: string }[]>({
    queryKey: ["issue-events", issue?.ISSUE_ID, issue?.STATUS], enabled: !!issue,
    queryFn: () => fetchJson(`/api/close/issues?id=${encodeURIComponent(issue!.ISSUE_ID)}`),
  })
  useEffect(() => { setNote(""); setError(""); setDraft(null); setSent(false) }, [issue?.ISSUE_ID])

  async function act(action: string, option?: string) {
    setBusy(action + (option ?? "")); setError("")
    const r = await fetch("/api/close/issues", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: issue!.ISSUE_ID, action, actor: persona, note, option }) })
    const j = await r.json()
    setBusy("")
    if (!r.ok || !j.ok) { setError(j.error ?? "Action failed"); return }
    setNote("")
    onChanged()
  }
  async function draftEmail() {
    setBusy("draft"); setError("")
    const r = await fetch("/api/close/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId: issue!.ISSUE_ID }) })
    const j = await r.json()
    setBusy("")
    if (!r.ok) setError(j.error ?? "Draft failed"); else setDraft(j)
  }
  async function sendEmail() {
    setBusy("send")
    const r = await fetch("/api/close/email", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: issue!.ISSUE_ID, subject: draft!.subject, body: draft!.body, actor: persona, send: true }) })
    setBusy("")
    if (r.ok) { setSent(true); events.refetch() } else setError((await r.json()).error ?? "Send failed")
  }

  if (!issue) return null
  const fixes = FIX_OPTIONS[issue.FIX_ACTION] ?? []
  const resolved = issue.STATUS === "Resolved"
  const pending = issue.STATUS === "Pending Approval"
  const isOwner = persona === issue.OWNER

  return (
    <Sheet open={!!issue} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant={issue.SEVERITY === "High" ? "destructive" : "warning"}>{issue.SEVERITY}</Badge>
            <Badge variant={STATUS_VARIANT[issue.STATUS] ?? "outline"}>{issue.STATUS}</Badge>
            <Badge variant="outline" className="font-mono">{issue.RULE_ID} · {issue.TASK_CODE}</Badge>
          </div>
          <SheetTitle>{issue.TITLE}</SheetTitle>
          <SheetDescription>{issue.DETAIL}</SheetDescription>
        </SheetHeader>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="font-mono text-xs">{issue.REFERENCE}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Counterparty</dt><dd>{issue.COUNTERPARTY}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="tabular-nums">{issue.AMOUNT == null ? "—" : usd(issue.AMOUNT, 2)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Due (SLA)</dt><dd>{formatDate(issue.SLA_DUE)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{issue.OWNER_NAME} <span className="text-xs text-muted-foreground">({issue.OWNER})</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">Approver</dt><dd>{issue.APPROVER}</dd></div>
        </dl>

        {resolved ? (
          <div className="mt-5 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Resolved by {issue.RESOLVED_BY}</p>
            <p className="mt-1 text-muted-foreground">{issue.RESOLUTION}</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder={pending ? "Approval or rejection comment…" : "Explanation / support for the fix…"}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />

            {pending ? (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm"><b>{issue.PROPOSED_BY}</b> proposed <b>{issue.PROPOSED_OPTION}</b>{issue.PROPOSAL_NOTE ? `: ${issue.PROPOSAL_NOTE}` : ""}</p>
                {isApprover ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => act("APPROVE")} disabled={!!busy}>{busy === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve & apply fix</Button>
                    <Button size="sm" variant="outline" onClick={() => act("REJECT")} disabled={!!busy}><XCircle className="h-4 w-4" /> Reject</Button>
                  </div>
                ) : <p className="mt-2 text-xs text-muted-foreground">Waiting for Controller / CFO approval. Switch “Acting as” to an approver to approve.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {fixes.map((f) => (
                  <button key={f.option} disabled={!!busy} onClick={() => act("PROPOSE", f.option)}
                    className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50">
                    {busy === "PROPOSE" + f.option ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <Sparkles className="mt-0.5 h-4 w-4 text-primary" />}
                    <span><span className="block text-sm font-medium">Propose: {f.label}</span><span className="text-xs text-muted-foreground">{f.hint} · needs approval</span></span>
                  </button>
                ))}
                {(issue.FIX_ACTION === "INVESTIGATE" || isApprover) && (
                  <Button size="sm" variant="outline" onClick={() => act("RESOLVE")} disabled={!!busy || !note.trim()}>
                    <CheckCircle2 className="h-4 w-4" /> Resolve with explanation
                  </Button>
                )}
                {!isOwner && !isApprover && <p className="text-xs text-muted-foreground">You are acting as {persona}; this issue is owned by {issue.OWNER}.</p>}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => act("COMMENT")} disabled={!!busy || !note.trim()}><MessageSquare className="h-4 w-4" /> Add comment</Button>
              <Button size="sm" variant="ghost" onClick={draftEmail} disabled={!!busy}>{busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Draft email to owner</Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/chat?q=${encodeURIComponent(`Investigate close issue ${issue.REFERENCE} (${issue.TITLE}): ${issue.DETAIL}. What is the root cause and what should ${issue.OWNER} do?`)}`}><Sparkles className="h-4 w-4" /> Ask Assistant</a>
              </Button>
            </div>
          </div>
        )}

        {draft && (
          <div className="mt-4 space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">To: {draft.to} · drafted by Legend Finance Assistant</p>
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-medium" aria-label="Subject" />
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={9} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" aria-label="Body" />
            <Button size="sm" onClick={sendEmail} disabled={!!busy || sent}>{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {sent ? "Sent" : "Send via Snowflake"}</Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit trail</p>
          {events.isPending ? <Skeleton className="h-20 w-full" /> : (
            <ol className="space-y-2 border-l pl-4">
              {(events.data ?? []).map((e, i) => (
                <li key={i} className="text-xs">
                  <p><span className="font-medium">{e.EVENT_TYPE}</span> · {e.ACTOR} · <span className="text-muted-foreground">{formatDateTime(e.EVENT_AT)}</span></p>
                  <p className="text-muted-foreground">{e.MESSAGE}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function IssuesBoard() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data, error, isPending } = useQuery<{ issues: Issue[]; owners: Owner[] }>({ queryKey: ["close-issues"], queryFn: () => fetchJson("/api/close/issues") })
  const owners = data?.owners ?? []
  const { persona, setPersona, isApprover } = usePersona(owners)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"open" | "mine" | "approval" | "all">("open")

  // other components (close agent) dispatch this after a run
  useEffect(() => {
    const h = () => qc.invalidateQueries({ queryKey: ["close-issues"] })
    window.addEventListener("close-issues-changed", h)
    return () => window.removeEventListener("close-issues-changed", h)
  }, [qc])

  const issues = data?.issues ?? []
  const shown = issues.filter((i) =>
    filter === "all" ? true : filter === "mine" ? i.OWNER === persona && i.STATUS !== "Resolved"
      : filter === "approval" ? i.STATUS === "Pending Approval" : i.STATUS !== "Resolved")
  const open = issues.find((i) => i.ISSUE_ID === openId) ?? null
  const counts = {
    open: issues.filter((i) => i.STATUS !== "Resolved").length,
    mine: issues.filter((i) => i.OWNER === persona && i.STATUS !== "Resolved").length,
    approval: issues.filter((i) => i.STATUS === "Pending Approval").length,
    all: issues.length,
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {([["open", "Open"], ["mine", "My issues"], ["approval", "Needs approval"], ["all", "All"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("rounded-md px-2.5 py-1", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <UserRound className="h-4 w-4 text-muted-foreground" /> Acting as
          <select value={persona} onChange={(e) => setPersona(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Acting as">
            {owners.map((o) => <option key={o.OWNER} value={o.OWNER}>{o.FULL_NAME} · {o.TITLE}{o.IS_APPROVER ? " (approver)" : ""}</option>)}
          </select>
        </label>
      </div>
      {error ? <EmptyState variant="error" title="Could not load issues" description={(error as Error).message} /> : isPending ? <Skeleton className="h-48 w-full" /> :
        shown.length === 0 ? <EmptyState title={issues.length ? "Nothing in this view" : "No issues yet"} description={issues.length ? undefined : "Run the close agent to execute the check rules."} /> : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Issue</TableHead><TableHead>Reference</TableHead><TableHead>Owner</TableHead><TableHead numeric>Amount</TableHead>
                <TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {shown.map((i) => (
                  <TableRow key={i.ISSUE_ID} className="cursor-pointer" onClick={() => setOpenId(i.ISSUE_ID)}>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", i.SEVERITY === "High" ? "bg-destructive" : "bg-warning")} aria-label={i.SEVERITY} />
                        <span className="truncate font-medium">{i.TITLE}</span>
                      </div>
                      <p className="truncate pl-4 text-xs text-muted-foreground">{i.DETAIL}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.REFERENCE}</TableCell>
                    <TableCell className="text-sm">{i.OWNER_NAME}</TableCell>
                    <TableCell numeric>{i.AMOUNT == null ? "—" : usd(i.AMOUNT)}</TableCell>
                    <TableCell className="text-sm"><span className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{formatDate(i.SLA_DUE)}</span></TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[i.STATUS] ?? "outline"}>{i.STATUS}</Badge>
                      {i.NOTIFIED_AT && i.STATUS !== "Resolved" && <Mail className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Owner emailed" />}
                    </TableCell>
                    <TableCell><Button size="sm" variant="ghost">Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      <IssueDrawer issue={open} persona={persona} isApprover={isApprover} onClose={() => setOpenId(null)}
        onChanged={() => { qc.invalidateQueries({ queryKey: ["close-issues"] }); qc.invalidateQueries({ queryKey: ["close-rules"] }); router.refresh() }} />
    </div>
  )
}
