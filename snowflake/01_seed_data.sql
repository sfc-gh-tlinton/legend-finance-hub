-- Legend Biotech finance demo: simulated data (all values are synthetic)
-- Data cutoff: 2026-10-27. Periods 2024-01 .. 2026-09 closed, 2026-10 close in progress.
use role __ROLE__;
use warehouse __WAREHOUSE__;
use schema __DB__.FINANCE;

-- ---------------------------------------------------------------- dimensions
create or replace table DIM_ENTITY (ENTITY_ID string, ENTITY_NAME string, FUNCTIONAL_CURRENCY string, COUNTRY string) as
select * from values
 ('US01','Legend Biotech USA Inc.','USD','United States'),
 ('BE01','Legend Biotech Belgium BV','EUR','Belgium'),
 ('IE01','Legend Biotech Ireland Ltd.','EUR','Ireland');

create or replace table DIM_ACCOUNT (ACCOUNT_ID string, ACCOUNT_NAME string, ACCOUNT_TYPE string, STATEMENT string, CATEGORY string, SORT_ORDER int) as
select * from values
 ('1000','Cash and Cash Equivalents','Asset','BS','Current Assets',1),
 ('1100','Accounts Receivable','Asset','BS','Current Assets',2),
 ('1200','Inventory','Asset','BS','Current Assets',3),
 ('1300','Prepaid Expenses','Asset','BS','Current Assets',4),
 ('1500','Property, Plant & Equipment, net','Asset','BS','Non-Current Assets',5),
 ('2000','Accounts Payable','Liability','BS','Current Liabilities',6),
 ('2100','Accrued Liabilities','Liability','BS','Current Liabilities',7),
 ('3000','Additional Paid-in Capital','Equity','BS','Equity',8),
 ('3100','Retained Earnings','Equity','BS','Equity',9),
 ('4000','Collaboration Revenue - Carvykti','Revenue','IS','Revenue',10),
 ('4100','License & Milestone Revenue','Revenue','IS','Revenue',11),
 ('4200','Other Revenue','Revenue','IS','Revenue',12),
 ('5000','Cost of Collaboration Revenue','COGS','IS','Cost of Revenue',13),
 ('6000','Research & Development','OpEx','IS','Operating Expenses',14),
 ('6100','Selling & Marketing','OpEx','IS','Operating Expenses',15),
 ('6200','General & Administrative','OpEx','IS','Operating Expenses',16),
 ('6300','Personnel Costs','OpEx','IS','Operating Expenses',17),
 ('6400','Depreciation & Amortization','OpEx','IS','Operating Expenses',18),
 ('7000','Interest Income','Other','IS','Other Income (Expense)',19),
 ('7100','FX Gain / Loss','Other','IS','Other Income (Expense)',20);

create or replace table DIM_COST_CENTER (COST_CENTER_ID string, COST_CENTER_NAME string, BUSINESS_UNIT string, ENTITY_ID string) as
select * from values
 ('CC100','Finance','Finance','US01'),
 ('CC110','Belgium Finance','Belgium Finance','BE01'),
 ('CC200','Research & Development','R&D','US01'),
 ('CC300','Commercial','Commercial','US01'),
 ('CC400','Corporate Affairs','Corporate Affairs','US01'),
 ('CC500','Human Resources','HR','US01'),
 ('CC600','Manufacturing & Supply Chain','Manufacturing','US01'),
 ('CC700','IT & Data','IT & Data','US01');

create or replace table DIM_CUSTOMER (CUSTOMER_ID string, CUSTOMER_NAME string, SEGMENT string, REGION string, ENTITY_ID string,
  PAYMENT_TERMS_DAYS int, AVG_PAY_DELAY int, INV_PER_MONTH int, MONTHLY_AMT_START number, MONTHLY_AMT_END number, REVENUE_ACCOUNT_ID string) as
select * from values
 ('C001','Janssen Biotech Inc.','Collaboration Partner','US','US01',45,2,2,30000000,62000000,'4000'),
 ('C002','Janssen-Cilag International NV','Collaboration Partner','Europe','BE01',60,4,1,9000000,22000000,'4000'),
 ('C003','Janssen Pharmaceutical K.K.','Collaboration Partner','Japan','US01',60,3,1,2500000,6000000,'4000'),
 ('C004','McKesson Specialty Health','Distributor','US','US01',30,6,4,900000,1800000,'4200'),
 ('C005','Cardinal Health Specialty','Distributor','US','US01',30,12,4,700000,1500000,'4200'),
 ('C006','Cencora Specialty','Distributor','US','US01',30,5,3,600000,1200000,'4200'),
 ('C007','Uniklinik Koln CAR-T Center','Treatment Center','Europe','BE01',60,25,2,200000,500000,'4200'),
 ('C008','UZ Leuven','Treatment Center','Europe','BE01',60,18,2,150000,450000,'4200'),
 ('C009','Hopital Saint-Louis AP-HP','Treatment Center','Europe','BE01',90,35,2,150000,400000,'4200'),
 ('C010','Novotech Clinical Services','Research Services','APAC','IE01',45,10,1,150000,250000,'4200'),
 ('C011','Health Service Executive Ireland','Government','Europe','IE01',60,40,1,100000,300000,'4200');

