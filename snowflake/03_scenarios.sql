use role __ROLE__;
use warehouse __WAREHOUSE__;
use schema __DB__.FINANCE;

-- Saved what-if scenarios (parameters as JSON), shared across users of the app
create table if not exists SCENARIOS (
  SCENARIO_ID string default uuid_string(),
  SCENARIO_TYPE string,         -- CASH_RUNWAY | PROFIT_SPLIT
  NAME string,
  DESCRIPTION string,
  PARAMS variant,
  CREATED_BY string default current_user(),
  CREATED_AT timestamp_ltz default current_timestamp()
);

-- Baseline monthly cash drivers: average of Jul-Sep 2026, plus trailing YoY revenue growth
create or replace view V_CASH_DRIVERS as
with rec as (
  select date_trunc(month, i.PAID_DATE) m, iff(c.SEGMENT = 'Collaboration Partner' and i.REVENUE_ACCOUNT_ID = '4000', 'JANSSEN', 'OTHER') k, sum(i.AMOUNT_USD) amt
  from AR_INVOICES i join DIM_CUSTOMER c using (CUSTOMER_ID)
  where i.PAID_DATE between '2026-07-01' and '2026-09-30' and i.REVENUE_ACCOUNT_ID <> '4100' group by 1,2
),
pay as (
  select date_trunc(month, PAID_DATE) m, iff(COST_CENTER_ID = 'CC200', 'RD', 'OTHER') k, sum(AMOUNT_USD) amt
  from AP_BILLS where PAID_DATE between '2026-07-01' and '2026-09-30' group by 1,2
),
gl as (
  select FISCAL_PERIOD m, SOURCE, sum(AMOUNT) amt from GL_JOURNAL_LINES
  where ACCOUNT_ID = '1000' and FISCAL_PERIOD between '2026-07-01' and '2026-09-01'
    and SOURCE in ('PAYROLL','INTEREST','FX_REVAL','MANUAL') group by 1,2
),
growth as (
  select power(sum(iff(INVOICE_DATE >= '2026-07-01', AMOUNT_USD, 0)) / nullif(sum(iff(INVOICE_DATE < '2025-10-01', AMOUNT_USD, 0)), 0), 1/12) - 1 g
  from AR_INVOICES
  where REVENUE_ACCOUNT_ID <> '4100' and (INVOICE_DATE between '2026-07-01' and '2026-09-30' or INVOICE_DATE between '2025-07-01' and '2025-09-30')
)
select
  (select sum(BALANCE) from V_BALANCE_SHEET where FISCAL_PERIOD = '2026-09-01' and ACCOUNT_ID = '1000') as START_CASH,
  (select sum(amt) / 3 from rec where k = 'JANSSEN') as JANSSEN_RECEIPTS,
  (select sum(amt) / 3 from rec where k = 'OTHER') as OTHER_RECEIPTS,
  (select sum(amt) / 3 from pay where k = 'RD') as RD_PAYMENTS,
  (select sum(amt) / 3 from pay where k = 'OTHER') as OTHER_PAYMENTS,
  (select -sum(amt) / 3 from gl where SOURCE = 'PAYROLL') as PAYROLL,
  (select sum(amt) / 3 from gl where SOURCE in ('INTEREST','FX_REVAL','MANUAL')) as OTHER_NET,
  (select coalesce(sum(AMOUNT_USD - AMOUNT_PAID), 0) from AR_INVOICES where REVENUE_ACCOUNT_ID = '4100' and STATUS = 'Open') as OPEN_MILESTONE,
  (select g from growth) as MONTHLY_GROWTH;

-- Cash runway what-if: 12 months Oct-2026..Sep-2027, base vs scenario
create or replace function CASH_RUNWAY_SCENARIO(
  JANSSEN_DELAY_DAYS float, RD_SPEND_CHANGE_PCT float, MILESTONE_DELAY_MONTHS float, REVENUE_GROWTH_ADJ_PCT float)
