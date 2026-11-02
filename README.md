# Legend Finance Hub

A finance app for **Legend Biotech** running on Snowflake. It covers:

- Income statement and balance sheet
- AR and AP
- An agentic month-end close with issue routing, email and approvals
- The Carvykti / Janssen profit split
- What-if scenarios
- Snowflake FinOps chargeback
- A chat **Legend Finance Assistant** (Cortex Agent) that works both in the app and in **Snowflake CoWork**

> All data is **simulated**: synthetic GL, AR, AP, budget, close and consumption data with an as-of date of **2026-10-27**. Periods through Sep 2026 are closed and the **October 2026 close is in progress**.

---

## What's in this repo

```
install.sh / uninstall.sh   one-command setup and teardown
snowflake/                  SQL run in order by install.sh (placeholders filled in at install time)
  00_setup.sql              database + schemas
  01_seed_data.sql          simulated GL, AR/AP sub-ledgers, budget, close tasks, profit split, FinOps
  02_views.sql              income statement, balance sheet, aging, DSO/DPO, recon, anomalies, cash forecast
  03_scenarios.sql          CASH_RUNWAY_SCENARIO / PROFIT_SPLIT_SCENARIO what-if functions (+ agent tool UDFs)
  04_close_workflow.sql     close rules, issues, audit trail, approvals, email integration, daily task
  05_semantic_view.sql      semantic view LEGEND_FINANCE_SV (YAML copy in semantic_view.yaml)
  06_agent.sql              Cortex Agent LEGEND_FINANCE_AGENT (Analyst + what-if tools + charts)
app/                        Next.js / React app (Snowflake App Runtime template), runs locally
```

## Prerequisites

| Requirement | Notes |
|---|---|
| Snowflake account with **Cortex Agents / Cortex Analyst** | Cross-region inference may need to be enabled if your region lacks the models |
| Role with `CREATE DATABASE`, `CREATE INTEGRATION`, `EXECUTE TASK` | `ACCOUNTADMIN` is simplest for a demo account |
| A warehouse | e.g. `COMPUTE_WH` (X-Small is fine) |
| [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation/installation) `snow` 3.x with a working connection | `snow connection add`, then `snow connection test -c <name>` |
| Node.js 20+ and npm | for the app |
| Python 3 | used by the installer to parse CLI output |
| A **verified email** of a user in the account | close notifications are sent with `SYSTEM$SEND_SNOWFLAKE_NOTIFICATION`, which only delivers to verified user emails |

## Install

```bash
git clone <your-repo-url> legend-finance-hub && cd legend-finance-hub
./install.sh
```

The installer prompts for these values; press Enter to accept the defaults:

| Prompt | Default |
|---|---|
| CLI connection | your default `snow` connection |
| Database | `LEGENDBIO` |
| Warehouse | `COMPUTE_WH` |
| Role | `ACCOUNTADMIN` |
| Notification email | — |
| Add agent to CoWork | yes |
| Start the daily task | no |

Non-interactive:

```bash
CONNECTION=myconn DB=LEGENDBIO WAREHOUSE=COMPUTE_WH ROLE=ACCOUNTADMIN \
NOTIFY_EMAIL=me@company.com ADD_TO_COWORK=y START_DAILY_TASK=n ./install.sh -y
```

The install takes a few minutes. It is re-runnable: it regenerates the simulated data and resets the close workflow. The installer also writes `app/.env.local` and `app/app.yml`, and runs `npm ci`.

## Run the app

```bash
cd app
npm run dev -- -p 3010
# open http://localhost:3010
```

The app authenticates with your `snow` CLI connection (`app/.env.local` → `SNOWFLAKE_CONNECTION_NAME`).

- **PAT or OAuth connection:** the Assistant streams answers over the Cortex Agents REST API.
- **SSO (`externalbrowser`) or key-pair connection:** it falls back to `SNOWFLAKE.CORTEX.DATA_AGENT_RUN` over SQL. Answers arrive in one piece instead of streaming.

To force the SQL path, add `LEGEND_AGENT_VIA_SQL=1` to `app/.env.local`.

## Use the agent in CoWork

Open **https://ai.snowflake.com** and pick **Legend Finance Assistant**. Users need `USAGE` on the agent, the database and schema, the semantic view, the tool functions and the warehouse. They also need a default role and a default warehouse.

## Pages

| Page | What it shows |
|---|---|
| **Overview** | Revenue, net income, cash and AR/AP KPIs; P&L trend; 6-month cash forecast; top close exceptions |
| **Income Statement** | Actual vs budget, prior month, prior year and YTD by entity; cost by business unit; GL anomalies (≥3σ) |
| **Balance Sheet** | Period-end balances, current ratio, DSO/DPO, working capital trend, sub-ledger-to-GL reconciliation |
| **Receivables / Payables** | Aging, past-due worklist, collection trends, duplicate bill check, payment run, spend by category |
| **Month-End Close** | Close agent, issues and approvals, close checklist, editable check rules (details below) |
| **Profit Split** | Carvykti net sales by region, profit bridge, Legend's 50% share, calculation detail and source files |
| **Scenarios** | Cash-runway and profit-split what-ifs with sliders, base vs scenario, saved scenarios |
| **FinOps** | Snowflake spend by account / BU / warehouse, chargeback vs budget, untagged spend |
| **Assistant** | Full-screen chat. The Assistant is also docked on the right of every page with page-specific starter questions |