create or replace table DIM_VENDOR (VENDOR_ID string, VENDOR_NAME string, CATEGORY string, ACCOUNT_ID string, COST_CENTER_ID string, ENTITY_ID string,
  PAYMENT_TERMS_DAYS int, INV_PER_MONTH int, MONTHLY_AMT_START number, MONTHLY_AMT_END number) as
select * from values
 ('V001','Lonza Biologics','CDMO - Viral Vector','1200','CC600','US01',60,3,11000000,15000000),
 ('V002','Thermo Fisher Scientific','Lab Supplies & Reagents','1200','CC600','US01',45,6,2500000,3500000),
 ('V003','Cryoport Systems','Cold Chain Logistics','5000','CC600','US01',30,4,1200000,2000000),
 ('V004','ICON plc','Clinical Research (CRO)','6000','CC200','US01',45,3,9000000,11000000),
 ('V005','IQVIA','Clinical Research (CRO)','6000','CC200','US01',45,2,3000000,4000000),
 ('V006','Charles River Laboratories','Preclinical Services','6000','CC200','US01',30,3,1200000,1800000),
 ('V007','WuXi AppTec','Preclinical Services','6000','CC200','US01',60,2,1600000,700000),
 ('V008','IPG Health','Marketing Agency','6100','CC300','US01',45,2,1600000,2400000),
 ('V009','Veeva Systems','Commercial Software','6100','CC300','US01',30,1,250000,300000),
 ('V010','Deloitte & Touche','Audit & Advisory','6200','CC100','US01',30,1,300000,350000),
 ('V011','PwC Belgium','Tax Advisory','6200','CC110','BE01',30,1,120000,150000),
 ('V012','Workday','HR Software','6200','CC500','US01',30,1,100000,120000),
 ('V013','Snowflake Inc.','Data Platform','6200','CC700','US01',30,1,80000,150000),
 ('V014','Microsoft','Cloud & Productivity','6200','CC700','US01',30,1,200000,250000),
 ('V015','Edelman','Corporate Communications','6200','CC400','US01',45,1,100000,120000),
 ('V016','Iron Mountain','Records Management','6200','CC100','US01',30,1,20000,30000),
 ('V017','SAP SE','ERP Software','6200','CC700','US01',30,1,150000,150000),
 ('V018','CBRE','Facilities','6200','CC600','US01',30,2,400000,500000);

create or replace table DIM_PERIOD as
select dateadd(month, i, '2024-01-01'::date) as PERIOD_START,
       last_day(dateadd(month, i, '2024-01-01'::date)) as PERIOD_END,
       to_char(dateadd(month, i, '2024-01-01'::date),'YYYY-MM') as PERIOD_NAME,
       year(dateadd(month, i, '2024-01-01'::date)) as FISCAL_YEAR,
       'Q'||quarter(dateadd(month, i, '2024-01-01'::date)) as FISCAL_QUARTER,
       i as PERIOD_INDEX
from (select row_number() over (order by seq4()) - 1 as i from table(generator(rowcount => 34)));

-- ---------------------------------------------------------------- AR subledger
create or replace table AR_INVOICES as
with idx as (select row_number() over (order by seq4()) as n from table(generator(rowcount => 10))),
raw as (
  select c.CUSTOMER_ID, c.ENTITY_ID, c.REVENUE_ACCOUNT_ID, c.PAYMENT_TERMS_DAYS,
         dateadd(day, uniform(0, 27, random()), p.PERIOD_START) as INVOICE_DATE,
         round((c.MONTHLY_AMT_START + (c.MONTHLY_AMT_END - c.MONTHLY_AMT_START) * p.PERIOD_INDEX / 33)
               / c.INV_PER_MONTH * uniform(85, 115, random()) / 100, 2) as AMOUNT_USD,
         c.AVG_PAY_DELAY + uniform(-5, 15, random())
           + iff(c.CUSTOMER_ID = 'C002' and p.PERIOD_START >= '2026-06-01', 50, 0)
           + iff(c.CUSTOMER_ID = 'C005' and p.PERIOD_START >= '2026-05-01', 20, 0) as PAY_DELAY
  from DIM_CUSTOMER c cross join DIM_PERIOD p join idx on idx.n <= c.INV_PER_MONTH
)
select 'INV-' || to_char(INVOICE_DATE, 'YYYYMM') || '-' || lpad(row_number() over (order by INVOICE_DATE, CUSTOMER_ID), 5, '0') as INVOICE_ID,
       CUSTOMER_ID, ENTITY_ID, INVOICE_DATE, dateadd(day, PAYMENT_TERMS_DAYS, INVOICE_DATE) as DUE_DATE,
       AMOUNT_USD, REVENUE_ACCOUNT_ID,
       iff(dateadd(day, PAYMENT_TERMS_DAYS + PAY_DELAY, INVOICE_DATE) <= '2026-10-27'::date,
           dateadd(day, PAYMENT_TERMS_DAYS + PAY_DELAY, INVOICE_DATE), null) as PAID_DATE
