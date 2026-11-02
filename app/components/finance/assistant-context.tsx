"use client"

/**
 * Shared Assistant state: one conversation with the Cortex Agent that persists across pages,
 * rendered both in the right-hand panel and on the full /chat page.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

export type Table = { columns: string[]; rows: unknown[][] }
export type Msg = { role: "user" | "assistant"; text: string; status?: string; sql?: string[]; tables?: Table[]; error?: string }

type Ctx = {
  msgs: Msg[]
  busy: boolean
  open: boolean
  setOpen: (o: boolean) => void
  send: (text: string) => void
  clear: () => void
}

const AssistantContext = createContext<Ctx | null>(null)

export function useAssistant() {
  const c = useContext(AssistantContext)
  if (!c) throw new Error("useAssistant must be used inside AssistantProvider")
  return c
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpenState] = useState(true)
  const busyRef = useRef(false)
  const msgsRef = useRef<Msg[]>([])
  const router = useRouter()
  const path = usePathname()
  msgsRef.current = msgs

  // Open by default on wide screens; remember the user's choice.
  useEffect(() => {
    const saved = localStorage.getItem("assistant-open")
    setOpenState(saved ? saved === "1" : window.matchMedia("(min-width: 1024px)").matches)
  }, [])
  const setOpen = useCallback((o: boolean) => {
    setOpenState(o)
    localStorage.setItem("assistant-open", o ? "1" : "0")
  }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const history = [...msgsRef.current, { role: "user" as const, text }]
    setMsgs([...history, { role: "assistant", text: "", status: "Thinking…" }])
    const update = (f: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), f(all[all.length - 1])])
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text })) }),
      })
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
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text, status: undefined }))
          else if (e.type === "status") update((m) => (m.text ? m : { ...m, status: e.text }))
          else if (e.type === "sql") update((m) => ({ ...m, sql: [...(m.sql ?? []), e.sql] }))
          else if (e.type === "table") update((m) => ({ ...m, tables: [...(m.tables ?? []), { columns: e.columns, rows: e.rows }] }))
          else if (e.type === "error") update((m) => ({ ...m, error: e.message, status: undefined }))
        }
      }
    } catch (e) {
      update((m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }))
    } finally {
      update((m) => ({ ...m, status: undefined }))
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const clear = useCallback(() => { if (!busyRef.current) setMsgs([]) }, [])

  // "Ask the Assistant" links across the app are plain <Link href="/chat?q=…">. Intercept them so the
  // question opens in the side panel instead of navigating away (the full /chat page still works directly).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = (e.target as HTMLElement).closest("a")
      const href = a?.getAttribute("href")
      if (!href?.startsWith("/chat?q=")) return
      const q = new URLSearchParams(href.slice("/chat?".length)).get("q")
      if (!q) return
      e.preventDefault()
      e.stopPropagation()
      if (path !== "/chat") setOpen(true)
      send(q)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [path, send, setOpen])

  // Deep link (/chat?q=…) opened directly: send once and strip the param.
  useEffect(() => {
    if (path !== "/chat") return
    const q = new URLSearchParams(window.location.search).get("q")
    if (q) { send(q); router.replace("/chat") }
  }, [path, send, router])

  return (
    <AssistantContext.Provider value={{ msgs, busy, open, setOpen, send, clear }}>
      {children}
    </AssistantContext.Provider>
  )
}
