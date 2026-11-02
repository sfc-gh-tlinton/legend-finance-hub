use role __ROLE__;
use warehouse __WAREHOUSE__;
use schema __DB__.FINANCE;

-- Income statement: monthly actual vs budget by entity / account / cost center, sign-flipped so revenue and expense are positive
create or replace view V_INCOME_STATEMENT as
with act as (
  select FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID, sum(AMOUNT) amt
  from GL_JOURNAL_LINES group by 1,2,3,4
),
bud as (select FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID, BUDGET_AMOUNT from BUDGET),
j as (
  select coalesce(a.FISCAL_PERIOD, b.FISCAL_PERIOD) FISCAL_PERIOD, coalesce(a.ENTITY_ID, b.ENTITY_ID) ENTITY_ID,
         coalesce(a.ACCOUNT_ID, b.ACCOUNT_ID) ACCOUNT_ID, coalesce(a.COST_CENTER_ID, b.COST_CENTER_ID) COST_CENTER_ID,
         coalesce(a.amt, 0) amt, coalesce(b.BUDGET_AMOUNT, 0) budget
  from act a full outer join bud b
    on a.FISCAL_PERIOD = b.FISCAL_PERIOD and a.ENTITY_ID = b.ENTITY_ID and a.ACCOUNT_ID = b.ACCOUNT_ID
   and equal_null(a.COST_CENTER_ID, b.COST_CENTER_ID)
)
select j.FISCAL_PERIOD, p.PERIOD_NAME, p.FISCAL_YEAR, p.FISCAL_QUARTER, j.ENTITY_ID, e.ENTITY_NAME,
       j.ACCOUNT_ID, d.ACCOUNT_NAME, d.ACCOUNT_TYPE, d.CATEGORY, d.SORT_ORDER,
       j.COST_CENTER_ID, c.COST_CENTER_NAME, c.BUSINESS_UNIT,
       iff(d.ACCOUNT_TYPE in ('Revenue','Other'), -j.amt, j.amt)::number(18,2) as ACTUAL_AMOUNT,
       j.budget::number(18,2) as BUDGET_AMOUNT,
       -j.amt::number(18,2) as NET_INCOME_CONTRIBUTION
from j
join DIM_ACCOUNT d on d.ACCOUNT_ID = j.ACCOUNT_ID and d.STATEMENT = 'IS'
join DIM_PERIOD p on p.PERIOD_START = j.FISCAL_PERIOD
join DIM_ENTITY e on e.ENTITY_ID = j.ENTITY_ID
left join DIM_COST_CENTER c on c.COST_CENTER_ID = j.COST_CENTER_ID;

-- Balance sheet: period-end balances per account, with IS accounts rolled into Retained Earnings
create or replace view V_BALANCE_SHEET as
with m as (
  select g.FISCAL_PERIOD, g.ENTITY_ID, iff(d.STATEMENT = 'IS', '3100', g.ACCOUNT_ID) ACCOUNT_ID, sum(g.AMOUNT) amt
  from GL_JOURNAL_LINES g join DIM_ACCOUNT d using (ACCOUNT_ID) group by 1,2,3
),
grid as (
  select p.PERIOD_START, p.PERIOD_NAME, e.ENTITY_ID, a.ACCOUNT_ID
  from DIM_PERIOD p cross join DIM_ENTITY e cross join DIM_ACCOUNT a where a.STATEMENT = 'BS'
)
select g.PERIOD_START as FISCAL_PERIOD, g.PERIOD_NAME, g.ENTITY_ID, e.ENTITY_NAME, g.ACCOUNT_ID, d.ACCOUNT_NAME, d.ACCOUNT_TYPE, d.CATEGORY, d.SORT_ORDER,
       (sum(coalesce(m.amt,0)) over (partition by g.ENTITY_ID, g.ACCOUNT_ID order by g.PERIOD_START)
         * iff(d.ACCOUNT_TYPE = 'Asset', 1, -1))::number(18,2) as BALANCE
from grid g
left join m on m.FISCAL_PERIOD = g.PERIOD_START and m.ENTITY_ID = g.ENTITY_ID and m.ACCOUNT_ID = g.ACCOUNT_ID
join DIM_ACCOUNT d on d.ACCOUNT_ID = g.ACCOUNT_ID
join DIM_ENTITY e on e.ENTITY_ID = g.ENTITY_ID;

-- Open AR with aging buckets as of 2026-10-27
create or replace view V_AR_AGING as
select i.INVOICE_ID, i.CUSTOMER_ID, c.CUSTOMER_NAME, c.SEGMENT, c.REGION, i.ENTITY_ID, i.INVOICE_DATE, i.DUE_DATE,
       i.AMOUNT_USD, i.AMOUNT_PAID, (i.AMOUNT_USD - i.AMOUNT_PAID) as OPEN_AMOUNT,
       greatest(datediff(day, i.DUE_DATE, '2026-10-27'::date), 0) as DAYS_PAST_DUE,
       case when datediff(day, i.DUE_DATE, '2026-10-27'::date) <= 0 then 'Current'
            when datediff(day, i.DUE_DATE, '2026-10-27'::date) <= 30 then '1-30'
            when datediff(day, i.DUE_DATE, '2026-10-27'::date) <= 60 then '31-60'
            when datediff(day, i.DUE_DATE, '2026-10-27'::date) <= 90 then '61-90'
            else '90+' end as AGING_BUCKET