from raw where INVOICE_DATE <= '2026-10-27';

-- milestone invoices (License & Milestone Revenue)
insert into AR_INVOICES values
 ('INV-202406-M0001','C001','US01','2024-06-14','2024-07-29',35000000,'4100','2024-07-30'),
 ('INV-202503-M0002','C001','US01','2025-03-20','2025-05-04',50000000,'4100','2025-05-05'),
 ('INV-202609-M0003','C001','US01','2026-09-18','2026-11-02',25000000,'4100',null);

alter table AR_INVOICES add column AMOUNT_PAID number(18,2), STATUS string;
update AR_INVOICES set AMOUNT_PAID = iff(PAID_DATE is null, 0, AMOUNT_USD), STATUS = iff(PAID_DATE is null, 'Open', 'Paid');

-- ---------------------------------------------------------------- AP subledger
create or replace table AP_BILLS as
with idx as (select row_number() over (order by seq4()) as n from table(generator(rowcount => 10))),
raw as (
  select v.VENDOR_ID, v.ENTITY_ID, v.COST_CENTER_ID, v.ACCOUNT_ID, v.PAYMENT_TERMS_DAYS, p.PERIOD_START,
         dateadd(day, uniform(0, 27, random()), p.PERIOD_START) as BILL_DATE,
         round((v.MONTHLY_AMT_START + (v.MONTHLY_AMT_END - v.MONTHLY_AMT_START) * p.PERIOD_INDEX / 33)
               / v.INV_PER_MONTH * uniform(85, 115, random()) / 100
               * iff(v.VENDOR_ID = 'V004' and p.PERIOD_START = '2026-09-01', 2.4, 1)
               * iff(v.VENDOR_ID = 'V008' and p.PERIOD_START = '2026-06-01', 2.1, 1)
               * iff(v.VENDOR_ID = 'V010' and month(p.PERIOD_START) in (2,3), 2.5, 1)
               , 2) as AMOUNT_USD
  from DIM_VENDOR v cross join DIM_PERIOD p join idx on idx.n <= v.INV_PER_MONTH
)
select 'BILL-' || to_char(BILL_DATE, 'YYYYMM') || '-' || lpad(row_number() over (order by BILL_DATE, VENDOR_ID), 5, '0') as BILL_ID,
       VENDOR_ID || '-' || to_char(BILL_DATE,'YYMMDD') || '-' || uniform(100, 999, random()) as VENDOR_INVOICE_NO,
       VENDOR_ID, ENTITY_ID, COST_CENTER_ID, ACCOUNT_ID, BILL_DATE,
       dateadd(day, PAYMENT_TERMS_DAYS, BILL_DATE) as DUE_DATE, AMOUNT_USD,
       iff(dateadd(day, PAYMENT_TERMS_DAYS + PAY_JITTER, BILL_DATE) <= '2026-10-27'::date,
           dateadd(day, PAYMENT_TERMS_DAYS + PAY_JITTER, BILL_DATE), null) as PAID_DATE
from (select *, uniform(-5, 4, random()) as PAY_JITTER from raw) where BILL_DATE <= '2026-10-27';

-- duplicate ICON bill entered twice in September 2026 (close exception)
insert into AP_BILLS
select 'BILL-202609-DUP01', VENDOR_INVOICE_NO, VENDOR_ID, ENTITY_ID, COST_CENTER_ID, ACCOUNT_ID, dateadd(day, 3, BILL_DATE), DUE_DATE, AMOUNT_USD, null
from AP_BILLS where VENDOR_ID = 'V004' and BILL_DATE between '2026-09-01' and '2026-09-30'
qualify row_number() over (order by AMOUNT_USD desc) = 1;

