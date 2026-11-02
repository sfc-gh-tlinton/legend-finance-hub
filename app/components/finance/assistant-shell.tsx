"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, Maximize2, PanelRightClose, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chat } from "@/components/finance/chat"
import { useAssistant } from "@/components/finance/assistant-context"
import { cn } from "@/lib/utils"

/** Page content on the left, Assistant panel docked on the right (hidden on the full /chat page). */
export function AssistantShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen, clear, msgs, busy } = useAssistant()
  const path = usePathname()
  const showPanel = path !== "/chat"

  return (
    <div className="flex w-full">
      <div className="min-w-0 flex-1">{children}</div>
      {showPanel && open && (
        <>
          {/* mobile backdrop */}
          <button aria-label="Close assistant" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
          <aside
            className={cn(
              "z-50 flex flex-col border-l bg-background",
              "fixed inset-y-0 right-0 w-[min(100vw,420px)] animate-in slide-in-from-right-4 motion-reduce:animate-none",
              "lg:sticky lg:top-[97px] lg:z-30 lg:h-[calc(100vh-97px)] lg:w-[400px] lg:shrink-0 lg:animate-none",
            )}
            aria-label="Legend Finance Assistant"
          >
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Legend Finance Assistant</p>
                <p className="truncate text-[11px] text-muted-foreground">Cortex Agent · LEGEND_FINANCE_SV</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clear} disabled={busy || msgs.length === 0} aria-label="Clear conversation" title="Clear conversation"><Trash2 className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Open full screen"><Link href="/chat" aria-label="Open full screen"><Maximize2 className="h-4 w-4" /></Link></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Hide assistant" title="Hide assistant"><PanelRightClose className="h-4 w-4" /></Button>
            </div>
            <div className="min-h-0 flex-1"><Chat compact /></div>
          </aside>
        </>
      )}
      {showPanel && !open && (
        <Button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 h-11 gap-2 rounded-full px-4 shadow-lg">
          <Sparkles className="h-4 w-4" /> Ask the Assistant
        </Button>
      )}
    </div>
  )
}
