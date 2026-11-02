-- Month-end close workflow: configurable check rules, issues with owners/SLA, notifications,
-- guided fixes with Controller approval, audit trail, and a daily scheduled run.
use role __ROLE__;
use warehouse __WAREHOUSE__;
use schema __DB__.FINANCE;

-- ------------------------------------------------------------------ people
create or replace table CLOSE_OWNERS (OWNER string, FULL_NAME string, TITLE string, EMAIL string, IS_APPROVER boolean) as
select * from values
 ('J.CHEN',     'Jenny Chen',     'Assistant Controller',        '__NOTIFY_EMAIL__', false),
 ('A.PATEL',    'Arjun Patel',    'Senior Accountant, Cash & AR', '__NOTIFY_EMAIL__', false),
 ('M.ORTIZ',    'Maria Ortiz',    'Revenue & AR Manager',        '__NOTIFY_EMAIL__', false),
 ('R.KUMAR',    'Ravi Kumar',     'AP & Inventory Lead',         '__NOTIFY_EMAIL__', false),
 ('L.DUBOIS',   'Luc Dubois',     'Belgium Finance Manager',     '__NOTIFY_EMAIL__', false),
 ('S.WONG',     'Sarah Wong',     'FP&A Director',               '__NOTIFY_EMAIL__', false),
 ('HAREESH',    'Hareesh',        'Data Engineer, Profit Split', '__NOTIFY_EMAIL__', false),
 ('CONTROLLER', 'Corporate Controller', 'Controller',            '__NOTIFY_EMAIL__', true),
 ('CFO',        'Chief Financial Officer', 'CFO',                '__NOTIFY_EMAIL__', true);

-- ------------------------------------------------------------------ rules
-- CHECK_SQL must return REFERENCE, COUNTERPARTY, AMOUNT, DETAIL, SEVERITY (null = rule default).
-- No rows = pass. Placeholders: {{PERIOD}} = period being closed, {{AS_OF}} = data as-of date.
create or replace table CLOSE_CHECK_RULES (
  RULE_ID string, TASK_CODE string, RULE_NAME string, DESCRIPTION string, CHECK_SQL string,
  SEVERITY string, FIX_ACTION string, ENABLED boolean, SORT_ORDER int,
  UPDATED_BY string default current_user(), UPDATED_AT timestamp_ltz default current_timestamp());

insert into CLOSE_CHECK_RULES (RULE_ID, TASK_CODE, RULE_NAME, DESCRIPTION, CHECK_SQL, SEVERITY, FIX_ACTION, ENABLED, SORT_ORDER)
select * from values
('R00','T01','Sub-ledger cut-off not loaded',
 'AR, AP and GL feeds from SAP must be loaded within 3 days of the as-of date.',
 $$select 'CUTOFF' REFERENCE, 'SAP feeds' COUNTERPARTY, null AMOUNT,
   'Latest GL posting ' || to_char(max(POSTING_DATE),'YYYY-MM-DD') DETAIL, null SEVERITY
   from __DB__.FINANCE.GL_JOURNAL_LINES having max(POSTING_DATE) < dateadd(day, -3, {{AS_OF}}::date)$$,
 'High','INVESTIGATE',true,0),
('R01','T04','AR invoice not posted to GL',
 'Every SAP SD invoice must have a matching AR journal in the GL.',
 $$select i.INVOICE_ID REFERENCE, c.CUSTOMER_NAME COUNTERPARTY, i.AMOUNT_USD AMOUNT,
   'Invoice dated ' || to_char(i.INVOICE_DATE,'YYYY-MM-DD') || ' is in the SAP SD sub-ledger but has no GL journal (interface failure)' DETAIL, null SEVERITY
   from __DB__.FINANCE.AR_INVOICES i join __DB__.FINANCE.DIM_CUSTOMER c using (CUSTOMER_ID)
   where not exists (select 1 from __DB__.FINANCE.GL_JOURNAL_LINES g where g.DOC_REF = i.INVOICE_ID and g.SOURCE = 'AR')$$,
 'High','POST_AR_INVOICE',true,1),
('R02','T04','AR sub-ledger does not tie to GL',
 'Open AR in the sub-ledger must equal GL account 1100 for each entity (tolerance $1).',
 $$select 'AR-RECON-' || ENTITY_ID REFERENCE, ENTITY_ID COUNTERPARTY, DIFFERENCE AMOUNT,
   'Sub-ledger ' || to_char(SUBLEDGER_BALANCE,'999,999,999,990') || ' vs GL ' || to_char(GL_BALANCE,'999,999,999,990') DETAIL, null SEVERITY
   from __DB__.FINANCE.V_SUBLEDGER_RECON where LEDGER = 'AR' and abs(DIFFERENCE) >= 1$$,
 'High','INVESTIGATE',true,2),
