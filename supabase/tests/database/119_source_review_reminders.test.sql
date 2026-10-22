begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(8);

-- Existing first-party source only; no fabricated jobs or community evidence.
update app.job_sources
set policy_review_due_at = timestamptz '2026-08-12 00:00:00+00',
    status = 'active', policy_state = 'enabled'
where adapter_key = 'salarypadi_employer_submissions';

select ok(security.job_source_policy_is_runnable(
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions')
), 'overdue internal review does not stop an enabled source');

update app.source_country_rights
set review_due_at = timestamptz '2026-08-12 00:00:00+00'
where source_id = (select id from app.job_sources
  where adapter_key = 'salarypadi_employer_submissions');

select ok(security.job_source_country_policy_is_runnable(
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions'), 'NG'
), 'country review reminders do not block source eligibility');

select is((api.worker_run_source_rights_review()->>'expired_sources')::integer,
  0, 'review worker does not automatically expire sources');
select ok((select status = 'active' and policy_state = 'enabled'
  from app.job_sources where adapter_key = 'salarypadi_employer_submissions'),
  'review worker leaves the source active');
select ok(exists(select 1 from editorial.operational_alerts
  where error_code = 'source_policy_review_overdue'),
  'review worker retains actionable review reminders');

select ok(not has_function_privilege('anon',
  'api.worker_run_source_rights_review()', 'execute'),
  'anonymous callers still cannot run source administration');

update app.job_sources set authorization_revoked_at = clock_timestamp(),
  authorization_revocation_reason = 'transaction_only_revocation_test'
where adapter_key = 'salarypadi_employer_submissions';

select ok(not security.job_source_policy_is_runnable(
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions')
), 'explicit revocation still stops ingestion');
select ok(not security.job_source_country_policy_is_runnable(
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions'), 'NG'
), 'explicit revocation still stops country distribution');
select * from finish();
rollback;