alter table AP_BILLS add column AMOUNT_PAID number(18,2), STATUS string;
update AP_BILLS set AMOUNT_PAID = iff(PAID_DATE is null, 0, AMOUNT_USD), STATUS = iff(PAID_DATE is null, 'Open', 'Paid');

-- ---------------------------------------------------------------- General ledger (double entry, amount = debit - credit)
create or replace table GL_JOURNAL_LINES as
with lines as (

  select 'OPEN-2024' jid, 1 ln, '2024-01-01'::date dt, 'US01' ent, '1000' acct, null cc, 1300000000 amt, 'OPENING' src, 'OPENING' doc, 'Opening balance - cash' descr, 'SAP_MIGRATION' usr, false man
  union all select 'OPEN-2024',2,'2024-01-01','US01','1200',null,60000000,'OPENING','OPENING','Opening balance - inventory','SAP_MIGRATION',false
  union all select 'OPEN-2024',3,'2024-01-01','US01','1300',null,25000000,'OPENING','OPENING','Opening balance - prepaid','SAP_MIGRATION',false
  union all select 'OPEN-2024',4,'2024-01-01','US01','1500',null,420000000,'OPENING','OPENING','Opening balance - PP&E','SAP_MIGRATION',false
  union all select 'OPEN-2024',5,'2024-01-01','US01','3000',null,-1805000000,'OPENING','OPENING','Opening balance - APIC','SAP_MIGRATION',false

  union all select 'ARI-'||INVOICE_ID,1,INVOICE_DATE,ENTITY_ID,'1100',null,AMOUNT_USD,'AR',INVOICE_ID,'Customer invoice '||CUSTOMER_ID,'SAP_SD_BATCH',false from AR_INVOICES
  union all select 'ARI-'||INVOICE_ID,2,INVOICE_DATE,ENTITY_ID,REVENUE_ACCOUNT_ID,'CC300',-AMOUNT_USD,'AR',INVOICE_ID,'Revenue '||CUSTOMER_ID,'SAP_SD_BATCH',false from AR_INVOICES

  union all select 'ARP-'||INVOICE_ID,1,PAID_DATE,ENTITY_ID,'1000',null,AMOUNT_USD,'AR_RECEIPT',INVOICE_ID,'Cash receipt '||CUSTOMER_ID,'SAP_FI_BANK',false from AR_INVOICES where PAID_DATE is not null
  union all select 'ARP-'||INVOICE_ID,2,PAID_DATE,ENTITY_ID,'1100',null,-AMOUNT_USD,'AR_RECEIPT',INVOICE_ID,'Cash receipt '||CUSTOMER_ID,'SAP_FI_BANK',false from AR_INVOICES where PAID_DATE is not null

  union all select 'APB-'||BILL_ID,1,BILL_DATE,ENTITY_ID,ACCOUNT_ID,COST_CENTER_ID,AMOUNT_USD,'AP',BILL_ID,'Vendor bill '||VENDOR_ID,'SAP_MM_BATCH',false from AP_BILLS
  union all select 'APB-'||BILL_ID,2,BILL_DATE,ENTITY_ID,'2000',null,-AMOUNT_USD,'AP',BILL_ID,'Vendor bill '||VENDOR_ID,'SAP_MM_BATCH',false from AP_BILLS

  union all select 'APP-'||BILL_ID,1,PAID_DATE,ENTITY_ID,'2000',null,AMOUNT_USD,'AP_PAYMENT',BILL_ID,'Vendor payment '||VENDOR_ID,'SAP_FI_PAYRUN',false from AP_BILLS where PAID_DATE is not null
  union all select 'APP-'||BILL_ID,2,PAID_DATE,ENTITY_ID,'1000',null,-AMOUNT_USD,'AP_PAYMENT',BILL_ID,'Vendor payment '||VENDOR_ID,'SAP_FI_PAYRUN',false from AP_BILLS where PAID_DATE is not null
)
select jid::string as JOURNAL_ID, ln::int as LINE_NO, dt::date as POSTING_DATE, date_trunc(month, dt)::date as FISCAL_PERIOD, ent::string as ENTITY_ID,
       acct::string as ACCOUNT_ID, cc::string as COST_CENTER_ID, greatest(amt,0)::number(18,2) as DEBIT, greatest(-amt,0)::number(18,2) as CREDIT,
       amt::number(18,2) as AMOUNT, src::string as SOURCE, doc::string as DOC_REF, descr::string as DESCRIPTION, usr::string as POSTED_BY, man::boolean as IS_MANUAL
from lines;

