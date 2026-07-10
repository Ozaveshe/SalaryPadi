begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(29);

select ok(
  to_regprocedure(
    'security.upsert_raw_job_record(uuid,uuid,text,text,text,jsonb,text,text,timestamp with time zone)'
  ) is not null,
  'trusted raw-ingest upsert exists'
);

select ok(
  to_regprocedure('api.admin_list_jobs()') is not null
  and to_regprocedure('api.admin_list_imports()') is not null
  and to_regprocedure('api.admin_list_sources()') is not null
  and to_regprocedure('api.admin_list_companies()') is not null
  and to_regprocedure('api.admin_list_moderation()') is not null
  and to_regprocedure('api.admin_list_reports()') is not null
  and to_regprocedure('api.admin_list_users()') is not null
  and to_regprocedure('api.admin_list_calculation_rules()') is not null,
  'all admin list RPCs used by the application exist'
);

select ok(
  to_regprocedure('api.admin_transition(text,text,uuid,text,integer)') is not null,
  'generic admin transition RPC exists'
);

select ok(
  pg_get_function_arguments(
    'api.admin_transition(text,text,uuid,text,integer)'::regprocedure
  ) = 'resource_name text, action_name text, target_id uuid, action_reason text, expected_version integer',
  'admin transition argument names match the route payload exactly'
);

select ok(
  not has_function_privilege(
    'anon', 'api.admin_transition(text,text,uuid,text,integer)', 'EXECUTE'
  ),
  'anonymous callers cannot execute admin transitions'
);