('R03','T06','Possible duplicate vendor bill',
 'A vendor invoice number may only be posted once per vendor.',
 $$select BILL_ID REFERENCE, v.VENDOR_NAME COUNTERPARTY, AMOUNT_USD AMOUNT,
   'Same vendor invoice ' || VENDOR_INVOICE_NO || ' already posted as ' || FIRST_BILL || ' on ' || to_char(FIRST_DATE,'YYYY-MM-DD') DETAIL, null SEVERITY
   from (select b.*, first_value(BILL_ID) over (partition by VENDOR_ID, VENDOR_INVOICE_NO order by BILL_DATE, BILL_ID) FIRST_BILL,
                first_value(BILL_DATE) over (partition by VENDOR_ID, VENDOR_INVOICE_NO order by BILL_DATE, BILL_ID) FIRST_DATE
         from __DB__.FINANCE.AP_BILLS b where STATUS <> 'Void') x
   join __DB__.FINANCE.DIM_VENDOR v using (VENDOR_ID) where BILL_ID <> FIRST_BILL$$,
 'High','VOID_DUPLICATE_BILL',true,3),
('R04','T07','AP sub-ledger does not tie to GL',
 'Open AP in the sub-ledger must equal GL account 2000 for each entity (tolerance $1).',
 $$select 'AP-RECON-' || ENTITY_ID REFERENCE, ENTITY_ID COUNTERPARTY, DIFFERENCE AMOUNT,
   'Sub-ledger ' || to_char(SUBLEDGER_BALANCE,'999,999,999,990') || ' vs GL ' || to_char(GL_BALANCE,'999,999,999,990') DETAIL, null SEVERITY
   from __DB__.FINANCE.V_SUBLEDGER_RECON where LEDGER = 'AP' and abs(DIFFERENCE) >= 1$$,
 'High','INVESTIGATE',true,4),
('R05','T05','Receivable > 30 days past due',
 'Open invoices over $100K that are more than 30 days past due need collection follow-up.',
 $$select INVOICE_ID REFERENCE, CUSTOMER_NAME COUNTERPARTY, OPEN_AMOUNT AMOUNT,
   DAYS_PAST_DUE || ' days past due (due ' || to_char(DUE_DATE,'YYYY-MM-DD') || ')' DETAIL,
   iff(SEGMENT = 'Collaboration Partner', 'High', null) SEVERITY
   from __DB__.FINANCE.V_AR_AGING where DAYS_PAST_DUE > 30 and OPEN_AMOUNT > 100000$$,
 'Medium','SEND_COLLECTIONS',true,5),
('R06','T16','Unusual manual journal entry',
 'Manual JEs posted on weekends, by non-authorized users, in round amounts or above $250K require review.',
 $$select g.JOURNAL_ID REFERENCE, g.POSTED_BY COUNTERPARTY, g.DEBIT AMOUNT,
   case when g.POSTED_BY like 'INTERN%' then 'Posted by non-authorized user'
        when dayofweekiso(g.POSTING_DATE) >= 6 then 'Posted on a weekend'
        when mod(g.DEBIT, 1000000) in (0, 999999) or mod(g.DEBIT, 100000) = 0 then 'Round-dollar amount'
        else 'Above $250K review threshold' end || ': ' || g.DESCRIPTION DETAIL,
   iff(g.DEBIT >= 2000000 or g.POSTED_BY like 'INTERN%', 'High', null) SEVERITY
   from __DB__.FINANCE.GL_JOURNAL_LINES g
   where g.SOURCE = 'MANUAL' and g.DEBIT > 250000 and g.POSTING_DATE >= '2026-01-01'
     and not exists (select 1 from __DB__.FINANCE.JOURNAL_REVIEWS r where r.JOURNAL_ID = g.JOURNAL_ID)$$,
 'Medium','REVIEW_JOURNAL',true,6),
('R07','T11','Profit split not final',
 'The Janssen profit split for prior months must be confirmed Final before the revenue true-up.',
 $$select 'PS-' || to_char(FISCAL_PERIOD,'YYYY-MM') REFERENCE, 'Janssen (J&J)' COUNTERPARTY, sum(LEGEND_PROFIT_SHARE) AMOUNT,
   'Profit split for ' || to_char(FISCAL_PERIOD,'YYYY-MM') || ' is still Preliminary' DETAIL, null SEVERITY
   from __DB__.FINANCE.PROFIT_SPLIT where STATUS = 'Preliminary' group by FISCAL_PERIOD$$,
 'Medium','CONFIRM_PROFIT_SPLIT',true,7),
('R08','T18','P&L flux > 3 standard deviations',
 'Account / cost-center months that move more than 3 sigma vs the trailing 12 months need a flux explanation.',
 $$select 'FLUX-' || ACCOUNT_ID || '-' || coalesce(COST_CENTER_ID,'NA') || '-' || to_char(FISCAL_PERIOD,'YYYY-MM') REFERENCE,
   ACCOUNT_NAME || coalesce(' / ' || BUSINESS_UNIT, '') COUNTERPARTY, ACTUAL_AMOUNT - TRAILING_AVG AMOUNT,
   to_char(FISCAL_PERIOD,'YYYY-MM') || ' actual ' || to_char(ACTUAL_AMOUNT,'999,999,990') || ' vs 12-mo avg ' || to_char(TRAILING_AVG,'999,999,990') || ' (z=' || Z_SCORE || ')' DETAIL, null SEVERITY
   from __DB__.FINANCE.V_GL_ANOMALIES where FISCAL_PERIOD = dateadd(month, -1, {{PERIOD}}::date)$$,
 'Medium','INVESTIGATE',true,8);