-- recurring month-end journals (only where posting date <= cutoff, so Oct-2026 month-end entries are still pending)
insert into GL_JOURNAL_LINES
with pay as (
  select * from values ('CC100','US01',800000,1100000),('CC110','BE01',300000,420000),('CC200','US01',6000000,8200000),
    ('CC300','US01',3000000,5200000),('CC400','US01',300000,380000),('CC500','US01',400000,520000),
    ('CC600','US01',4000000,5300000),('CC700','US01',600000,900000) t(cc, ent, s, e)
),
rev as (
  select date_trunc(month, POSTING_DATE)::date per, ENTITY_ID ent, -sum(AMOUNT) r
  from GL_JOURNAL_LINES where ACCOUNT_ID = '4000' group by 1,2
),
je as (

  select 'PAY-'||to_char(p.PERIOD_START,'YYYYMM')||'-'||pay.cc jid, dateadd(day,24,p.PERIOD_START) dt, pay.ent ent,
         '6300' dr, '1000' cr, pay.cc cc, round((pay.s + (pay.e-pay.s)*p.PERIOD_INDEX/33)*uniform(97,103,random())/100,2) amt,
         'PAYROLL' src, 'Payroll '||pay.cc descr, 'ADP_INTERFACE' usr
  from DIM_PERIOD p cross join pay

  union all select 'COGS-'||to_char(per,'YYYYMM')||'-'||ent, last_day(per), ent, '5000','1200','CC600', round(r*0.22,2), 'COGS','Cost of collaboration revenue relief','SAP_CO_SETTLE' from rev

  union all select 'DEP-'||to_char(PERIOD_START,'YYYYMM')||'-US01', PERIOD_END, 'US01','6400','1500','CC600', 3500000,'DEPRECIATION','Monthly depreciation','SAP_AA_RUN' from DIM_PERIOD
  union all select 'DEP-'||to_char(PERIOD_START,'YYYYMM')||'-BE01', PERIOD_END, 'BE01','6400','1500','CC600', 1000000,'DEPRECIATION','Monthly depreciation - Ghent','SAP_AA_RUN' from DIM_PERIOD

  union all select 'INT-'||to_char(PERIOD_START,'YYYYMM'), PERIOD_END, 'US01','1000','7000','CC100', round(uniform(3200000,3900000,random()),2),'INTEREST','Interest income - money market','SAP_TR' from DIM_PERIOD

  union all select 'FX-'||to_char(PERIOD_START,'YYYYMM'), PERIOD_END, 'BE01','7100','1000','CC110', round(uniform(-600000,600000,random()),2),'FX_REVAL','EUR revaluation','SAP_FX_RUN' from DIM_PERIOD

  union all select 'ACC-'||to_char(PERIOD_START,'YYYYMM'), PERIOD_END, 'US01','6000','2100','CC200', round(uniform(1500000,3000000,random()),2),'ACCRUAL','Clinical trial accrual','J.CHEN' from DIM_PERIOD
)
select jid, ln, dt, date_trunc(month, dt)::date, ent, acct, lcc, greatest(a,0), greatest(-a,0), a, src, jid, descr, usr, src = 'ACCRUAL'
from (
  select jid, 1 ln, dt, ent, dr acct, cc lcc, amt a, src, descr, usr from je
  union all select jid, 2, dt, ent, cr, iff(cr like '6%' or cr like '5%' or cr like '7%', cc, null), -amt, src, descr, usr from je
) where dt <= '2026-10-27';

-- accrual reversals on day 1 of following month
insert into GL_JOURNAL_LINES
select 'REV-'||JOURNAL_ID, LINE_NO, dateadd(day,1,POSTING_DATE), dateadd(day,1,POSTING_DATE), ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID,
       CREDIT, DEBIT, -AMOUNT, 'ACCRUAL_REVERSAL', JOURNAL_ID, 'Reversal: '||DESCRIPTION, 'SAP_AUTO_REV', false
from GL_JOURNAL_LINES where SOURCE = 'ACCRUAL' and dateadd(day,1,POSTING_DATE) <= '2026-10-27';

