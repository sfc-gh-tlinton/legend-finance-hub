/** App title — displayed in the nav header and browser tab */
export const APP_TITLE = "Legend Finance Hub"

/** Path to the logo in /public (used in the header and as favicon) */
export const LOGO_SRC = "/icon.svg"

/** Fully qualified objects backing the app (database is set by install.sh via LEGEND_DB in .env.local) */
export const DB = process.env.LEGEND_DB || "LEGENDBIO"
export const FIN = `${DB}.FINANCE`
export const AGENT = { database: DB, schema: "FINANCE", name: "LEGEND_FINANCE_AGENT" }

/** Simulated "today" — the data cutoff, and the period whose close is in progress */
export const AS_OF = "2026-10-27"
export const OPEN_PERIOD = "2026-10-01"
export const LAST_CLOSED = "2026-09-01"

/** Pages shown in the header nav and under "Go to" in the ⌘K palette. */
export const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Overview", href: "/" },
  { label: "Income Statement", href: "/income-statement" },
  { label: "Balance Sheet", href: "/balance-sheet" },
  { label: "Receivables", href: "/ar" },
  { label: "Payables", href: "/ap" },
  { label: "Month-End Close", href: "/close" },
  { label: "Profit Split", href: "/profit-split" },
  { label: "Scenarios", href: "/scenarios" },
  { label: "FinOps", href: "/finops" },
  { label: "Assistant", href: "/chat" },
]

export const EXAMPLE_PROMPTS: string[] = []
