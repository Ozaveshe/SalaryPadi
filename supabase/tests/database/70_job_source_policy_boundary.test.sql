begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(19);

select ok(
  to_regprocedure('api.worker_get_job_source_policy(text)') is not null,
  'worker source-policy RPC exists'
);
select ok(
  has_function_privilege(
    'service_role', 'api.worker_get_job_source_policy(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'api.worker_get_job_source_policy(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'api.worker_get_job_source_policy(text)', 'EXECUTE'
  ),
  'only the service role can execute the worker source-policy RPC'
);
select has_column(
  'api', 'job_sources', 'adapter_key',
  'public source view exposes the stable adapter key'
);

set local role service_role;
select is(
  (select status from api.worker_get_job_source_policy('remotive')),
  'paused',
  'worker policy fails the unresolved Remotive source closed'
);
select ok(
  (select allow_public_listing = false
     and not may_store_full_description
     and not may_index_jobs
     and not may_emit_jobposting_schema
     and refresh_interval_seconds = 21600
   from api.worker_get_job_source_policy('remotive')),
  'worker policy exposes the restrictive Remotive storage and cadence limits'
);
select ok(
  (select terms_url = 'https://remotive.com/terms-of-use'
     and terms_reviewed_at is not null
     and terms_version = 'remotive-terms-conflict-reviewed-2026-07-14'
     and required_destination_kind = 'source_url'
     and attribution_required
   from api.worker_get_job_source_policy('remotive')),
  'worker policy exposes the current reviewed Remotive terms conflict'
);
reset role;

set local role anon;
select is(
  (select count(*)::integer from api.job_sources
   where adapter_key = 'remotive'),
  0,
  'disabled Remotive policy is absent from the public source view'
);
reset role;

select is(
  (select state from private.job_source_dependencies dependency
   join app.job_sources source on source.id = dependency.source_id
   where source.adapter_key = 'remotive'
     and dependency.dependency_key = 'written_republication_confirmation'),
  'missing',
  'written republication confirmation remains an explicit dependency'
);
select is(
  (select policy_state::text from app.job_sources
   where adapter_key = 'remotive'),
  'disabled',
  'Remotive database policy remains disabled'
);
select is(
  (select policy_state::text from app.job_sources
   where adapter_key = 'salarypadi_employer_submissions'),
  'enabled',
  'direct employer submission policy remains enabled'
);

select throws_ok(
  $$ insert into app.job_sources (
       adapter_key, name, source_type, status, terms_url,
       attribution_required, allow_public_listing, refresh_interval,
       terms_reviewed_at, terms_version
     ) values (
       'linkedin', 'Forbidden LinkedIn Adapter', 'permitted_api', 'disabled',
       'https://example.test/terms', true, false, interval '24 hours',
       clock_timestamp(), 'forbidden-test'
     ) $$,
  '23514', 'forbidden job source adapter',
  'forbidden platform adapters cannot be added by configuration'
);
select throws_ok(
  $$ update app.job_sources set may_index_jobs = true
     where adapter_key = 'remotive' $$,
  '23514', 'secondary feed may not be submitted to search job platforms',
  'Remotive indexing cannot be enabled by configuration'
);
select throws_ok(
  $$ update app.job_sources set status = 'active'
     where adapter_key = 'remotive' $$,
  '23514', 'active source requires reviewed authorization evidence',
  'disabled rights policy cannot be activated by changing source status'
);
select ok(
  not security.job_source_policy_is_runnable(
    (select id from app.job_sources where adapter_key = 'remotive')
  ),
  'runtime policy remains non-runnable after rejected configuration changes'
);

set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fa000000-0000-4000-8000-000000000010', 'policy_test'
  ),
  false,
  'disabled source cannot claim a provider request budget'
);
select throws_ok(
  $$ select * from api.worker_get_job_source_policy('Remotive!') $$,
  '22023', 'invalid source adapter key',
  'worker source-policy RPC rejects a malformed adapter key'
);
reset role;

select ok(
  not has_function_privilege(
    'anon', 'api.worker_claim_remotive_fetch(uuid,text)', 'EXECUTE'
  ),
  'anonymous callers cannot claim provider request budget'
);
select ok(
  not has_table_privilege(
    'service_role', 'private.job_source_dependencies', 'UPDATE'
  ),
  'runtime service role cannot alter rights dependencies'
);
select ok(
  (select not may_index_jobs and not may_emit_jobposting_schema
   from app.job_sources where adapter_key = 'remotive'),
  'Remotive remains excluded from search index and JobPosting output'
);

select * from finish();
rollback;
