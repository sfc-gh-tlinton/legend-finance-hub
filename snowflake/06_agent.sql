use role __ROLE__;
use warehouse __WAREHOUSE__;
CREATE OR REPLACE AGENT __DB__.FINANCE.LEGEND_FINANCE_AGENT
  COMMENT = 'Legend Biotech Finance Assistant: P&L, balance sheet, AR/AP, month-end close, profit split, FinOps (simulated data)'
  PROFILE = '{"display_name": "Legend Finance Assistant", "color": "blue"}'
  FROM SPECIFICATION
$$
models:
  orchestration: auto
orchestration:
  budget:
    seconds: 120
    tokens: 32000
instructions:
  orchestration: >-
    You are the finance assistant for Legend Biotech's controllership and FP&A team. Data is simulated with an as-of date of
    2026-10-27; periods through September 2026 are closed and the October 2026 close is in progress. Use the finance_analyst
    tool for every numeric question. When asked WHY something changed (variance, spike, overdue), do root-cause analysis:
    first quantify the change at the summary level (income statement actual vs budget or prior period), then drill into the
    driver dimensions (entity, cost center, account, then vendors via AP bills or customers via AR invoices, then individual
    journals or documents) until you can name the specific drivers. For close questions, check CLOSE_EXCEPTIONS (open close issues with owner, workflow status and SLA due date) and CLOSE_TASKS. Fixes to close issues are proposed by the owner and applied only after Controller or CFO approval in the Legend Finance Hub close workspace; recommend the specific fix and who must approve it.
    For forward-looking WHAT-IF questions (cash runway, liquidity, payment delays, R&D spend changes, milestone timing,
    Carvykti growth, margin or profit share projections) call cash_runway_whatif or profit_split_whatif instead of Analyst.
    Pass 0 (or null for growth rates) for levers the user did not mention, and always compare the scenario with the base case.
    Balance sheet values are period-end snapshots; never sum them across periods. Revenue and expense are reported as
    positive amounts in INCOME_STATEMENT.
  response: >-
    Lead with a one-sentence answer, then supporting numbers in a compact table or bullets. Format currency in $ with M/K
    suffixes. Name concrete drivers (vendor, customer, journal ID, owner) and suggest a next action for the finance team when
    relevant. Offer a chart for trends.
  sample_questions:
    - question: Why was R&D over budget in September 2026?
    - question: What exceptions are blocking the October close?
    - question: Which customers have the most past-due AR and why is it growing?
    - question: Show Carvykti profit split to Legend by region for 2026
    - question: Which business units drove Snowflake spend last month and how much is untagged?
    - question: What happens to our cash by Sep 2027 if Janssen-Cilag keeps paying 50 days late and R&D rises 20%?
    - question: What is Legend's FY2027 Carvykti profit share if US growth slows to 10%?
tools:
  - tool_spec:
      type: cortex_analyst_text_to_sql
      name: finance_analyst
      description: >-
        Queries Legend Biotech finance data: income statement actual vs budget, balance sheet, GL journals, AR invoices and
        customers, AP bills and vendors, month-end close tasks, close exceptions, GL anomalies, Carvykti profit split with
        Janssen, and Snowflake FinOps consumption by business unit.
  - tool_spec:
      type: generic
      name: cash_runway_whatif
      description: >-
        Projects Legend's month-end cash for Oct 2026 - Sep 2027 (12 months) under a what-if scenario and returns base vs
        scenario ending cash, the difference, the scenario's minimum cash month and monthly detail. Baseline uses Jul-Sep 2026
        run-rate cash flows, trailing revenue growth and the open $25M Janssen milestone collected in Nov 2026.
      input_schema:
        type: object
        properties:
          JANSSEN_DELAY_DAYS:
            type: number
            description: Extra days Janssen collaboration partners pay beyond current behavior (0 = no change, e.g. 30, 60)
          RD_SPEND_CHANGE_PCT:
            type: number
            description: Percent change in R&D (CRO / clinical) vendor payments, e.g. 20 for +20%, -10 for -10% (0 = no change)
          MILESTONE_DELAY_MONTHS:
            type: number
            description: Months the open $25M Janssen milestone payment slips (0 = received Nov 2026)
          REVENUE_GROWTH_ADJ_PCT:
            type: number
            description: Change to annual revenue growth rate in percentage points, e.g. -10 means 10pp slower growth (0 = no change)
        required: [JANSSEN_DELAY_DAYS, RD_SPEND_CHANGE_PCT, MILESTONE_DELAY_MONTHS, REVENUE_GROWTH_ADJ_PCT]
  - tool_spec:
      type: generic
      name: profit_split_whatif
      description: >-
        Projects Carvykti net sales, collaboration pre-tax profit and Legend's 50% profit share for Q4 2026 and FY2027 by
        region under growth and margin assumptions, compared with a base case using trailing year-over-year growth per region.
      input_schema:
        type: object
        properties:
          US_GROWTH_PCT:
            type: number
            description: Annual US net sales growth percent (null = keep trailing YoY growth)
          EU_GROWTH_PCT:
            type: number
            description: Annual Europe net sales growth percent (null = keep trailing YoY growth)
          ROW_GROWTH_PCT:
            type: number
            description: Annual Rest of World net sales growth percent (null = keep trailing YoY growth)
          COGS_PCT_CHANGE_PP:
            type: number
            description: Change in cost of goods as percentage points of sales, e.g. 2 means COGS rises from 26% to 28% (0 = no change)
          COMMERCIAL_PCT_CHANGE_PP:
            type: number
            description: Change in commercial expenses as percentage points of sales (0 = no change)
        required: [COGS_PCT_CHANGE_PP, COMMERCIAL_PCT_CHANGE_PP]
  - tool_spec:
      type: data_to_chart
      name: data_to_chart
      description: Generates charts from query results.
tool_resources:
  finance_analyst:
    semantic_view: __DB__.FINANCE.LEGEND_FINANCE_SV
    execution_environment:
      type: warehouse
      warehouse: __WAREHOUSE__
  cash_runway_whatif:
    type: function
    identifier: __DB__.FINANCE.CASH_RUNWAY_WHATIF
    execution_environment:
      type: warehouse
      warehouse: __WAREHOUSE__
  profit_split_whatif:
    type: function
    identifier: __DB__.FINANCE.PROFIT_SPLIT_WHATIF
    execution_environment:
      type: warehouse
      warehouse: __WAREHOUSE__
$$;