-- manual journal entries, some anomalous
insert into GL_JOURNAL_LINES (JOURNAL_ID, LINE_NO, POSTING_DATE, FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID, DEBIT, CREDIT, AMOUNT, SOURCE, DOC_REF, DESCRIPTION, POSTED_BY, IS_MANUAL)
select jid, ln, dt, date_trunc(month, dt), ent, acct, cc, greatest(a,0), greatest(-a,0), a, 'MANUAL', jid, d, u, true from values
 ('MJE-25-0141',1,'2025-11-15'::date,'US01','6200','CC100', 2500000,'Consulting fee adjustment','T.WALSH'),
 ('MJE-25-0141',2,'2025-11-15'::date,'US01','1000',null,   -2500000,'Consulting fee adjustment','T.WALSH'),
 ('MJE-26-0033',1,'2026-03-29'::date,'BE01','6100','CC300',  999999,'Marketing reclass','INTERN_BE01'),
 ('MJE-26-0033',2,'2026-03-29'::date,'BE01','2100',null,    -999999,'Marketing reclass','INTERN_BE01'),
 ('MJE-26-0102',1,'2026-07-04'::date,'US01','4200','CC300', 1750000,'Revenue reversal - distributor credit','M.ORTIZ'),
 ('MJE-26-0102',2,'2026-07-04'::date,'US01','1100',null,   -1750000,'Revenue reversal - distributor credit','M.ORTIZ'),
 ('MJE-26-0167',1,'2026-09-27'::date,'US01','6000','CC200', 4000000,'Top-side R&D accrual true-up','CFO_DELEGATE'),
 ('MJE-26-0167',2,'2026-09-27'::date,'US01','2100',null,   -4000000,'Top-side R&D accrual true-up','CFO_DELEGATE'),
 ('MJE-26-0171',1,'2026-09-30'::date,'IE01','1300',null,    350000,'Prepaid insurance','J.CHEN'),
 ('MJE-26-0171',2,'2026-09-30'::date,'IE01','1000',null,   -350000,'Prepaid insurance','J.CHEN'),
 ('MJE-26-0188',1,'2026-10-12'::date,'US01','6100','CC300',  520000,'Speaker program accrual','M.ORTIZ'),
 ('MJE-26-0188',2,'2026-10-12'::date,'US01','2100',null,    -520000,'Speaker program accrual','M.ORTIZ')
 t(jid, ln, dt, ent, acct, cc, a, d, u);

-- close exception: largest Oct-2026 Cardinal invoice exists in AR subledger but was never posted to GL (interface failure)
delete from GL_JOURNAL_LINES where JOURNAL_ID = (
  select 'ARI-'||INVOICE_ID from AR_INVOICES where CUSTOMER_ID = 'C005' and INVOICE_DATE >= '2026-10-01'
  qualify row_number() over (order by AMOUNT_USD desc) = 1);

-- ---------------------------------------------------------------- Budget (IS accounts, trailing-6-month run rate +2%)
create or replace table BUDGET as
with act as (
  select FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, coalesce(COST_CENTER_ID,'NA') COST_CENTER_ID,
         sum(iff(a.ACCOUNT_TYPE in ('Revenue','Other'), -AMOUNT, AMOUNT)) v
  from GL_JOURNAL_LINES g join DIM_ACCOUNT a using (ACCOUNT_ID)
  where a.STATEMENT = 'IS' and g.SOURCE not in ('MANUAL') and g.ACCOUNT_ID not in ('4100','7100')
  group by 1,2,3,4
),
grid as (
  select p.PERIOD_START, a.ENTITY_ID, a.ACCOUNT_ID, a.COST_CENTER_ID, coalesce(x.v, 0) v
  from DIM_PERIOD p cross join (select distinct ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID from act) a
  left join act x on x.FISCAL_PERIOD = p.PERIOD_START and x.ENTITY_ID = a.ENTITY_ID and x.ACCOUNT_ID = a.ACCOUNT_ID and x.COST_CENTER_ID = a.COST_CENTER_ID
)
select PERIOD_START as FISCAL_PERIOD, ENTITY_ID, ACCOUNT_ID, nullif(COST_CENTER_ID,'NA') as COST_CENTER_ID,
       round(coalesce(avg(v) over (partition by ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID order by PERIOD_START rows between 6 preceding and 1 preceding), v) * 1.02, 2) as BUDGET_AMOUNT
from grid;

