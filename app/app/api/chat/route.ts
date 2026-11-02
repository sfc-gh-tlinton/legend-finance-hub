import { runAgent, type AgentMessage } from "@/lib/agent"

export const dynamic = "force-dynamic"

/**
 * Proxy the Cortex Agent SSE stream to the browser, re-emitted as NDJSON:
 *   {type:"status", text} | {type:"text", text} | {type:"sql", sql} | {type:"table", columns, rows} | {type:"done"} | {type:"error"}
 */
export async function POST(req: Request) {
  let messages: AgentMessage[]
  try {
    const body = await req.json()
    messages = (body.messages ?? []).slice(-12).map((m: { role: string; text: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m.text ?? "").slice(0, 4000) }],
    }))
    if (messages.length === 0) throw new Error("No messages")
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"))
      try {
        const res = await runAgent(messages)
        const reader = res.body!.getReader()
        const dec = new TextDecoder()
        let buf = ""
        let event = ""
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            if (line.startsWith("event:")) { event = line.slice(6).trim(); continue }
            if (!line.startsWith("data:")) continue
            let d: any
            try { d = JSON.parse(line.slice(5)) } catch { continue }
            if (event === "response.text.delta") emit({ type: "text", text: d.text ?? "" })
            else if (event === "response.status") emit({ type: "status", text: d.message ?? d.status ?? "" })
            else if (event === "response.thinking.delta") emit({ type: "status", text: "Reasoning…" })
            else if (event === "response.tool_result") {
              for (const c of d.content ?? []) {
                const j = c.json ?? {}
                if (j.sql) emit({ type: "sql", sql: j.sql })
                const rs = j.result_set
                if (rs?.data && rs?.resultSetMetaData?.rowType) {
                  emit({ type: "table", columns: rs.resultSetMetaData.rowType.map((r: any) => r.name), rows: rs.data.slice(0, 50) })
                }
              }
            } else if (event === "error") emit({ type: "error", message: d.message ?? "Agent error" })
          }
        }
        emit({ type: "done" })
      } catch (e) {
        console.error(new Date().toISOString(), "[chat]", e)
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } })
}
