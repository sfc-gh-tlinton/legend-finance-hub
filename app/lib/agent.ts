/**
 * Server-side client for the Cortex Agent.
 * Preferred path: REST API (agent:run, SSE) using the SAR service token when deployed, or locally the
 * default TOML connection's PAT / OAuth token file (getRestApiAuthHeader does not cover PATs).
 * Fallback (e.g. externalbrowser/SSO or key-pair connections, or LEGEND_AGENT_VIA_SQL=1): call
 * SNOWFLAKE.CORTEX.DATA_AGENT_RUN over the normal SQL connection and replay its JSON as SSE events.
 */
import fs from "fs"
import { getServiceToken, getSnowflakeBaseUrl, querySnowflake, readTomlDefaultConnection } from "@/lib/snowflake"
import { AGENT } from "@/lib/constants"

function authHeaders(): Record<string, string> | null {
  const service = getServiceToken()
  if (service) return { Authorization: `Bearer ${service}`, "X-Snowflake-Authorization-Token-Type": "OAUTH" }
  const conn = readTomlDefaultConnection()
  const auth = String(conn?.authenticator ?? "").toUpperCase()
  if (conn && auth === "PROGRAMMATIC_ACCESS_TOKEN" && (conn.token || conn.password)) {
    return {
      Authorization: `Bearer ${conn.token ?? conn.password}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    }
  }
  if (conn && auth === "OAUTH" && conn.token_file_path) {
    const t = fs.readFileSync(String(conn.token_file_path), "utf8").trim()
    return { Authorization: `Bearer ${t}`, "X-Snowflake-Authorization-Token-Type": "OAUTH" }
  }
  return null
}

export type AgentMessage = { role: "user" | "assistant"; content: { type: "text"; text: string }[] }

/** Non-streaming run via SQL; returns a Response whose body mimics the agent:run SSE stream. */
async function runAgentViaSql(messages: AgentMessage[]): Promise<Response> {
  const fqn = `${AGENT.database}.${AGENT.schema}.${AGENT.name}`
  const [row] = await querySnowflake(
    "select SNOWFLAKE.CORTEX.DATA_AGENT_RUN(?, ?) as R",
    { binds: [fqn, JSON.stringify({ messages, stream: false })] },
  )
  const raw = row?.R ?? Object.values(row ?? {})[0]
  const resp = typeof raw === "string" ? JSON.parse(raw) : raw
  const sse: string[] = []
  const push = (event: string, data: unknown) => sse.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n`)
  for (const c of resp?.content ?? []) {
    if (c.type === "text") push("response.text.delta", { text: c.text })
    else if (c.type === "tool_result") push("response.tool_result", c.tool_result)
  }
  if (resp?.code && resp?.message) push("error", { message: resp.message })
  return new Response(sse.join("\n"), { headers: { "Content-Type": "text/event-stream" } })
}

/** Start an agent run and return the raw SSE response stream. */
export async function runAgent(messages: AgentMessage[]): Promise<Response> {
  const headers = process.env.LEGEND_AGENT_VIA_SQL === "1" ? null : authHeaders()
  if (!headers) return runAgentViaSql(messages)
  const base = getSnowflakeBaseUrl()
  if (!base) throw new Error("Cannot resolve Snowflake account URL")
  const url = `${base}/api/v2/databases/${AGENT.database}/schemas/${AGENT.schema}/agents/${AGENT.name}:run`
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Agent request failed: ${res.status} ${(await res.text()).slice(0, 400)}`)
  }
  return res
}

/** Run the agent to completion and return only the final answer text. */
export async function askAgent(question: string): Promise<string> {
  const res = await runAgent([{ role: "user", content: [{ type: "text", text: question }] }])
  const raw = await res.text()
  let event = ""
  let text = ""
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:") && event === "response.text.delta") {
      try { text += JSON.parse(line.slice(5)).text ?? "" } catch { /* partial line */ }
    }
  }
  return text.trim()
}