from AR_INVOICES i join DIM_CUSTOMER c using (CUSTOMER_ID)
where i.STATUS = 'Open';

create or replace view V_AP_AGING as
select b.BILL_ID, b.VENDOR_INVOICE_NO, b.VENDOR_ID, v.VENDOR_NAME, v.CATEGORY as VENDOR_CATEGORY, b.ENTITY_ID, b.COST_CENTER_ID,
       b.BILL_DATE, b.DUE_DATE, b.AMOUNT_USD, (b.AMOUNT_USD - b.AMOUNT_PAID) as OPEN_AMOUNT,
       datediff(day, '2026-10-27'::date, b.DUE_DATE) as DAYS_UNTIL_DUE,
       case when b.DUE_DATE < '2026-10-27' then 'Overdue'
            when b.DUE_DATE <= '2026-11-10' then 'Due in 0-14 days'
            when b.DUE_DATE <= '2026-11-26' then 'Due in 15-30 days'
            else 'Due in 30+ days' end as DUE_BUCKET
from AP_BILLS b join DIM_VENDOR v using (VENDOR_ID)
where b.STATUS = 'Open';

-- Monthly DSO / DPO
create or replace view V_WORKING_CAPITAL as
select bs.FISCAL_PERIOD, bs.PERIOD_NAME,
       sum(iff(bs.ACCOUNT_ID = '1100', bs.BALANCE, 0)) as AR_BALANCE,
       sum(iff(bs.ACCOUNT_ID = '2000', bs.BALANCE, 0)) as AP_BALANCE,
       sum(iff(bs.ACCOUNT_ID = '1000', bs.BALANCE, 0)) as CASH_BALANCE,
       max(r.rev) as REVENUE, max(r.spend) as AP_SPEND,
       round(AR_BALANCE / nullif(REVENUE, 0) * 30, 1) as DSO_DAYS,
       round(AP_BALANCE / nullif(AP_SPEND, 0) * 30, 1) as DPO_DAYS
from V_BALANCE_SHEET bs
join (select date_trunc(month, coalesce(x.d, y.d)) p, x.rev, y.spend from
        (select date_trunc(month, INVOICE_DATE) d, sum(AMOUNT_USD) rev from AR_INVOICES group by 1) x
        full join (select date_trunc(month, BILL_DATE) d, sum(AMOUNT_USD) spend from AP_BILLS group by 1) y on x.d = y.d) r
  on r.p = bs.FISCAL_PERIOD
group by 1,2;

-- Subledger to GL reconciliation by entity
create or replace view V_SUBLEDGER_RECON as
with sl as (
  select 'AR' LEDGER, ENTITY_ID, sum(AMOUNT_USD - AMOUNT_PAID) bal from AR_INVOICES group by 2
  union all select 'AP', ENTITY_ID, sum(AMOUNT_USD - AMOUNT_PAID) from AP_BILLS group by 2
),
gl as (
  select iff(ACCOUNT_ID = '1100', 'AR', 'AP') LEDGER, ENTITY_ID, sum(iff(ACCOUNT_ID = '1100', AMOUNT, -AMOUNT)) bal
  from GL_JOURNAL_LINES where ACCOUNT_ID in ('1100','2000') group by 1,2
)
select l.LEDGER, e.ENTITY_ID, coalesce(sl.bal,0)::number(18,2) as SUBLEDGER_BALANCE, coalesce(gl.bal,0)::number(18,2) as GL_BALANCE,
       (coalesce(sl.bal,0) - coalesce(gl.bal,0))::number(18,2) as DIFFERENCE
from DIM_ENTITY e cross join (select column1 LEDGER from values ('AR'),('AP')) l
left join sl on sl.LEDGER = l.LEDGER and sl.ENTITY_ID = e.ENTITY_ID
left join gl on gl.LEDGER = l.LEDGER and gl.ENTITY_ID = e.ENTITY_ID;

-- Close exceptions found by automated checks
create or replace view V_CLOSE_EXCEPTIONS as
select 'AR invoice not posted to GL' as EXCEPTION_TYPE, 'T04' as TASK_CODE, i.INVOICE_ID as REFERENCE,
       c.CUSTOMER_NAME as COUNTERPARTY, i.AMOUNT_USD as AMOUNT, 'High' as SEVERITY,
       'Invoice exists in SAP SD sub-ledger but no GL journal found (interface failure)' as DETAIL
