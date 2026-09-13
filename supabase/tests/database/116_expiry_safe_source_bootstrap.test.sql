begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(8);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('reliefweb', 'salarypadi_employer_submissions')
     and status = case when policy_review_due_at > statement_timestamp()
       then 'active'::app.source_status else 'paused'::app.source_status end
     and policy_state = case when policy_review_due_at > statement_timestamp()
       then 'enabled'::app.source_policy_state else 'expired'::app.source_policy_state end
     and allow_public_listing = (policy_review_due_at > statement_timestamp())),
  2::bigint,
  'dated source bootstraps activate and expose listings only within their recorded review'
);

select ok(
  (select policy_review_due_at = timestamptz '2026-08-26 00:00:00+00'
     and terms_reviewed_at = timestamptz '2026-07-14 00:00:00+00'
     and authorization_reviewed_at = timestamptz '2026-07-26 00:00:00+00'
     and terms_version = 'reliefweb-api-terms-reviewed-2026-07-14'
     and not may_index_jobs and not may_emit_jobposting_schema
     and not may_store_full_description and not may_email_jobs
   from app.job_sources where adapter_key = 'reliefweb'),
  'ReliefWeb corrections preserve historical dates and restricted distribution rights'
);

select ok(
  (select policy_review_due_at = timestamptz '2027-08-11 00:00:00+00'
     and terms_reviewed_at = timestamptz '2026-08-11 00:00:00+00'
     and authorization_reviewed_at = timestamptz '2026-08-11 00:00:00+00'
   from app.job_sources where adapter_key = 'salarypadi_employer_submissions'),
  'first-party intake replay preserves its recorded review and expiry dates'
);

select ok(
  (select rights.policy_state = source.policy_state
     and rights.allow_public_display = source.allow_public_listing
     and rights.review_due_at = source.policy_review_due_at
   from app.source_country_rights rights
   join app.job_sources source on source.id = rights.source_id
   where source.adapter_key = 'salarypadi_employer_submissions'
     and rights.country_code = 'NG'),
  'first-party public country rights follow the expiry-safe source state'
);

select is(
  (select count(*) from api.job_sources
   where adapter_key in ('reliefweb', 'salarypadi_employer_submissions')),
  (select count(*) from app.job_sources
   where adapter_key in ('reliefweb', 'salarypadi_employer_submissions')
     and policy_review_due_at > statement_timestamp()),
  'the public source registry does not expose expired bootstraps'
);

-- Transaction-only expiry fixtures prove that the runtime guard still fails
-- closed independently of the date on which the historical replay runs.
update app.job_sources
set status = 'paused', policy_state = 'expired', allow_public_listing = false,
    policy_review_due_at = statement_timestamp() - interval '1 second'
where adapter_key in ('reliefweb', 'salarypadi_employer_submissions');

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('reliefweb', 'salarypadi_employer_submissions')
     and security.job_source_policy_is_runnable(id)),
  0::bigint,
  'expired bootstrap sources cannot run'
);

select throws_ok(
  $$update app.job_sources set status = 'active', policy_state = 'enabled'
    where adapter_key = 'reliefweb'$$,
  '23514', null, 'expired ReliefWeb activation remains rejected'
);

select throws_ok(
  $$update app.job_sources set status = 'active', policy_state = 'enabled'
    where adapter_key = 'salarypadi_employer_submissions'$$,
  '23514', null, 'expired first-party intake activation remains rejected'
);

select * from finish();
rollback;
