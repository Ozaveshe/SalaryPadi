begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(8);

select is(
  (select terms_version from app.job_sources where adapter_key = 'jobicy'),
  'jobicy-public-api-reviewed-2026-08-13',
  'Jobicy uses the current reviewed API policy version'
);

select is(
  (select terms_version from app.job_sources where adapter_key = 'himalayas'),
  'himalayas-public-api-reviewed-2026-08-13',
  'Himalayas uses the current reviewed API policy version'
);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and status = 'active'
     and policy_state = 'enabled'
     and policy_review_due_at = timestamptz '2026-09-13 00:00:00+00'),
  2::bigint,
  'both reviewed secondary sources stay active through the new review horizon'
);

select is(
  (select count(*) from app.job_sources
   where adapter_key in ('jobicy', 'himalayas')
     and allow_public_listing
     and not may_store_full_description
     and not may_index_jobs
     and not may_emit_jobposting_schema
     and not may_email_jobs),
  2::bigint,
  'the re-review does not broaden storage, indexing, schema or email rights'
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
  2::bigint,
  'the public policy registry exposes both reviewed sources'
);

select * from finish();
rollback;