-- ------------------------------------------------------------------ issues and audit trail
create table if not exists JOURNAL_REVIEWS (JOURNAL_ID string, DECISION string, REVIEWED_BY string, REVIEWED_AT timestamp_ltz, COMMENT string);

create or replace table CLOSE_CHECK_RUNS (RUN_ID string, FISCAL_PERIOD date, RUN_AT timestamp_ltz, TRIGGERED_BY string, SUMMARY variant);
create or replace table CLOSE_CHECK_RESULTS (RUN_ID string, RULE_ID string, REFERENCE string, COUNTERPARTY string, AMOUNT number(18,2), DETAIL string, SEVERITY string);

create or replace table CLOSE_ISSUES (
  ISSUE_ID string, ISSUE_KEY string, FISCAL_PERIOD date, RULE_ID string, TASK_CODE string, TITLE string,
  REFERENCE string, COUNTERPARTY string, AMOUNT number(18,2), DETAIL string, SEVERITY string, FIX_ACTION string,
  OWNER string, APPROVER string, STATUS string, SLA_DUE date,
  PROPOSED_BY string, PROPOSED_AT timestamp_ltz, PROPOSED_OPTION string, PROPOSAL_NOTE string,
  RESOLVED_BY string, RESOLVED_AT timestamp_ltz, RESOLUTION string,
  NOTIFIED_AT timestamp_ltz, ESCALATED_AT timestamp_ltz, CREATED_AT timestamp_ltz, CREATED_RUN string, LAST_SEEN_RUN string);

create or replace table CLOSE_ISSUE_EVENTS (EVENT_ID string default uuid_string(), ISSUE_ID string, EVENT_AT timestamp_ltz default current_timestamp(),
  ACTOR string, EVENT_TYPE string, MESSAGE string);

-- Open issues, shaped like the original exceptions view so reports, the semantic view and the agent keep working
create or replace view V_CLOSE_EXCEPTIONS as
select TITLE as EXCEPTION_TYPE, TASK_CODE, REFERENCE, COUNTERPARTY, AMOUNT, SEVERITY, DETAIL, STATUS, OWNER, SLA_DUE, ISSUE_ID
from CLOSE_ISSUES where STATUS <> 'Resolved' and FISCAL_PERIOD = '2026-10-01';

