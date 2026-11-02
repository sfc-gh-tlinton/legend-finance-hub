"use client"

import { useState } from "react"
import { IssuesBoard } from "@/components/finance/issues-board"
import { RulesEditor } from "@/components/finance/rules-editor"
import { cn } from "@/lib/utils"

/** Issues / Checklist / Rules tabs for the close workspace. The checklist is server-rendered and passed in. */
export function CloseTabs({ checklist }: { checklist: React.ReactNode }) {
  const [tab, setTab] = useState<"issues" | "checklist" | "rules">("issues")
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-1">
        {([["issues", "Issues & approvals"], ["checklist", "Close checklist"], ["rules", "Check rules"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      <div className={tab === "issues" ? undefined : "hidden"}><IssuesBoard /></div>
      <div className={tab === "checklist" ? undefined : "hidden"}>{checklist}</div>
      {tab === "rules" && <RulesEditor />}
    </div>
  )
}
