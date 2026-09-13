begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(11);

select is(
  (select terms_version from app.job_sources where adapter_key = 'jobicy'),
  'jobicy-public-api-reviewed-2026-08-13',
  'Jobicy preserves the recorded API policy version'
);

select is(
  (select terms_version from app.job_sources where adapter_key = 'himalayas'),
  'himalayas-public-api-reviewed-2026-08-13',
  'Himalayas preserves the recorded API policy version'
);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and status = case when policy_review_due_at > statement_timestamp()
       then 'active'::app.source_status else 'paused'::app.source_status end
     and policy_state = case when policy_review_due_at > statement_timestamp()
       then 'enabled'::app.source_policy_state else 'expired'::app.source_policy_state end
     and policy_review_due_at = timestamptz '2026-09-13 00:00:00+00'),
  2::bigint,
  'both secondary sources are active only inside the recorded review horizon'
);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and allow_public_listing = (policy_review_due_at > statement_timestamp())
     and not may_store_full_description
     and not may_index_jobs
     and not may_emit_jobposting_schema
     and not may_email_jobs),
  2::bigint,
  'expired reviews withdraw public listing without broadening other rights'
);

select is(
  (select refresh_interval from app.job_sources where adapter_key = 'jobicy'),
  interval '6 hours',
  'Jobicy remains on the reviewed six-hour cadence'
);

select is(
  (select refresh_interval from app.job_sources where adapter_key = 'himalayas'),
  interval '1 day',
  'Himalayas remains on the reviewed daily cadence'
);

select ok(
  (select bool_and(dependency.state = 'verified')
   from private.job_source_dependencies dependency
   join app.job_sources source on source.id = dependency.source_id
   where source.adapter_key in ('jobicy', 'himalayas')
     and dependency.dependency_key = any(source.required_dependencies)),
  'all declared secondary-feed dependencies remain verified'
);

select is(
  (select count(*) from api.job_sources
   where adapter_key in ('jobicy', 'himalayas')),
  case when timestamptz '2026-09-13 00:00:00+00' > statement_timestamp() then 2::bigint else 0::bigint end,
  'the public policy registry exposes these sources only while their review is current'
);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and terms_reviewed_at = timestamptz '2026-08-13 00:00:00+00'
     and authorization_reviewed_at = timestamptz '2026-08-13 00:00:00+00'),
  2::bigint,
  'replay preserves historical review dates instead of silently renewing them'
);

-- Exercise the runtime guard independently of the date on which CI runs.
update app.job_sources
set status = 'paused', policy_state = 'expired', allow_public_listing = false,
    policy_review_due_at = statement_timestamp() - interval '1 second'
where adapter_key in ('jobicy', 'himalayas');

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and security.job_source_policy_is_runnable(id)),
  0::bigint,
  'expired reviewed sources cannot be fetched by runtime workers'
);

select throws_ok(
  $$update app.job_sources set status = 'active', policy_state = 'enabled'
    where adapter_key = 'jobicy'$$,
  '23514',
  null,
  'the existing authorization and supply guards reject expired-source activation'
);

select * from finish();
rollback;