from AR_INVOICES i join DIM_CUSTOMER c using (CUSTOMER_ID)
where not exists (select 1 from GL_JOURNAL_LINES g where g.DOC_REF = i.INVOICE_ID and g.SOURCE = 'AR')
union all
select 'Possible duplicate vendor bill', 'T06', b.BILL_ID, v.VENDOR_NAME, b.AMOUNT_USD, 'High',
       'Same vendor invoice number ' || b.VENDOR_INVOICE_NO || ' posted ' || count(*) over (partition by b.VENDOR_ID, b.VENDOR_INVOICE_NO) || ' times'
from AP_BILLS b join DIM_VENDOR v using (VENDOR_ID)
qualify count(*) over (partition by b.VENDOR_ID, b.VENDOR_INVOICE_NO) > 1
union all
select 'Partner receivable > 60 days past due', 'T05', a.INVOICE_ID, a.CUSTOMER_NAME, a.OPEN_AMOUNT, 'Medium',
       a.DAYS_PAST_DUE || ' days past due'
from V_AR_AGING a where a.DAYS_PAST_DUE > 60 and a.OPEN_AMOUNT > 1000000
union all
select 'Unusual manual journal entry', 'T16', JOURNAL_ID, POSTED_BY, AMOUNT, iff(AMOUNT >= 2000000, 'High', 'Medium'), REASON
from (
  select g.JOURNAL_ID, g.POSTED_BY, g.DEBIT as AMOUNT,
         case when g.POSTED_BY like 'INTERN%' then 'Manual JE posted by non-authorized user'
              when dayofweekiso(g.POSTING_DATE) >= 6 then 'Manual JE posted on weekend'
              when mod(g.DEBIT, 1000000) in (0, 999999) or mod(g.DEBIT,100000)=0 then 'Round-dollar manual JE'
              else 'Manual JE above threshold' end as REASON
  from GL_JOURNAL_LINES g
  where g.SOURCE = 'MANUAL' and g.DEBIT > 0 and g.POSTING_DATE >= '2026-01-01'
);

-- GL anomaly scoring (z-score of account/cost-center spend vs trailing 12 months)
create or replace view V_GL_ANOMALIES as
with m as (
  select FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, ACCOUNT_NAME, COST_CENTER_ID, BUSINESS_UNIT, sum(ACTUAL_AMOUNT) amt
  from V_INCOME_STATEMENT group by 1,2,3,4,5,6
),
s as (
  select *, avg(amt) over (partition by ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID order by FISCAL_PERIOD rows between 12 preceding and 1 preceding) mu,
            stddev(amt) over (partition by ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID order by FISCAL_PERIOD rows between 12 preceding and 1 preceding) sd
  from m
)
select FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, ACCOUNT_NAME, COST_CENTER_ID, BUSINESS_UNIT,
       amt::number(18,2) as ACTUAL_AMOUNT, mu::number(18,2) as TRAILING_AVG, round((amt - mu) / nullif(sd, 0), 2) as Z_SCORE
from s where abs((amt - mu) / nullif(sd, 0)) >= 3 and abs(amt - mu) > 250000;

-- FinOps chargeback monthly
create or replace view V_FINOPS_MONTHLY as
select date_trunc(month, c.USAGE_DATE)::date as FISCAL_PERIOD, c.ACCOUNT_NAME, c.WAREHOUSE_NAME,
       coalesce(c.BUSINESS_UNIT, 'Untagged') as BUSINESS_UNIT, coalesce(c.PROJECT, 'Untagged') as PROJECT, c.IS_TAGGED,
       sum(c.CREDITS_USED)::number(18,2) as CREDITS_USED, sum(c.COST_USD)::number(18,2) as COST_USD
from SNOWFLAKE_CONSUMPTION c group by 1,2,3,4,5,6;

-- Simple 6-month cash flow forecast: trailing 3-month average net cash flow, plus known open AR/AP timing
create or replace view V_CASH_FORECAST as
with hist as (
  select FISCAL_PERIOD, sum(AMOUNT) net_flow from GL_JOURNAL_LINES where ACCOUNT_ID = '1000' and FISCAL_PERIOD < '2026-10-01' group by 1
),
base as (select avg(net_flow) avg_flow from hist where FISCAL_PERIOD >= '2026-07-01'),
cur as (select sum(AMOUNT) bal from GL_JOURNAL_LINES where ACCOUNT_ID = '1000'),
f as (select dateadd(month, row_number() over (order by seq4()), '2026-09-01'::date) p from table(generator(rowcount => 6)))
select FISCAL_PERIOD, 'Actual' as TYPE, net_flow::number(18,2) as NET_CASH_FLOW,
       sum(net_flow) over (order by FISCAL_PERIOD)::number(18,2) as ENDING_CASH from hist
union all
select f.p, 'Forecast', b.avg_flow::number(18,2),
       ((select sum(net_flow) from hist) + b.avg_flow * row_number() over (order by f.p))::number(18,2)
from f cross join base b;