returns table (MONTH date, MONTH_NAME varchar, BASE_INFLOW float, BASE_OUTFLOW float, BASE_ENDING_CASH float,
               SCEN_INFLOW float, SCEN_OUTFLOW float, SCEN_ENDING_CASH float)
as
$$
  with d as (select * from __DB__.FINANCE.V_CASH_DRIVERS),
  m as (select row_number() over (order by seq4()) k from table(generator(rowcount => 12))),
  f as (
    select m.k, dateadd(month, m.k - 1, '2026-10-01'::date) mon,
      power(1 + d.MONTHLY_GROWTH, m.k) gb,
      power(1 + d.MONTHLY_GROWTH + coalesce(REVENUE_GROWTH_ADJ_PCT, 0) / 1200, m.k) gs,
      d.*
    from m cross join d
  ),
  flows as (
    select k, mon,
      (JANSSEN_RECEIPTS + OTHER_RECEIPTS) * gb + iff(k = 2, OPEN_MILESTONE, 0) base_in,
      RD_PAYMENTS + OTHER_PAYMENTS + PAYROLL - OTHER_NET base_out,
      -- delayed Janssen receipts shift collections right by delay/30 months
      JANSSEN_RECEIPTS * gs * least(greatest(k - greatest(coalesce(JANSSEN_DELAY_DAYS, 0), 0) / 30, 0), 1)
        + OTHER_RECEIPTS * gs
        + iff(k = 2 + round(greatest(coalesce(MILESTONE_DELAY_MONTHS, 0), 0)), OPEN_MILESTONE, 0) scen_in,
      RD_PAYMENTS * (1 + coalesce(RD_SPEND_CHANGE_PCT, 0) / 100) + OTHER_PAYMENTS + PAYROLL - OTHER_NET scen_out,
      START_CASH
    from f
  )
  select mon, to_char(mon, 'YYYY-MM'), base_in::float, base_out::float,
         (START_CASH + sum(base_in - base_out) over (order by k))::float,
         scen_in::float, scen_out::float,
         (START_CASH + sum(scen_in - scen_out) over (order by k))::float
  from flows
$$;

-- Carvykti profit split what-if: Oct-2026..Dec-2027 by region, base vs scenario
create or replace function PROFIT_SPLIT_SCENARIO(
  US_GROWTH_PCT float, EU_GROWTH_PCT float, ROW_GROWTH_PCT float, COGS_PCT_CHANGE_PP float, COMMERCIAL_PCT_CHANGE_PP float)
returns table (MONTH date, MONTH_NAME varchar, REGION varchar, BASE_SALES float, SCEN_SALES float,
               BASE_PRETAX float, SCEN_PRETAX float, BASE_LEGEND_SHARE float, SCEN_LEGEND_SHARE float)
