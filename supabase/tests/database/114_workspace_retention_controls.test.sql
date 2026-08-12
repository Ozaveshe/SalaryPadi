begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(22);

select ok(to_regprocedure('api.get_my_workspace_retention()') is not null,
  'owner retention read contract exists');
select ok(to_regprocedure('api.set_my_workspace_retention(text)') is not null,
  'owner retention mutation exists');
select ok(to_regprocedure('api.worker_run_workspace_retention()') is not null,
  'retention worker exists');
select ok(
  has_function_privilege('authenticated', 'api.get_my_workspace_retention()', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.set_my_workspace_retention(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.set_my_workspace_retention(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.worker_run_workspace_retention()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.worker_run_workspace_retention()', 'EXECUTE'),
  'owner and worker contracts have separate least-privilege grants'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('ab000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'retention-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ab000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'manual-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select is(
  (select workspace_retention_policy from private.profiles
   where user_id = 'ab000000-0000-4000-8000-000000000001'),
  'manual', 'existing and new accounts default to manual retention'
);

set local role anon;
select throws_ok(
  $$ select api.set_my_workspace_retention('days_90') $$,
  '42501', null, 'anonymous callers cannot change a retention preference'
);
reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ab000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select is(
  (select policy from api.get_my_workspace_retention()),
  'manual', 'an active owner can read the default preference'
);
select throws_ok(
  $$ select api.set_my_workspace_retention('days_30') $$,
  '22023', null, 'unsupported retention periods are rejected'
);
select is(api.set_my_workspace_retention('days_90'), true,
  'an active owner can opt into 90-day retention');
select is(api.set_my_workspace_retention('days_90'), false,
  'saving an unchanged policy is an idempotent no-op');
reset role;

select ok(
  (select workspace_retention_grace_until between
      statement_timestamp() + interval '29 days 23 hours'
      and statement_timestamp() + interval '30 days 1 hour'
   from private.profiles
   where user_id = 'ab000000-0000-4000-8000-000000000001'),
  'finite retention starts with a fresh 30-day grace window'
);
select is(
  (select count(*)::integer from audit.event_log
   where actor_user_id = 'ab000000-0000-4000-8000-000000000001'
     and action = 'workspace_retention.changed'),
  1, 'retention preference changes are audited'
);

insert into private.external_job_snapshots (
  id, owner_user_id, source_key, external_id, job_slug, job_title,
  company_name, source_url, created_at, updated_at
) values
  ('ac000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-000000000001', 'retention-test', 'expired',
   'expired-role', 'Expired role', 'Retention Company',
   'https://retention.example.test/jobs/expired', now() - interval '120 days',
   now() - interval '120 days'),
  ('ac000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-000000000002', 'retention-test', 'manual',
   'manual-role', 'Manual role', 'Retention Company',
   'https://retention.example.test/jobs/manual', now() - interval '500 days',
   now() - interval '500 days');

insert into private.saved_jobs (
  id, user_id, external_job_id, created_at
) values (
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', now() - interval '120 days'
);
insert into private.applications (
  id, user_id, external_job_id, status, created_at, updated_at
) values (
  'ae000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001', 'applied',
  now() - interval '120 days', now() - interval '120 days'
);
insert into private.application_history (
  id, application_id, user_id, new_status, changed_at
) values (
  'af000000-0000-4000-8000-000000000001',
  'ae000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001', 'applied',
  now() - interval '120 days'
);
insert into private.job_alerts (
  id, user_id, name, search_spec, cadence, created_at, updated_at
) values (
  'aa000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001', 'Old alert',
  '{"schema_version":1,"q":"retention"}'::jsonb, 'weekly',
  now() - interval '120 days', now() - interval '120 days'
);

select set_config(
  'request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true
);
set local role service_role;
create temporary table retention_before_grace as
select api.worker_run_workspace_retention() as summary;
reset role;

select is(
  (select count(*)::integer from private.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000001'
     and kind = 'retention_warning'),
  1, 'the worker creates one warning during the grace window'
);
select is(
  (select ((summary ->> 'retention_saved_jobs_deleted')::integer
    + (summary ->> 'retention_applications_deleted')::integer
    + (summary ->> 'retention_alerts_deleted')::integer)
   from retention_before_grace),
  0, 'the worker cannot delete workspace records during grace'
);

set local role service_role;
select api.worker_run_workspace_retention();
reset role;
select is(
  (select count(*)::integer from private.notifications
   where user_id = 'ab000000-0000-4000-8000-000000000001'
     and kind = 'retention_warning'),
  1, 'repeated warning sweeps are idempotent'
);

update private.profiles
set workspace_retention_grace_until = now() - interval '1 day'
where user_id = 'ab000000-0000-4000-8000-000000000001';

set local role service_role;
create temporary table retention_after_grace as
select api.worker_run_workspace_retention() as summary;
reset role;

select is(
  (select ((summary ->> 'retention_saved_jobs_deleted')::integer
    + (summary ->> 'retention_applications_deleted')::integer
    + (summary ->> 'retention_alerts_deleted')::integer)
   from retention_after_grace),
  3, 'the worker deletes all three eligible workspace record types after grace'
);
select is(
  (select count(*)::integer from private.saved_jobs
   where user_id = 'ab000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from private.applications
     where user_id = 'ab000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from private.job_alerts
     where user_id = 'ab000000-0000-4000-8000-000000000001'),
  0, 'expired workspace rows are absent after the purge'
);
select is(
  (select count(*)::integer from private.application_history
   where user_id = 'ab000000-0000-4000-8000-000000000001'),
  0, 'application history cascades with the retained application boundary'
);
select is(
  (select count(*)::integer from private.external_job_snapshots
   where id = 'ac000000-0000-4000-8000-000000000001'),
  0, 'an opted-in expired snapshot is removed after its references are purged'
);
select is(
  (select count(*)::integer from private.external_job_snapshots
   where id = 'ac000000-0000-4000-8000-000000000002'),
  1, 'manual-retention orphan snapshots remain untouched'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ab000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select is(
  (select affected_records from api.get_my_workspace_retention()),
  0, 'the owner read contract reports no remaining covered records'
);
reset role;

select is(
  (select count(*)::integer from private.notifications
   where kind = 'retention_warning'),
  1, 'the retention warning kind is stored as a first-class notification'
);

select * from finish();
rollback;