-- ---------------------------------------------------------------- Month-end close
create or replace table CLOSE_TASK_TEMPLATE (TASK_CODE string, TASK_NAME string, CATEGORY string, OWNER string, DUE_BD int, DEPENDS_ON string, AUTOMATION_STATUS string) as
select * from values
 ('T01','Confirm SAP sub-ledger cut-off','Pre-Close','J.CHEN',-1,null,'Automated'),
 ('T02','Bank reconciliation - all entities','Cash','A.PATEL',1,'T01','Automated'),
 ('T03','Cash application of customer receipts','AR','A.PATEL',1,'T01','Automated'),
 ('T04','AR sub-ledger to GL reconciliation','AR','A.PATEL',2,'T03','Automated'),
 ('T05','AR aging review & bad-debt reserve','AR','M.ORTIZ',3,'T04','Manual (Excel)'),
 ('T06','AP invoice cut-off & duplicate check','AP','R.KUMAR',1,'T01','Automated'),
 ('T07','AP sub-ledger to GL reconciliation','AP','R.KUMAR',2,'T06','Automated'),
 ('T08','Clinical trial (CRO) accruals','Accruals','J.CHEN',2,'T06','Manual (Excel)'),
 ('T09','Payroll & bonus accruals','Accruals','L.DUBOIS',2,null,'Manual (Excel)'),
 ('T10','Carvykti collaboration revenue true-up (J&J)','Revenue','S.WONG',3,'T04','Manual (Excel)'),
 ('T11','Profit split calculation - Janssen','Revenue','HAREESH',3,'T10','Automated'),
 ('T12','Inventory valuation & COGS relief','Inventory','R.KUMAR',3,'T07','Manual (Excel)'),
 ('T13','Fixed asset depreciation run','Fixed Assets','L.DUBOIS',2,null,'Automated'),
 ('T14','Intercompany reconciliation US01/BE01/IE01','Intercompany','L.DUBOIS',3,'T02','Manual (Excel)'),
 ('T15','FX revaluation - EUR entities','Intercompany','L.DUBOIS',3,'T14','Automated'),
 ('T16','GL journal anomaly review','Review','J.CHEN',4,'T08','Automated'),
 ('T17','Balance sheet account reconciliations','Review','A.PATEL',4,'T16','Manual (Excel)'),
 ('T18','Budget vs actual flux analysis','Reporting','S.WONG',5,'T17','Manual (Excel)'),
 ('T19','Income statement & balance sheet package','Reporting','S.WONG',5,'T18','Manual (Excel)'),
 ('T20','Controller review & sign-off','Sign-off','CONTROLLER',6,'T19','Manual'),
 ('T21','CFO sign-off & period lock','Sign-off','CFO',6,'T20','Manual');

create or replace table CLOSE_PERIODS as
select PERIOD_START as FISCAL_PERIOD, PERIOD_NAME,
       iff(PERIOD_START < '2026-10-01', 'Closed', 'In Progress') as STATUS,
       dateadd(day, 1, PERIOD_END) as CLOSE_START_DATE,
       iff(PERIOD_START < '2026-10-01',
           greatest(5, round(11 - PERIOD_INDEX * 0.15 + uniform(-1, 1, random())))::int, null) as BUSINESS_DAYS_TO_CLOSE,
       iff(PERIOD_START < '2025-07-01', 'Excel / pivot tables', iff(PERIOD_START < '2026-04-01', 'Hybrid (Excel + Snowflake)', 'Snowflake automated')) as CLOSE_METHOD
from DIM_PERIOD;

create or replace table CLOSE_TASKS as
select p.FISCAL_PERIOD, t.TASK_CODE, t.TASK_NAME, t.CATEGORY, t.OWNER, t.DUE_BD, t.DEPENDS_ON,
       iff(p.FISCAL_PERIOD < '2026-04-01' and t.AUTOMATION_STATUS = 'Automated' and t.TASK_CODE not in ('T01','T02','T13'), 'Manual (Excel)', t.AUTOMATION_STATUS) as AUTOMATION_STATUS,
       case when p.STATUS = 'Closed' then 'Complete'
            when t.TASK_CODE in ('T01','T09','T13') then 'In Progress'
            else 'Not Started' end::varchar(50) as STATUS,
       case when p.STATUS = 'Closed' then greatest(1, least(p.BUSINESS_DAYS_TO_CLOSE, t.DUE_BD + uniform(-1, 2, random()))) end as COMPLETED_BD,
       case when p.STATUS = 'Closed' then round(iff(t.AUTOMATION_STATUS like 'Manual%' or p.FISCAL_PERIOD < '2026-04-01', uniform(3, 9, random()), uniform(0.2, 1.0, random())), 1) end as EFFORT_HOURS,
       null::string as NOTES
from CLOSE_PERIODS p cross join CLOSE_TASK_TEMPLATE t;