-- voided duplicate bills are excluded from the AP sub-ledger
create or replace view V_SUBLEDGER_RECON as
with sl as (
  select 'AR' LEDGER, ENTITY_ID, sum(AMOUNT_USD - AMOUNT_PAID) bal from AR_INVOICES group by 2
  union all select 'AP', ENTITY_ID, sum(AMOUNT_USD - AMOUNT_PAID) from AP_BILLS where STATUS <> 'Void' group by 2
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

create or replace function HTML_ESC(S string) returns string as
$$ replace(replace(replace(coalesce(S, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

-- ------------------------------------------------------------------ email
create notification integration if not exists LEGEND_CLOSE_EMAIL
  type = email enabled = true
  comment = 'Legend Biotech month-end close notifications';

create or replace procedure SEND_CLOSE_EMAIL(TO_EMAIL string, SUBJECT string, BODY_HTML string)
returns string language sql execute as owner as
$$
declare
  cfg string;
  html string;
begin
  cfg := to_json(object_construct('LEGEND_CLOSE_EMAIL', object_construct('subject', :SUBJECT, 'toAddress', array_construct(:TO_EMAIL))));
  html := '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937">' || :BODY_HTML ||
          '<p style="color:#6b7280;font-size:12px;margin-top:24px">Legend Finance Hub · month-end close · simulated demo data. ' ||
          'Open the close workspace: <a href="http://localhost:3010/close">http://localhost:3010/close</a></p></div>';
  call SYSTEM$SEND_SNOWFLAKE_NOTIFICATION(SNOWFLAKE.NOTIFICATION.TEXT_HTML(:html), :cfg);
  return 'sent';
end;
$$;

-- ------------------------------------------------------------------ run checks
create or replace procedure RUN_CLOSE_CHECKS(PERIOD date, TRIGGERED_BY string)
returns variant language sql execute as owner as
$$
declare
  run_id string default uuid_string();
  check_sql string;
  ok_rules array default array_construct();
  errors array default array_construct();
  summary variant;
  c cursor for select RULE_ID, CHECK_SQL from __DB__.FINANCE.CLOSE_CHECK_RULES where ENABLED order by SORT_ORDER;
begin
  for r in c do
    check_sql := replace(replace(r.CHECK_SQL, '{{PERIOD}}', '''' || :PERIOD::string || ''''), '{{AS_OF}}', '''2026-10-27''');
    begin
      execute immediate 'insert into __DB__.FINANCE.CLOSE_CHECK_RESULTS select ''' || :run_id || ''', ''' || r.RULE_ID ||
        ''', x.REFERENCE::string, x.COUNTERPARTY::string, x.AMOUNT::number(18,2), x.DETAIL::string, x.SEVERITY::string from (' || :check_sql || ') x';
      ok_rules := array_append(:ok_rules, r.RULE_ID);
    exception
      when other then
        errors := array_append(:errors, object_construct('rule_id', r.RULE_ID, 'error', sqlerrm));
    end;
  end for;

  -- new findings become issues, routed to the task owner with an SLA from the close calendar (BD1 = Mon 2026-11-02)
  insert into __DB__.FINANCE.CLOSE_ISSUES
  select uuid_string(), res.RULE_ID || '|' || res.REFERENCE, :PERIOD, rl.RULE_ID, rl.TASK_CODE, rl.RULE_NAME,
         res.REFERENCE, res.COUNTERPARTY, res.AMOUNT, res.DETAIL, coalesce(res.SEVERITY, rl.SEVERITY), rl.FIX_ACTION,
         t.OWNER, 'CONTROLLER', 'Open',
         dateadd(day, t.DUE_BD - 1 + iff(t.DUE_BD > 5, 2, 0), dateadd(day, 1, last_day(:PERIOD)) + 1),
         null, null, null, null, null, null, null, null, null, current_timestamp(), :run_id, :run_id
  from __DB__.FINANCE.CLOSE_CHECK_RESULTS res
  join __DB__.FINANCE.CLOSE_CHECK_RULES rl on rl.RULE_ID = res.RULE_ID
  join __DB__.FINANCE.CLOSE_TASK_TEMPLATE t on t.TASK_CODE = rl.TASK_CODE
  where res.RUN_ID = :run_id
    and not exists (select 1 from __DB__.FINANCE.CLOSE_ISSUES i where i.ISSUE_KEY = res.RULE_ID || '|' || res.REFERENCE and i.FISCAL_PERIOD = :PERIOD);

  insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE)
  select ISSUE_ID, 'SYSTEM', 'OPENED', 'Opened by ' || :TRIGGERED_BY || ' and assigned to ' || OWNER || '. ' || DETAIL
  from __DB__.FINANCE.CLOSE_ISSUES where CREATED_RUN = :run_id;

  -- refresh amount/detail on issues that are still failing
  update __DB__.FINANCE.CLOSE_ISSUES i set AMOUNT = res.AMOUNT, DETAIL = res.DETAIL, LAST_SEEN_RUN = :run_id
  from __DB__.FINANCE.CLOSE_CHECK_RESULTS res
  where res.RUN_ID = :run_id and i.ISSUE_KEY = res.RULE_ID || '|' || res.REFERENCE and i.FISCAL_PERIOD = :PERIOD and i.STATUS <> 'Resolved';

  -- issues whose check now passes are closed automatically
  insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE)
  select ISSUE_ID, 'SYSTEM', 'AUTO_RESOLVED', 'Check passed on re-run by ' || :TRIGGERED_BY
  from __DB__.FINANCE.CLOSE_ISSUES
  where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and array_contains(RULE_ID::variant, :ok_rules)
    and coalesce(LAST_SEEN_RUN, '') <> :run_id;
  update __DB__.FINANCE.CLOSE_ISSUES
     set STATUS = 'Resolved', RESOLVED_BY = 'SYSTEM', RESOLVED_AT = current_timestamp(), RESOLUTION = 'Auto-resolved: check passed'
  where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and array_contains(RULE_ID::variant, :ok_rules)
    and coalesce(LAST_SEEN_RUN, '') <> :run_id;

  -- roll issue state up to the close checklist
  update __DB__.FINANCE.CLOSE_TASKS t
     set STATUS = s.NEW_STATUS, NOTES = s.NOTE, COMPLETED_BD = iff(s.NEW_STATUS = 'Complete', coalesce(t.COMPLETED_BD, 4), null)
  from (
    select rl.TASK_CODE,
           case when count_if(i.STATUS <> 'Resolved' and i.SEVERITY = 'High') > 0 then 'Blocked'
                when count_if(i.STATUS <> 'Resolved') > 0 then 'Needs Review' else 'Complete' end NEW_STATUS,
           iff(count_if(i.STATUS <> 'Resolved') = 0,
               'All checks passed (' || listagg(distinct rl.RULE_ID, ', ') || ').' || iff(count(i.ISSUE_ID) > 0, ' ' || count(i.ISSUE_ID) || ' issue(s) resolved.', ''),
               count_if(i.STATUS <> 'Resolved') || ' open issue(s): ' || listagg(distinct iff(i.STATUS <> 'Resolved', i.TITLE, null), '; ')) NOTE
    from __DB__.FINANCE.CLOSE_CHECK_RULES rl
    left join __DB__.FINANCE.CLOSE_ISSUES i on i.RULE_ID = rl.RULE_ID and i.FISCAL_PERIOD = :PERIOD
    where rl.ENABLED and array_contains(rl.RULE_ID::variant, :ok_rules)
    group by rl.TASK_CODE
  ) s
  where t.FISCAL_PERIOD = :PERIOD and t.TASK_CODE = s.TASK_CODE;

  summary := (
    select object_construct('run_id', :run_id, 'errors', :errors, 'rules', array_agg(object_construct(
             'rule_id', rl.RULE_ID, 'task_code', rl.TASK_CODE, 'rule_name', rl.RULE_NAME, 'severity', rl.SEVERITY,
             'findings', coalesce(f.n, 0), 'amount', coalesce(f.amt, 0),
             'new_issues', coalesce(n.n, 0), 'open_issues', coalesce(o.n, 0),
             'ran', array_contains(rl.RULE_ID::variant, :ok_rules))) within group (order by rl.SORT_ORDER))::variant
    from __DB__.FINANCE.CLOSE_CHECK_RULES rl
    left join (select RULE_ID, count(*) n, sum(abs(AMOUNT)) amt from __DB__.FINANCE.CLOSE_CHECK_RESULTS where RUN_ID = :run_id group by 1) f on f.RULE_ID = rl.RULE_ID
    left join (select RULE_ID, count(*) n from __DB__.FINANCE.CLOSE_ISSUES where CREATED_RUN = :run_id group by 1) n on n.RULE_ID = rl.RULE_ID
    left join (select RULE_ID, count(*) n from __DB__.FINANCE.CLOSE_ISSUES where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' group by 1) o on o.RULE_ID = rl.RULE_ID
    where rl.ENABLED
  );
  insert into __DB__.FINANCE.CLOSE_CHECK_RUNS select :run_id, :PERIOD, current_timestamp(), :TRIGGERED_BY, :summary;
  delete from __DB__.FINANCE.CLOSE_CHECK_RESULTS where RUN_ID <> :run_id;
  return summary;
end;
$$;

-- ------------------------------------------------------------------ notify owners of new issues (one digest per owner)
create or replace procedure NOTIFY_CLOSE_OWNERS(PERIOD date)
returns variant language sql execute as owner as
$$
declare
  sent array default array_construct();
  o_owner string;
  o_name string;
  o_email string;
  o_n int;
  o_subject string;
  o_html string;
  rs resultset default (
    select i.OWNER, o.FULL_NAME, o.TITLE, o.EMAIL, count(*) N, sum(abs(coalesce(i.AMOUNT, 0))) AMT,
           listagg('<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb"><b>' || __DB__.FINANCE.HTML_ESC(i.TITLE) || '</b><br><span style="color:#6b7280">' ||
                   __DB__.FINANCE.HTML_ESC(i.DETAIL) || '</span></td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">' || __DB__.FINANCE.HTML_ESC(i.REFERENCE) ||
                   '</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">' || coalesce(to_char(i.AMOUNT, '$999,999,999,990'), '') ||
                   '</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">' || i.SEVERITY || '</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">' ||
                   to_char(i.SLA_DUE, 'Mon DD') || '</td></tr>', '') within group (order by i.SEVERITY, i.AMOUNT desc) ROWS_HTML
    from __DB__.FINANCE.CLOSE_ISSUES i join __DB__.FINANCE.CLOSE_OWNERS o on o.OWNER = i.OWNER
    where i.FISCAL_PERIOD = :PERIOD and i.STATUS = 'Open' and i.NOTIFIED_AT is null
    group by 1,2,3,4);
begin
  let c cursor for rs;
  for r in c do
    o_owner := r.OWNER;
    o_name := r.FULL_NAME;
    o_email := r.EMAIL;
    o_n := r.N;
    o_subject := '[Legend Close] ' || o_n || ' new issue(s) assigned to ' || o_name;
    o_html := '<p>Hi ' || __DB__.FINANCE.HTML_ESC(o_name) || ',</p><p>The October 2026 close checks found <b>' || o_n || '</b> new issue(s) for you (' ||
      __DB__.FINANCE.HTML_ESC(r.TITLE) || '). Please review and propose a fix in the close workspace.</p>' ||
      '<table style="border-collapse:collapse;font-size:13px"><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left">Issue</th><th style="padding:6px 10px;text-align:left">Reference</th>' ||
      '<th style="padding:6px 10px;text-align:right">Amount</th><th style="padding:6px 10px;text-align:left">Severity</th><th style="padding:6px 10px;text-align:left">Due</th></tr>' || r.ROWS_HTML || '</table>' ||
      '<p style="color:#6b7280;font-size:12px">Demo: owner ' || o_owner || ' is routed to this mailbox.</p>';
    call __DB__.FINANCE.SEND_CLOSE_EMAIL(:o_email, :o_subject, :o_html);
    update __DB__.FINANCE.CLOSE_ISSUES set NOTIFIED_AT = current_timestamp()
      where FISCAL_PERIOD = :PERIOD and STATUS = 'Open' and NOTIFIED_AT is null and OWNER = :o_owner;
    insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE)
      select i.ISSUE_ID, 'SYSTEM', 'NOTIFIED', 'Email sent to ' || :o_name || ' <' || :o_email || '>'
      from __DB__.FINANCE.CLOSE_ISSUES i where i.FISCAL_PERIOD = :PERIOD and i.OWNER = :o_owner and i.NOTIFIED_AT is not null
        and not exists (select 1 from __DB__.FINANCE.CLOSE_ISSUE_EVENTS e where e.ISSUE_ID = i.ISSUE_ID and e.EVENT_TYPE = 'NOTIFIED');
    sent := array_append(:sent, object_construct('owner', :o_owner, 'issues', :o_n));
  end for;
  return sent;
end;
$$;

-- ------------------------------------------------------------------ escalate issues past SLA to the approver
create or replace procedure ESCALATE_OVERDUE_ISSUES(PERIOD date, AS_OF date)
returns variant language sql execute as owner as
$$
declare
  n int;
  html string;
  email string;
begin
  n := (select count(*) from __DB__.FINANCE.CLOSE_ISSUES where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and SLA_DUE < :AS_OF and ESCALATED_AT is null);
  if (n = 0) then
    return object_construct('escalated', 0);
  end if;
  html := (select '<p>The following close issues are past their SLA as of ' || to_char(:AS_OF, 'Mon DD, YYYY') || ':</p><ul>' ||
                  listagg('<li><b>' || __DB__.FINANCE.HTML_ESC(TITLE) || '</b> ' || __DB__.FINANCE.HTML_ESC(REFERENCE) || ' — owner ' || OWNER || ', due ' || to_char(SLA_DUE, 'Mon DD') || ', status ' || STATUS || '</li>', '') || '</ul>'
           from __DB__.FINANCE.CLOSE_ISSUES where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and SLA_DUE < :AS_OF and ESCALATED_AT is null);
  email := (select EMAIL from __DB__.FINANCE.CLOSE_OWNERS where OWNER = 'CONTROLLER');
  call __DB__.FINANCE.SEND_CLOSE_EMAIL(:email, '[Legend Close] ESCALATION: ' || :n || ' issue(s) past SLA', :html);
  insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE)
    select ISSUE_ID, 'SYSTEM', 'ESCALATED', 'Past SLA ' || to_char(SLA_DUE, 'YYYY-MM-DD') || ' — escalated to Controller'
    from __DB__.FINANCE.CLOSE_ISSUES where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and SLA_DUE < :AS_OF and ESCALATED_AT is null;
  update __DB__.FINANCE.CLOSE_ISSUES set ESCALATED_AT = current_timestamp()
    where FISCAL_PERIOD = :PERIOD and STATUS <> 'Resolved' and SLA_DUE < :AS_OF and ESCALATED_AT is null;
  return object_construct('escalated', :n);
end;
$$;

-- ------------------------------------------------------------------ propose / approve / reject / resolve / comment
create or replace procedure APPLY_CLOSE_ACTION(ISSUE_ID string, ACTION string, ACTOR string, NOTE string, FIX_OPTION string)
returns variant language sql execute as owner as
$$
declare
  st string;
  fix string;
  ref string;
  opt string;
  title string;
  owner_email string;
  approver_email string;
  is_approver boolean;
  msg string;
begin
  select STATUS, FIX_ACTION, REFERENCE, PROPOSED_OPTION, TITLE into :st, :fix, :ref, :opt, :title
    from __DB__.FINANCE.CLOSE_ISSUES where ISSUE_ID = :ISSUE_ID;
  if (st is null) then
    return object_construct('ok', false, 'error', 'Issue not found');
  end if;
  owner_email := (select o.EMAIL from __DB__.FINANCE.CLOSE_ISSUES i join __DB__.FINANCE.CLOSE_OWNERS o on o.OWNER = i.OWNER where i.ISSUE_ID = :ISSUE_ID);
  approver_email := (select EMAIL from __DB__.FINANCE.CLOSE_OWNERS where OWNER = 'CONTROLLER');
  is_approver := coalesce((select IS_APPROVER from __DB__.FINANCE.CLOSE_OWNERS where OWNER = :ACTOR), false);

  if (ACTION = 'COMMENT') then
    insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE) values (:ISSUE_ID, :ACTOR, 'COMMENT', :NOTE);
    return object_construct('ok', true);
  end if;
  if (st = 'Resolved') then
    return object_construct('ok', false, 'error', 'Issue is already resolved');
  end if;

  if (ACTION = 'PROPOSE') then
    update __DB__.FINANCE.CLOSE_ISSUES set STATUS = 'Pending Approval', PROPOSED_BY = :ACTOR, PROPOSED_AT = current_timestamp(),
           PROPOSED_OPTION = :FIX_OPTION, PROPOSAL_NOTE = :NOTE where ISSUE_ID = :ISSUE_ID;
    insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE)
      values (:ISSUE_ID, :ACTOR, 'PROPOSED', 'Proposed ' || coalesce(:FIX_OPTION, :fix) || iff(coalesce(:NOTE, '') = '', '', ': ' || :NOTE));
    call __DB__.FINANCE.SEND_CLOSE_EMAIL(:approver_email, '[Legend Close] Approval needed: ' || :title || ' ' || :ref,
      '<p>' || __DB__.FINANCE.HTML_ESC(:ACTOR) || ' proposed <b>' || __DB__.FINANCE.HTML_ESC(coalesce(:FIX_OPTION, :fix)) || '</b> for <b>' ||
      __DB__.FINANCE.HTML_ESC(:title) || '</b> (' || __DB__.FINANCE.HTML_ESC(:ref) || ').</p><p>' || __DB__.FINANCE.HTML_ESC(coalesce(:NOTE, '')) ||
      '</p><p>Approve or reject it in the close workspace.</p>');
    return object_construct('ok', true, 'status', 'Pending Approval');
  end if;

  if (ACTION = 'REJECT') then
    if (not is_approver) then
      return object_construct('ok', false, 'error', 'Only an approver (Controller or CFO) can reject a proposed fix');
    end if;
    update __DB__.FINANCE.CLOSE_ISSUES set STATUS = 'Open', PROPOSED_BY = null, PROPOSED_AT = null, PROPOSED_OPTION = null where ISSUE_ID = :ISSUE_ID;
    insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE) values (:ISSUE_ID, :ACTOR, 'REJECTED', coalesce(:NOTE, 'Proposal rejected'));
    call __DB__.FINANCE.SEND_CLOSE_EMAIL(:owner_email, '[Legend Close] Fix rejected: ' || :title || ' ' || :ref,
      '<p>' || __DB__.FINANCE.HTML_ESC(:ACTOR) || ' rejected the proposed fix.</p><p>' || __DB__.FINANCE.HTML_ESC(coalesce(:NOTE, '')) || '</p>');
    return object_construct('ok', true, 'status', 'Open');
  end if;

  if (ACTION = 'RESOLVE') then
    if (fix <> 'INVESTIGATE' and not is_approver) then
      return object_construct('ok', false, 'error', 'This issue needs a fix approved by the Controller');
    end if;
    msg := coalesce(:NOTE, 'Resolved');
  elseif (ACTION = 'APPROVE') then
    if (not is_approver) then
      return object_construct('ok', false, 'error', 'Only an approver (Controller or CFO) can approve a fix');
    end if;
    if (st <> 'Pending Approval') then
      return object_construct('ok', false, 'error', 'Nothing has been proposed yet');
    end if;
    -- execute the approved fix
    if (fix = 'POST_AR_INVOICE') then
      insert into __DB__.FINANCE.GL_JOURNAL_LINES
      select 'FIX-ARI-' || INVOICE_ID, 1, INVOICE_DATE, date_trunc(month, INVOICE_DATE), ENTITY_ID, '1100', null, AMOUNT_USD, 0, AMOUNT_USD, 'AR', INVOICE_ID,
             'Correcting entry: post missing invoice ' || INVOICE_ID, 'CLOSE_FIX:' || :ACTOR, true from __DB__.FINANCE.AR_INVOICES where INVOICE_ID = :ref
      union all
      select 'FIX-ARI-' || INVOICE_ID, 2, INVOICE_DATE, date_trunc(month, INVOICE_DATE), ENTITY_ID, REVENUE_ACCOUNT_ID, 'CC300', 0, AMOUNT_USD, -AMOUNT_USD, 'AR', INVOICE_ID,
             'Correcting entry: post missing invoice ' || INVOICE_ID, 'CLOSE_FIX:' || :ACTOR, true from __DB__.FINANCE.AR_INVOICES where INVOICE_ID = :ref;
      msg := 'Correcting journal FIX-ARI-' || :ref || ' posted (Dr 1100 AR / Cr revenue)';
    elseif (fix = 'VOID_DUPLICATE_BILL') then
      update __DB__.FINANCE.AP_BILLS set STATUS = 'Void' where BILL_ID = :ref;
      insert into __DB__.FINANCE.GL_JOURNAL_LINES
      select 'FIX-VOID-' || DOC_REF, LINE_NO, '2026-10-27', '2026-10-01', ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID, CREDIT, DEBIT, -AMOUNT, 'AP_VOID', DOC_REF,
             'Void duplicate bill ' || DOC_REF, 'CLOSE_FIX:' || :ACTOR, true
      from __DB__.FINANCE.GL_JOURNAL_LINES where JOURNAL_ID = 'APB-' || :ref;
      msg := 'Bill ' || :ref || ' voided, payment blocked, GL reversal FIX-VOID-' || :ref || ' posted';
    elseif (fix = 'REVIEW_JOURNAL') then
      insert into __DB__.FINANCE.JOURNAL_REVIEWS values (:ref, coalesce(:opt, 'ACCEPT'), :ACTOR, current_timestamp(), :NOTE);
      if (coalesce(opt, 'ACCEPT') = 'REVERSE') then
        insert into __DB__.FINANCE.GL_JOURNAL_LINES
        select 'FIX-REV-' || JOURNAL_ID, LINE_NO, '2026-10-27', '2026-10-01', ENTITY_ID, ACCOUNT_ID, COST_CENTER_ID, CREDIT, DEBIT, -AMOUNT, 'MANUAL_REVERSAL', JOURNAL_ID,
               'Reversal of ' || JOURNAL_ID || ': ' || DESCRIPTION, 'CLOSE_FIX:' || :ACTOR, true
        from __DB__.FINANCE.GL_JOURNAL_LINES where JOURNAL_ID = :ref;
        msg := 'Journal ' || :ref || ' reversed in Oct-2026 (FIX-REV-' || :ref || ')';
      else
        msg := 'Journal ' || :ref || ' reviewed and accepted with support';
      end if;
    elseif (fix = 'CONFIRM_PROFIT_SPLIT') then
      update __DB__.FINANCE.PROFIT_SPLIT set STATUS = 'Final' where to_char(FISCAL_PERIOD, 'YYYY-MM') = replace(:ref, 'PS-', '');
      msg := 'Profit split ' || replace(:ref, 'PS-', '') || ' marked Final after Janssen confirmation';
    elseif (fix = 'SEND_COLLECTIONS') then
      call __DB__.FINANCE.SEND_CLOSE_EMAIL(:owner_email, '[Legend Close] Collections notice sent: ' || :ref,
        '<p>Collections follow-up approved for <b>' || __DB__.FINANCE.HTML_ESC(:ref) || '</b>.</p><p>' || __DB__.FINANCE.HTML_ESC(coalesce(:NOTE, '')) || '</p>');
      msg := 'Collections notice sent for ' || :ref;
    else
      msg := 'Resolved: ' || coalesce(:NOTE, 'investigated');
    end if;
  else
    return object_construct('ok', false, 'error', 'Unknown action ' || :ACTION);
  end if;

  update __DB__.FINANCE.CLOSE_ISSUES set STATUS = 'Resolved', RESOLVED_BY = :ACTOR, RESOLVED_AT = current_timestamp(), RESOLUTION = :msg where ISSUE_ID = :ISSUE_ID;
  insert into __DB__.FINANCE.CLOSE_ISSUE_EVENTS (ISSUE_ID, ACTOR, EVENT_TYPE, MESSAGE) values (:ISSUE_ID, :ACTOR, iff(:ACTION = 'APPROVE', 'APPROVED', 'RESOLVED'), :msg);
  return object_construct('ok', true, 'status', 'Resolved', 'message', :msg);
end;
$$;

-- ------------------------------------------------------------------ reset the October demo
create or replace procedure RESET_CLOSE_DEMO()
returns string language sql execute as owner as
$$
begin
  delete from __DB__.FINANCE.GL_JOURNAL_LINES where JOURNAL_ID like 'FIX-%';
  delete from __DB__.FINANCE.JOURNAL_REVIEWS;
  update __DB__.FINANCE.AP_BILLS set STATUS = iff(AMOUNT_PAID >= AMOUNT_USD, 'Paid', 'Open') where STATUS = 'Void';
  update __DB__.FINANCE.PROFIT_SPLIT set STATUS = 'Preliminary' where FISCAL_PERIOD = '2026-09-01';
  delete from __DB__.FINANCE.CLOSE_ISSUE_EVENTS;
  delete from __DB__.FINANCE.CLOSE_ISSUES;
  delete from __DB__.FINANCE.CLOSE_CHECK_RUNS;
  delete from __DB__.FINANCE.CLOSE_CHECK_RESULTS;
  update __DB__.FINANCE.CLOSE_TASKS set STATUS = iff(TASK_CODE in ('T01','T09','T13'), 'In Progress', 'Not Started'), NOTES = null, COMPLETED_BD = null
   where FISCAL_PERIOD = '2026-10-01';
  return 'reset';
end;
$$;

-- ------------------------------------------------------------------ daily scheduled run
create or replace procedure RUN_DAILY_CLOSE()
returns variant language sql execute as owner as
$$
declare
  checks variant;
  notified variant;
  escalated variant;
begin
  call __DB__.FINANCE.RUN_CLOSE_CHECKS('2026-10-01'::date, 'SCHEDULED_TASK') into :checks;
  call __DB__.FINANCE.NOTIFY_CLOSE_OWNERS('2026-10-01'::date) into :notified;
  call __DB__.FINANCE.ESCALATE_OVERDUE_ISSUES('2026-10-01'::date, current_date()) into :escalated;
  return object_construct('checks', :checks, 'notified', :notified, 'escalated', :escalated);
end;
$$;

create task if not exists LEGEND_DAILY_CLOSE_CHECKS
  warehouse = __WAREHOUSE__
  schedule = 'USING CRON 0 7 * * * America/New_York'
  comment = 'Runs month-end close checks daily at 7am ET, opens issues, emails owners about new issues, escalates overdue ones'
as
  call __DB__.FINANCE.RUN_DAILY_CLOSE();