as
$$
  with r as (
    select REGION,
      avg(iff(FISCAL_PERIOD >= '2026-07-01', CARVYKTI_NET_SALES, null)) run_rate,
      sum(iff(FISCAL_PERIOD >= '2026-07-01', CARVYKTI_NET_SALES, 0)) / nullif(sum(iff(FISCAL_PERIOD between '2025-07-01' and '2025-09-01', CARVYKTI_NET_SALES, 0)), 0) - 1 yoy,
      sum(iff(FISCAL_PERIOD >= '2026-07-01', COST_OF_GOODS, 0)) / sum(iff(FISCAL_PERIOD >= '2026-07-01', CARVYKTI_NET_SALES, 0)) cogs_pct,
      sum(iff(FISCAL_PERIOD >= '2026-07-01', COMMERCIAL_EXPENSES, 0)) / sum(iff(FISCAL_PERIOD >= '2026-07-01', CARVYKTI_NET_SALES, 0)) comm_pct,
      sum(iff(FISCAL_PERIOD >= '2026-07-01', MEDICAL_AFFAIRS_EXPENSES, 0)) / sum(iff(FISCAL_PERIOD >= '2026-07-01', CARVYKTI_NET_SALES, 0)) med_pct
    from __DB__.FINANCE.PROFIT_SPLIT group by REGION
  ),
  m as (select row_number() over (order by seq4()) k from table(generator(rowcount => 15))),
  p as (
    select m.k, dateadd(month, m.k - 1, '2026-10-01'::date) mon, r.*,
      -- months since the Jul-Sep run-rate midpoint (Aug) is k + 1
      r.run_rate * power(1 + r.yoy, (m.k + 1) / 12) base_sales,
      r.run_rate * power(1 + coalesce(case r.REGION when 'United States' then US_GROWTH_PCT when 'Europe' then EU_GROWTH_PCT else ROW_GROWTH_PCT end / 100, r.yoy), (m.k + 1) / 12) scen_sales
    from m cross join r
  ),
  c as (
    select *,
      base_sales * (1 - cogs_pct - comm_pct - med_pct) base_pretax,
      scen_sales * (1 - (cogs_pct + coalesce(COGS_PCT_CHANGE_PP, 0) / 100) - (comm_pct + coalesce(COMMERCIAL_PCT_CHANGE_PP, 0) / 100) - med_pct) scen_pretax
    from p
  )
  select mon, to_char(mon, 'YYYY-MM'), REGION, base_sales::float, scen_sales::float, base_pretax::float, scen_pretax::float, (base_pretax * 0.5)::float, (scen_pretax * 0.5)::float
  from c
$$;

-- Agent tool wrappers: scalar UDFs returning a compact JSON summary of each scenario
create or replace function CASH_RUNWAY_WHATIF(
  JANSSEN_DELAY_DAYS float, RD_SPEND_CHANGE_PCT float, MILESTONE_DELAY_MONTHS float, REVENUE_GROWTH_ADJ_PCT float)
returns variant
comment = 'What-if: 12-month cash runway (Oct 2026 - Sep 2027) under Janssen payment delay, R&D spend change, milestone slip and revenue growth change.'
as
$$
  select to_variant(object_construct(
    'assumptions', object_construct('janssen_delay_days', JANSSEN_DELAY_DAYS, 'rd_spend_change_pct', RD_SPEND_CHANGE_PCT,
                                    'milestone_delay_months', MILESTONE_DELAY_MONTHS, 'revenue_growth_adj_pct', REVENUE_GROWTH_ADJ_PCT),
    'base_ending_cash_sep_2027', round(max_by(BASE_ENDING_CASH, MONTH)),
    'scenario_ending_cash_sep_2027', round(max_by(SCEN_ENDING_CASH, MONTH)),
    'difference', round(max_by(SCEN_ENDING_CASH, MONTH) - max_by(BASE_ENDING_CASH, MONTH)),
    'scenario_min_cash', round(min(SCEN_ENDING_CASH)),
    'scenario_min_cash_month', min_by(MONTH_NAME, SCEN_ENDING_CASH),
    'monthly', array_agg(object_construct('month', MONTH_NAME, 'base_cash', round(BASE_ENDING_CASH), 'scenario_cash', round(SCEN_ENDING_CASH),
                                          'scenario_net_flow', round(SCEN_INFLOW - SCEN_OUTFLOW))) within group (order by MONTH)))
  from table(__DB__.FINANCE.CASH_RUNWAY_SCENARIO(JANSSEN_DELAY_DAYS, RD_SPEND_CHANGE_PCT, MILESTONE_DELAY_MONTHS, REVENUE_GROWTH_ADJ_PCT))
$$;

create or replace function PROFIT_SPLIT_WHATIF(
  US_GROWTH_PCT float, EU_GROWTH_PCT float, ROW_GROWTH_PCT float, COGS_PCT_CHANGE_PP float, COMMERCIAL_PCT_CHANGE_PP float)