## How the month-end close works

1. **Rules define "done".** `FINANCE.CLOSE_CHECK_RULES` holds read-only SQL checks. Each returns `REFERENCE, COUNTERPARTY, AMOUNT, DETAIL, SEVERITY`; no rows means the check passes. Finance can edit, test and enable or disable rules in the **Check rules** tab. The shipped rules are:
   - Sub-ledger cut-off loaded
   - AR invoice missing from the GL
   - AR or AP sub-ledger doesn't tie to the GL
   - Duplicate vendor bill
   - Receivable more than 30 days past due
   - Unusual manual journal (weekend, unauthorized user, round amount, over $250K)
   - Profit split not final
   - P&L flux greater than 3σ
2. **Runs.** `RUN_CLOSE_CHECKS` executes every enabled rule:
   - Each finding becomes an issue in `CLOSE_ISSUES`, assigned to the close-task owner with an SLA from the close calendar.
   - Issues whose check now passes are closed automatically.
   - Status rolls up to the 21-task checklist (`CLOSE_TASKS`).

   Runs are triggered by the **Run close agent** button, by any approved fix, and by the daily task `LEGEND_DAILY_CLOSE_CHECKS` (7:00 AM ET).
3. **Notifications.**
   - `NOTIFY_CLOSE_OWNERS` emails each owner one digest of their new issues.
   - Proposals send an approval request to the Controller.
   - `ESCALATE_OVERDUE_ISSUES` emails the Controller about issues past their SLA.
   - From an issue you can have the Assistant draft an email, edit it and send it.

   Every simulated owner is mapped to your notification email in `CLOSE_OWNERS`.
4. **Fixes need approval.** The owner proposes a fix; only the Controller or CFO (`IS_APPROVER`) can approve it in `APPLY_CLOSE_ACTION`, which then applies it:
   - **Missing AR invoice:** post a correcting journal.
   - **Duplicate bill:** void it, block payment and post a GL reversal.
   - **Manual journal:** accept it, or reverse it in October.
   - **Profit split:** mark it Final.
   - **Past-due AR:** send a collections notice.

   Everything is logged in `CLOSE_ISSUE_EVENTS`.
5. **Reset.** `CALL FINANCE.RESET_CLOSE_DEMO();`, or the reset icon on the close agent card, puts the October close back to its starting state.

The **"Acting as"** selector on the Issues tab is a demo persona switch, not real sign-in. Approval rights are still enforced in Snowflake against `CLOSE_OWNERS`.

## Demo script (10 minutes)

1. **Overview:** ask the Assistant *"What drove the change in net income from August to September 2026?"*
2. **Income Statement (2026-09):** R&D is far over budget. Click the line and the Assistant traces it to **ICON plc** and a **duplicate $9.7M bill**.
3. **Receivables:** *"Is Janssen-Cilag paying later than its terms? Since when?"* (it has paid about 50 days late since June 2026).
4. **Month-End Close:**
   1. Click **Run close agent** with "Email owners" checked. You'll receive the digests.
   2. On **Issues & approvals**, act as **Ravi Kumar** and propose voiding the ICON duplicate.
   3. Switch to **Controller** and approve. The AP fix posts and the checklist updates.
   4. Approve posting the missing **Cardinal** invoice, then reverse **MJE-26-0102**. AR now ties to the GL.
5. **Scenarios:** set Janssen delay to 50 days and R&D to +20%, then click **Explain with Assistant**.
6. **FinOps:** see untagged spend, which is the case for 2027 chargeback tagging.
7. **CoWork:** ask the same agent the same questions at ai.snowflake.com.

## Deploy to Snowflake (optional)

The app was built and tested to run locally. `app/app.yml` (generated from `app.yml.template`) is a Snowflake App Runtime v2 manifest, so you can deploy with `cd app && snow app deploy`. That needs App Runtime enabled in the account. Deployment hasn't been tested from this repo.

## Uninstall

```bash
./uninstall.sh
```

This drops the database, which removes the data, views, semantic view, agent, functions, procedures and task. It also removes the agent from Snowflake Intelligence. It leaves the account-level `LEGEND_CLOSE_EMAIL` notification integration in place, since other installs may share it.

## Notes and limits

- All business data is simulated. Customers, vendors and amounts are illustrative, and nothing connects to SAP.
- Fixes change only the simulated tables.
- `SYSTEM$SEND_SNOWFLAKE_NOTIFICATION` only emails verified users of the account, so Teams or Slack would need a webhook notification integration.
- The simulated "today" (2026-10-27) and the October 2026 close period are fixed in the SQL and in `app/lib/constants.ts`.