-- ---------------------------------------------------------------- Profit split (Carvykti / Janssen, ex-Greater China 50/50)
create or replace table PROFIT_SPLIT as
with r as (select * from values ('United States',70000000,145000000),('Europe',18000000,48000000),('Rest of World',3000000,11000000) t(region, s, e)),
s1 as (
  select p.PERIOD_START, r.region,
         round((r.s + (r.e-r.s)*p.PERIOD_INDEX/33) * uniform(94,106,random())/100, 2) as ns,
         uniform(24,28,random())/100 as cogs_pct, uniform(18,23,random())/100 as comm_pct, uniform(4,6,random())/100 as med_pct
  from DIM_PERIOD p cross join r where p.PERIOD_START <= '2026-09-01'
),
s2 as (select *, round(ns*cogs_pct,2) cogs, round(ns*comm_pct,2) comm, round(ns*med_pct,2) med from s1)
select PERIOD_START as FISCAL_PERIOD, region as REGION, ns as CARVYKTI_NET_SALES, cogs as COST_OF_GOODS,
       comm as COMMERCIAL_EXPENSES, med as MEDICAL_AFFAIRS_EXPENSES, ns - cogs - comm - med as PRETAX_PROFIT,
       0.50 as LEGEND_SHARE_PCT, round((ns - cogs - comm - med) * 0.50, 2) as LEGEND_PROFIT_SHARE,
       round((ns - cogs - comm - med) * 0.50, 2) as JANSSEN_PROFIT_SHARE,
       iff(PERIOD_START = '2026-09-01', 'Preliminary', 'Final') as STATUS,
       'sharepoint://Finance/ProfitSplit/Carvykti_PS_' || to_char(PERIOD_START,'YYYY_MM') || '.xlsx' as SOURCE_FILE
from s2;

-- ---------------------------------------------------------------- FinOps: Snowflake consumption & chargeback
create or replace table SNOWFLAKE_CONSUMPTION as
with wh as (
  select * from values
   ('LEGEND_NONGXP_PROD','FIN_CLOSE_WH','Finance','Month-End Close Automation','CC100',6,true,true),
   ('LEGEND_NONGXP_PROD','PROFIT_SPLIT_WH','Finance','Profit Split','CC100',4,true,true),
   ('LEGEND_READER_BE','BE_FINANCE_WH','Belgium Finance','Belgium Statutory Reporting','CC110',2,true,false),
   ('LEGEND_GXP_PROD','RD_CLINICAL_WH','R&D','Clinical Data Analytics','CC200',22,true,false),
   ('LEGEND_GXP_PROD','MFG_QC_WH','Manufacturing','Batch Release & QC','CC600',14,true,false),
   ('LEGEND_NONGXP_PROD','COMMERCIAL_BI_WH','Commercial','Power BI Commercial Dashboards','CC300',12,true,false),
   ('LEGEND_NONGXP_PROD','CORP_AFFAIRS_WH','Corporate Affairs','Media & Stakeholder Analytics','CC400',1.5,true,false),
   ('LEGEND_NONGXP_PROD','HR_ANALYTICS_WH','HR','Workday People Analytics','CC500',2,true,false),
   ('LEGEND_NONGXP_PROD','SAP_INGEST_WH','IT & Data','SAP Ingestion Pipeline','CC700',9,true,false),
   ('LEGEND_NONGXP_PROD','ADHOC_WH',null,null,null,7,false,false),
   ('LEGEND_GXP_PROD','COMPUTE_WH',null,null,null,5,false,false)
   t(acct, wh, bu, proj, cc, base, tagged, close_spike)
),
d as (select dateadd(day, row_number() over (order by seq4()) - 1, '2025-01-01'::date) dt from table(generator(rowcount => 665))),
u as (
select d.dt as USAGE_DATE, wh.acct as ACCOUNT_NAME, wh.wh as WAREHOUSE_NAME, wh.bu as BUSINESS_UNIT, wh.proj as PROJECT,
       wh.cc as COST_CENTER_ID, wh.tagged as IS_TAGGED,
       round(wh.base * iff(dayofweekiso(d.dt) >= 6, 0.25, 1) * (1 + datediff(day,'2025-01-01',d.dt)/900)
             * iff(wh.close_spike and day(d.dt) <= 6, 3.5, 1)
             * iff(wh.wh = 'ADHOC_WH' and d.dt >= '2026-08-01', 2.2, 1)
             * uniform(80,120,random())/100, 3) as CREDITS_USED,
       iff(wh.acct = 'LEGEND_READER_BE', 3.10, 2.90) as PRICE_PER_CREDIT
from d cross join wh where d.dt <= '2026-10-27')
select *, round(CREDITS_USED * PRICE_PER_CREDIT, 2) as COST_USD from u;

create or replace table FINOPS_BUDGET as
select p.PERIOD_START as FISCAL_PERIOD, b.bu::string as BUSINESS_UNIT, (b.budget * 30)::number(18,2) as MONTHLY_BUDGET_USD
from DIM_PERIOD p cross join (select * from values ('Finance',1500),('Belgium Finance',220),('R&D',2600),('Manufacturing',1600),
 ('Commercial',1400),('Corporate Affairs',160),('HR',220),('IT & Data',1000) t(bu, budget)) b
where p.PERIOD_START >= '2025-01-01';
