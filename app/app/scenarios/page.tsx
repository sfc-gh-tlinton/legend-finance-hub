import { PageHeader } from "@/components/page-header"
import { ScenarioWorkbench } from "@/components/finance/scenarios"
import { PAGE } from "@/components/finance/section"

export default function ScenariosPage() {
  return (
    <main className={PAGE}>
      <PageHeader eyebrow="FP&A" title="What-if scenarios"
        description="Move the levers to see cash runway and Carvykti profit share respond. Save scenarios to share with the team, or ask the Assistant to explain them." />
      <ScenarioWorkbench />
    </main>
  )
}
