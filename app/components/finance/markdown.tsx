import type React from "react"

/** Inline **bold**, *italic* and `code` → React nodes (no HTML injection). */
function inline(text: string, key: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key + i}>{p.slice(2, -2)}</strong>
    if (p.startsWith("`") && p.endsWith("`")) return <code key={key + i} className="rounded bg-muted px-1 text-[0.85em]">{p.slice(1, -1)}</code>
    if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <em key={key + i}>{p.slice(1, -1)}</em>
    return p
  })
}

/** Minimal markdown: headings, bullet/numbered lists, pipe tables, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n")
  const out: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      out.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>{head.map((h, j) => <th key={j} className="px-3 py-1.5 text-left font-medium">{inline(h, `h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k} className="border-t">{r.map((c, j) => <td key={j} className="px-3 py-1.5 tabular-nums">{inline(c, `c${k}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { out.push(<p key={`h${i}`} className="mt-3 font-semibold">{inline(h[2], `h${i}`)}</p>); i++; continue }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const nested = /^\s{2,}/.test(lines[i])
        items.push(<li key={i} className={nested ? "ml-4" : undefined}>{inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""), `l${i}`)}</li>)
        i++
      }
      out.push(ordered
        ? <ol key={`o${i}`} className="my-1 list-decimal space-y-1 pl-5">{items}</ol>
        : <ul key={`u${i}`} className="my-1 list-disc space-y-1 pl-5">{items}</ul>)
      continue
    }
    out.push(<p key={`p${i}`} className="my-1.5">{inline(line, `p${i}`)}</p>)
    i++
  }
  return <div className="text-sm leading-relaxed">{out}</div>
}