select ok(
  has_function_privilege('authenticated', 'api.admin_list_sources()', 'EXECUTE')
  and has_function_privilege(
    'authenticated', 'api.admin_transition(text,text,uuid,text,integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'security.admin_transition(text,text,uuid,text,integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'security.admin_transition(text,text,uuid,text,integer)', 'EXECUTE'
  )
  and (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname = 'admin_transition'
      and p.proargtypes = '25 25 2950 25 23'::oidvector
  ),
  'authenticated callers use only the definer API wrapper, which retains DB-backed role and AAL checks'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'member-admin-test@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('aa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-contract@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values ('aa000000-0000-0000-0000-000000000002', 'admin', null, 'admin contract test bootstrap')
on conflict (user_id, role) where revoked_at is null do nothing;

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, may_store_full_description, may_index_jobs,
  allow_public_listing, terms_reviewed_at
)
values
  (
    'ab000000-0000-0000-0000-000000000001', 'import_contract', 'Import Contract',
    'permitted_api', 'active', 'https://source.example.test/terms', true,
    true, true, true, now()
  ),
  (
    'ab000000-0000-0000-0000-000000000002', 'metadata_only', 'Metadata Only',
    'permitted_api', 'active', 'https://metadata.example.test/terms', true,
    false, true, true, now()
  )
on conflict (id) do nothing;

insert into ingest.import_runs (id, source_id, status, triggered_by, completed_at)
values (
  'ac000000-0000-0000-0000-000000000001',
  'ab000000-0000-0000-0000-000000000001',
  'failed', 'test', now()
)
on conflict (id) do nothing;

create temporary table import_upsert_ids (id uuid) on commit drop;
insert into import_upsert_ids (id)
values (
  security.upsert_raw_job_record(
    'ab000000-0000-0000-0000-000000000001',
    'ac000000-0000-0000-0000-000000000001',
    'external-1', 'https://source.example.test/jobs/1', null,
    '{"title":"First"}'::jsonb, repeat('a', 64), 'fingerprint-1', now() + interval '30 days'
  )
), (
  security.upsert_raw_job_record(
    'ab000000-0000-0000-0000-000000000001',
    'ac000000-0000-0000-0000-000000000001',
    'external-1', 'https://source.example.test/jobs/1', null,
    '{"title":"Updated"}'::jsonb, repeat('b', 64), 'fingerprint-1', now() + interval '30 days'
  )
);

select is(
  (select count(distinct id)::integer from import_upsert_ids), 1,
  'replaying one source external ID returns the same raw record'
);
select is(
  (select count(*)::integer from ingest.raw_job_records
   where source_id = 'ab000000-0000-0000-0000-000000000001'
     and external_source_id = 'external-1'),
  1,
  'replaying an import does not duplicate the source record'
);
select is(
  (select content_hash from ingest.raw_job_records
   where source_id = 'ab000000-0000-0000-0000-000000000001'
     and external_source_id = 'external-1'),
  repeat('b', 64),
  'idempotent replay refreshes changed source content'
);
select throws_ok(
  $$ select security.upsert_raw_job_record(
    'ab000000-0000-0000-0000-000000000002', null, 'external-2',
    'https://metadata.example.test/jobs/2', null, '{"title":"Forbidden"}'::jsonb,
    repeat('c', 64), 'fingerprint-2', null
  ) $$,
  '42501', null,
  'source storage terms prevent retaining prohibited raw payloads'
);
select lives_ok(
  $$ select security.upsert_raw_job_record(
    'ab000000-0000-0000-0000-000000000002', null, 'external-2',
    'https://metadata.example.test/jobs/2', null, null,
    repeat('c', 64), 'fingerprint-2', null
  ) $$,
  'metadata-only source can ingest without a raw payload'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_list_sources() $$,
  '42501', null,
  'ordinary AAL2 member cannot list admin resources'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_list_sources() $$,
  '42501', null,
  'admin at AAL1 cannot list privileged resources'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from api.admin_list_sources()
   where id in (
     'ab000000-0000-0000-0000-000000000001',
     'ab000000-0000-0000-0000-000000000002'
   )),
  2,
  'AAL2 admin receives source rows in the shared admin shape'
);
select is(
  api.admin_transition(
    'sources', 'request_review', 'ab000000-0000-0000-0000-000000000001',
    'Terms need another review', 1
  ),
  true,
  'admin can request a source-policy review'
);
select is(
  (select status from api.admin_list_sources()
   where id = 'ab000000-0000-0000-0000-000000000001'),
  'review_requested',
  'source list exposes the requested-review state'
);
select is(
  (select version from api.admin_list_sources()
   where id = 'ab000000-0000-0000-0000-000000000001'),
  2,
  'source transition advances its optimistic version'
);
select throws_ok(
  $$ select api.admin_transition(
    'sources', 'enable', 'ab000000-0000-0000-0000-000000000001',
    'stale admin update', 1
  ) $$,
  '40001', null,
  'stale source transition is rejected'
);
select is(
  api.admin_transition(
    'sources', 'enable', 'ab000000-0000-0000-0000-000000000001',
    'Terms reviewed and source enabled', 2
  ),
  true,
  'admin can re-enable a reviewed permitted source'
);
select is(
  (select status from api.admin_list_sources()
   where id = 'ab000000-0000-0000-0000-000000000001'),
  'active',
  'source returns to active after a valid enable transition'
);
select is(
  (select count(*)::integer from api.admin_list_imports()
   where id = 'ac000000-0000-0000-0000-000000000001'),
  1,
  'failed import appears in the admin import list'
);
select throws_ok(
  $$ select api.admin_transition(
    'imports', 'retry', 'ac000000-0000-0000-0000-000000000001',
    'Retry after source adapter correction', 1
  ) $$,
  '0A000',
  'import retry is unavailable; scheduled source adapters own refresh execution',
  'database rejects import retry even for an AAL2 administrator'
);
select is(
  (select count(*)::integer from api.admin_list_imports()
   where title = 'Import Contract import'),
  1,
  'rejected retry leaves only the original source import run'
);
select is(
  (select version from api.admin_list_imports()
   where id = 'ac000000-0000-0000-0000-000000000001'),
  1,
  'rejected retry does not advance the original import version'
);
reset role;
select is(
  (select count(*)::integer from ingest.import_runs
   where retry_of = 'ac000000-0000-0000-0000-000000000001'),
  0,
  'authoritative ingest storage contains no retry child'
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_transition(
    'imports', 'cancel',
    'ac000000-0000-0000-0000-000000000001',
    'Do not cancel immutable failed evidence', 1
  ) $$,
  '23514',
  'import cannot be cancelled from its current state',
  'failed import evidence cannot be repurposed through cancel'
);
select is(
  (select status from api.admin_list_imports()
   where id = 'ac000000-0000-0000-0000-000000000001'),
  'failed',
  'failed import evidence remains immutable after rejected actions'
);
select is(
  (select count(*)::integer from api.admin_audit_events(100)
   where actor_user_id = 'aa000000-0000-0000-0000-000000000002'
     and action like 'admin.%'),
  2,
  'only successful source transitions write admin audit events'
);
select lives_ok(
  $$
    select * from api.admin_list_jobs()
    union all select * from api.admin_list_companies()
    union all select * from api.admin_list_moderation()
    union all select * from api.admin_list_reports()
    union all select * from api.admin_list_users()
    union all select * from api.admin_list_calculation_rules()
  $$,
  'all remaining admin list RPCs return the shared row contract'
);

select * from finish();
rollback;