returns variant
comment = 'What-if: Carvykti net sales, pre-tax profit and Legend 50% share for FY2027 under regional growth and margin assumptions.'
as
$$
  select to_variant(object_construct(
    'assumptions', object_construct('us_growth_pct', US_GROWTH_PCT, 'eu_growth_pct', EU_GROWTH_PCT, 'row_growth_pct', ROW_GROWTH_PCT,
                                    'cogs_pct_change_pp', COGS_PCT_CHANGE_PP, 'commercial_pct_change_pp', COMMERCIAL_PCT_CHANGE_PP),
    'fy2027_base_sales', round(sum(iff(year(MONTH) = 2027, BASE_SALES, 0))),
    'fy2027_scenario_sales', round(sum(iff(year(MONTH) = 2027, SCEN_SALES, 0))),
    'fy2027_base_legend_share', round(sum(iff(year(MONTH) = 2027, BASE_LEGEND_SHARE, 0))),
    'fy2027_scenario_legend_share', round(sum(iff(year(MONTH) = 2027, SCEN_LEGEND_SHARE, 0))),
    'fy2027_legend_share_difference', round(sum(iff(year(MONTH) = 2027, SCEN_LEGEND_SHARE - BASE_LEGEND_SHARE, 0))),
    'q4_2026_scenario_legend_share', round(sum(iff(year(MONTH) = 2026, SCEN_LEGEND_SHARE, 0))),
    'fy2027_by_region', (select array_agg(object_construct('region', REGION, 'base_sales', b, 'scenario_sales', s, 'scenario_legend_share', l))
                        from (select REGION, round(sum(BASE_SALES)) b, round(sum(SCEN_SALES)) s, round(sum(SCEN_LEGEND_SHARE)) l
                              from table(__DB__.FINANCE.PROFIT_SPLIT_SCENARIO(US_GROWTH_PCT, EU_GROWTH_PCT, ROW_GROWTH_PCT, COGS_PCT_CHANGE_PP, COMMERCIAL_PCT_CHANGE_PP))
                              where year(MONTH) = 2027 group by REGION))))
  from table(__DB__.FINANCE.PROFIT_SPLIT_SCENARIO(US_GROWTH_PCT, EU_GROWTH_PCT, ROW_GROWTH_PCT, COGS_PCT_CHANGE_PP, COMMERCIAL_PCT_CHANGE_PP))
$$;

insert into SCENARIOS (SCENARIO_TYPE, NAME, DESCRIPTION, PARAMS, CREATED_BY)
select column1, column2, column3, parse_json(column4), column5 from values
 ('CASH_RUNWAY', 'Base case', 'Current run-rate, milestone received Nov 2026', '{"janssenDelay":0,"rdChange":0,"milestoneDelay":0,"growthAdj":0}', 'SYSTEM'),
 ('CASH_RUNWAY', 'Janssen EU stays 50 days late', 'Janssen-Cilag payment behavior since Jun-2026 persists', '{"janssenDelay":50,"rdChange":0,"milestoneDelay":0,"growthAdj":0}', 'SYSTEM'),
 ('CASH_RUNWAY', 'Phase 3 acceleration', 'CRO spend +25%, milestone slips 2 quarters', '{"janssenDelay":15,"rdChange":25,"milestoneDelay":6,"growthAdj":0}', 'SYSTEM'),
 ('PROFIT_SPLIT', 'Base case', 'Trailing YoY growth by region', '{"us":null,"eu":null,"row":null,"cogs":0,"comm":0}', 'SYSTEM'),
 ('PROFIT_SPLIT', 'EU launch upside', 'Europe +60%, US +25%, commercial +1pp', '{"us":25,"eu":60,"row":40,"cogs":0,"comm":1}', 'SYSTEM'),
 ('PROFIT_SPLIT', 'Competitive pressure', 'US growth 5%, COGS +2pp', '{"us":5,"eu":20,"row":20,"cogs":2,"comm":0}', 'SYSTEM')
where not exists (select 1 from SCENARIOS);
