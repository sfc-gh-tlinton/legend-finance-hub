import { CalendarCheck, Clock, Gauge, ListChecks } from "lucide-react"
import { querySnowflake } from "@/lib/snowflake"
import { FIN, OPEN_PERIOD } from "@/lib/constants"
import { plain, usd } from "@/lib/money"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarSeriesChart } from "@/components/finance/charts"
import { CloseAgent } from "@/components/finance/close-agent"
import { CloseTabs } from "@/components/finance/close-tabs"
import { PAGE, Section } from "@/components/finance/section"

export const dynamic = "force-dynamic"

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  Complete: "success", Blocked: "destructive", "Needs Review": "warning", "In Progress": "secondary", "Not Started": "outline",
}

export default async function ClosePage() {
  try {
    const [tasks, history, issues, task] = await Promise.all([
      querySnowflake(`select t.TASK_CODE, t.TASK_NAME, t.CATEGORY, t.OWNER, t.DUE_BD, t.DEPENDS_ON, t.AUTOMATION_STATUS, t.STATUS, t.NOTES,
          (select listagg(RULE_ID, ', ') within group (order by RULE_ID) from ${FIN}.CLOSE_CHECK_RULES r where r.TASK_CODE = t.TASK_CODE and r.ENABLED) RULES
        from ${FIN}.CLOSE_TASKS t where t.FISCAL_PERIOD = ?::date order by t.TASK_CODE`, { binds: [OPEN_PERIOD] }),
      querySnowflake(`select p.PERIOD_NAME, p.BUSINESS_DAYS_TO_CLOSE "Days to close", p.CLOSE_METHOD,
          round(sum(t.EFFORT_HOURS)) "Effort hours"
        from ${FIN}.CLOSE_PERIODS p join ${FIN}.CLOSE_TASKS t using (FISCAL_PERIOD)
        where p.STATUS = 'Closed' group by 1,2,3 order by 1`),
      querySnowflake(`select count_if(STATUS <> 'Resolved') open_n, sum(iff(STATUS <> 'Resolved', abs(AMOUNT), 0)) open_amt,
          count_if(STATUS = 'Pending Approval') pending, count_if(STATUS = 'Resolved') resolved
        from ${FIN}.CLOSE_ISSUES where FISCAL_PERIOD = ?::date`, { binds: [OPEN_PERIOD] }),
      querySnowflake(`show tasks like 'LEGEND_DAILY_CLOSE_CHECKS' in schema ${FIN}`),
    ])
    const done = tasks.filter((t) => t.STATUS === "Complete").length
    const blocked = tasks.filter((t) => t.STATUS === "Blocked").length
    const first = history[0] ?? {}
    const last = history[history.length - 1] ?? {}
    const iss = issues[0] ?? {}
    const sched = task[0]

    const checklist = (
      <Section title="Close checklist" description={`Status rolls up from the check rules and is written back to ${FIN}.CLOSE_TASKS`} flush>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Task</TableHead><TableHead>Owner</TableHead><TableHead numeric>Due BD</TableHead>
            <TableHead>Mode</TableHead><TableHead>Rules</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.TASK_CODE}>
                <TableCell className="font-medium"><span className="mr-2 font-mono text-xs text-muted-foreground">{t.TASK_CODE}</span>{t.TASK_NAME}
                  <span className="block text-xs font-normal text-muted-foreground">{t.CATEGORY}{t.DEPENDS_ON ? ` · after ${t.DEPENDS_ON}` : ""}</span></TableCell>
                <TableCell>{t.OWNER}</TableCell>
                <TableCell numeric>BD{t.DUE_BD}</TableCell>
                <TableCell><Badge variant={t.AUTOMATION_STATUS === "Automated" ? "secondary" : "outline"}>{t.AUTOMATION_STATUS}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{t.RULES ?? "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[t.STATUS] ?? "outline"}>{t.STATUS}</Badge></TableCell>
                <TableCell className="max-w-sm whitespace-normal text-xs text-muted-foreground">{t.NOTES ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    )

    return (
      <main className={PAGE}>
        <PageHeader eyebrow="Controllership" title="October 2026 month-end close"
          description="Rule-driven checks in Snowflake open issues for owners, send email, and apply fixes only after Controller approval." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tasks complete" value={`${done} / ${tasks.length}`} hint={blocked ? `${blocked} blocked` : "No blockers"} icon={ListChecks} />
          <StatCard label="Open issues" value={String(iss.OPEN_N ?? 0)} hint={`${usd(iss.OPEN_AMT)} · ${iss.PENDING ?? 0} awaiting approval · ${iss.RESOLVED ?? 0} resolved`} icon={Gauge} />
          <StatCard label="Days to close" value={`${last["Days to close"] ?? "—"} BD`} hint={`Was ${first["Days to close"] ?? "—"} BD in ${first.PERIOD_NAME ?? ""}`} icon={CalendarCheck} />
          <StatCard label="Daily check task" value={sched ? (sched.state === "started" ? "Scheduled" : "Suspended") : "Not set up"}
            hint={sched ? "7:00 AM ET · LEGEND_DAILY_CLOSE_CHECKS" : undefined} icon={Clock} />
        </div>
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3"><CloseAgent /></div>
          <Section className="xl:col-span-2" title="Close cycle trend" description="Business days and team effort per closed period">
            <BarSeriesChart data={plain(history)} x="PERIOD_NAME" height={300} series={[{ key: "Days to close" }, { key: "Effort hours" }]} />
          </Section>
        </div>
        <CloseTabs checklist={checklist} />
      </main>
    )
  } catch (e) {
    console.error(new Date().toISOString(), "[close]", e)
    return <main className={PAGE}><EmptyState variant="error" title="Could not load close workspace" description={e instanceof Error ? e.message : String(e)} /></main>
  }
}
