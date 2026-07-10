begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(18);

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
  'active',
  'worker policy reports the active Remotive source'
);

select ok(
  (select
     allow_public_listing
     and not may_store_full_description
     and not may_index_jobs
     and not may_emit_jobposting_schema
     and refresh_interval_seconds = 43200
   from api.worker_get_job_source_policy('remotive')),
  'worker policy returns the reviewed Remotive publication, storage, indexing, schema, and cadence limits'
);

select ok(
  (select
     terms_url = 'https://github.com/remotive-com/remote-jobs-api'
     and terms_reviewed_at is not null
     and terms_version = 'remotive-public-api-repository-reviewed-2026-07-10'
     and required_destination_kind = 'source_url'
     and attribution_required
   from api.worker_get_job_source_policy('remotive')),
  'worker policy returns Remotive terms, attribution, and destination metadata'
);

reset role;
set local role anon;

select is(
  (select adapter_key from api.job_sources where adapter_key = 'remotive'),
  'remotive',
  'active public Remotive policy is visible through the public source view'
);

select ok(
  (select
     allow_public_listing
     and attribution_required
     and not may_store_full_description
     and not may_index_jobs
     and not may_emit_jobposting_schema
     and required_destination_kind = 'source_url'
     and refresh_interval_seconds = 43200
   from api.job_sources where adapter_key = 'remotive'),
  'public source gate exposes the complete non-secret Remotive runtime contract'
);

reset role;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  'fa000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'source-policy-admin@example.test',
  '{}'::jsonb, '{}'::jsonb, now(), now()
)
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values (
  'fa000000-0000-0000-0000-000000000001',
  'admin', null, 'source policy boundary test bootstrap'
)
on conflict (user_id, role) where revoked_at is null do nothing;

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, may_store_full_description, may_index_jobs,
  may_emit_jobposting_schema, allow_public_listing,
  terms_reviewed_at, terms_version
)
values (
  'fa000000-0000-0000-0000-000000000002',
  'unsupported_schema', 'Unsupported Schema Source', 'permitted_api',
  'disabled', 'https://unsupported.example.test/terms',
  true, false, false, true, true,
  now(), 'unsupported-schema-test-policy'
)
on conflict (id) do nothing;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'fa000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  $$ select api.admin_transition(
    'sources', 'enable',
    'fa000000-0000-0000-0000-000000000002',
    'Reject unsupported JobPosting publication', 1
  ) $$,
  '23514', 'source terms and publication permissions must be reviewed',
  'enable rejects JobPosting publication when indexing is not permitted'
);

select is(
  api.admin_transition(
    'sources', 'request_review',
    (select id from api.admin_list_sources() where title = 'Remotive'),
    'Pause Remotive for a source policy review',
    (select version from api.admin_list_sources() where title = 'Remotive')
  ),
  true,
  'admin can pause Remotive for policy review'
);

reset role;
set local role service_role;

select is(
  (select status from api.worker_get_job_source_policy('remotive')),
  'paused',
  'worker policy immediately exposes the paused source state'
);

reset role;
set local role anon;

select is(
  (select count(*)::integer from api.job_sources where adapter_key = 'remotive'),
  0,
  'paused Remotive is removed from the public source view'
);

reset role;
set local role authenticated;

select is(
  api.admin_transition(
    'sources', 'disable',
    (select id from api.admin_list_sources() where title = 'Remotive'),
    'Disable Remotive after source policy review',
    (select version from api.admin_list_sources() where title = 'Remotive')
  ),
  true,
  'admin can disable Remotive'
);

reset role;
set local role service_role;

select is(
  (select status from api.worker_get_job_source_policy('remotive')),
  'disabled',
  'worker policy immediately exposes the disabled source state'
);

reset role;
set local role authenticated;

select is(
  api.admin_transition(
    'sources', 'enable',
    (select id from api.admin_list_sources() where title = 'Remotive'),
    'Re-enable the reviewed public noindex Remotive source',
    (select version from api.admin_list_sources() where title = 'Remotive')
  ),
  true,
  'admin can re-enable a reviewed public noindex source'
);

reset role;
set local role service_role;

select ok(
  (select
     status = 'active'
     and allow_public_listing
     and not may_index_jobs
     and not may_emit_jobposting_schema
   from api.worker_get_job_source_policy('remotive')),
  're-enable restores acquisition without enabling unsupported indexing or JobPosting output'
);

reset role;
set local role anon;

select is(
  (select adapter_key from api.job_sources where adapter_key = 'remotive'),
  'remotive',
  're-enabled Remotive returns to the active public source view'
);

reset role;

select throws_ok(
  $$ select * from api.worker_get_job_source_policy('Remotive!') $$,
  '22023', 'invalid source adapter key',
  'worker source-policy RPC rejects a malformed adapter key'
);

select * from finish();
rollback;
