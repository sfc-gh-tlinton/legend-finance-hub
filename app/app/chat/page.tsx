import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { Chat } from "@/components/finance/chat"
import { PAGE } from "@/components/finance/section"

export default function ChatPage() {
  return (
    <main className={PAGE}>
      <PageHeader eyebrow="Snowflake Cortex Agent" title="Legend Finance Assistant"
        description="Ask questions in plain English. Answers come from the Cortex Agent LEGEND_FINANCE_AGENT using Cortex Analyst over the LEGEND_FINANCE_SV semantic view. The same agent is available in Snowflake CoWork." />
      <Suspense><Chat /></Suspense>
    </main>
  )
}
