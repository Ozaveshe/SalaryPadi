begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, community, security, audit;
select plan(30);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'security'
      and p.proname = 'admin_transition'
      and position('#variable_conflict use_variable' in p.prosrc) > 0
  ),
  'admin transition compiles its legacy parameter conflict rule inside that function'
);
select is(
  pg_get_function_arguments(
    'api.admin_transition(text,text,uuid,text,integer)'::regprocedure
  ),
  'resource_name text, action_name text, target_id uuid, action_reason text, expected_version integer',
  'the public admin transition named-argument contract is unchanged'
);
select ok(
  to_regprocedure('security.recover_stale_worker_runs(interval)') is not null
  and (select p.prosecdef
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'security' and p.proname = 'recover_stale_worker_runs'),
  'stale worker recovery exists as a protected internal routine'
);
select ok(
  not has_function_privilege('anon', 'security.recover_stale_worker_runs(interval)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'security.recover_stale_worker_runs(interval)', 'EXECUTE')
  and not has_function_privilege('service_role', 'security.recover_stale_worker_runs(interval)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.worker_start(text,text,timestamptz,text)', 'EXECUTE'),
  'stale recovery is reachable only through the service-role worker-start boundary'
);
select ok(
  to_regclass('private.worker_runs_stale_running') is not null,
  'stale running-worker lookup has a partial index'
);
select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'app' and c.relname = 'aggregate_runs'
      and t.tgname = 'aggregate_runs_serialize_metric'
      and p.proname = 'lock_aggregate_metric_write' and t.tgenabled = 'O'
  ) and exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'private' and c.relname = 'aggregate_refresh_queue'
      and t.tgname = 'aggregate_refresh_queue_serialize_metric'
      and p.proname = 'lock_aggregate_metric_write' and t.tgenabled = 'O'
  ) and exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'private' and c.relname = 'aggregate_refresh_queue'
      and t.tgname = 'aggregate_refresh_queue_serialize_processing'
      and p.proname = 'lock_aggregate_metric_write' and t.tgenabled = 'O'
  ),
  'aggregate runs, queue writers, and queue completion take the same metric lock'
);
select is(
  (select refresh_interval from app.job_sources where adapter_key = 'remotive'),
  interval '6 hours',
  'Remotive source policy matches the four-times-daily runtime ceiling'
);
select is(
  (select expected_interval from private.worker_schedules where task_key = 'job_source_sync'),
  interval '6 hours',
  'job-source worker expectation matches the four-times-daily runtime cadence'
);
select is(
  (select stale_after from private.worker_schedules where task_key = 'job_source_sync'),
  interval '14 hours',
  'job-source health degrades before the fourteen-hour alert catalog expires'
);

insert into private.worker_runs (
  id, task_key, run_key, trigger_kind, status, started_at
) values
  ('da100000-0000-0000-0000-000000000001', 'operations_maintenance',
   'hardening:stale', 'test', 'running', clock_timestamp() - interval '2 hours'),
  ('da200000-0000-0000-0000-000000000002', 'operations_maintenance',
   'hardening:fresh', 'test', 'running', clock_timestamp() - interval '10 minutes');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;
select is(
  (select should_run from api.worker_start(
    'operations_maintenance', 'hardening:recovery-trigger',
    clock_timestamp(), 'hardening-test'
  )),
  true,
  'service-role worker start claims a new run while invoking recovery'
);
reset role;
select ok(
  (select status = 'failed' and completed_at is not null
          and error_code = 'worker_timeout'
   from private.worker_runs where id = 'da100000-0000-0000-0000-000000000001'),
  'worker start terminalizes an abandoned running row with a stable timeout code'
);
select ok(
  (select status = 'running' and completed_at is null and error_code is null
   from private.worker_runs where id = 'da200000-0000-0000-0000-000000000002'),
  'worker recovery leaves a recent running row untouched'
);

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values (
  'hardening_skipped_worker', interval '10 minutes', interval '35 minutes',
  'Backend hardening test owner'
);
insert into private.worker_runs (
  task_key, run_key, trigger_kind, status, started_at, completed_at, summary
) values (
  'hardening_skipped_worker', 'hardening:skipped', 'test', 'skipped',
  clock_timestamp(), clock_timestamp(), '{"reason":"provider_disabled"}'::jsonb
);
select is(
  (select freshness from api.get_worker_health()
   where task_key = 'hardening_skipped_worker'),
  'healthy',
  'a recent intentional provider skip proves scheduler freshness'
);
select is(
  (select last_success_at from api.get_worker_health()
   where task_key = 'hardening_skipped_worker'),
  null::timestamptz,
  'a skipped provider run is not misreported as provider success'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('ca100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'community-suspended@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'community-author@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ca300000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'hardening-admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, reason)
values (
  'ca300000-0000-0000-0000-000000000003', 'admin', 'backend hardening test'
)
on conflict (user_id, role) where revoked_at is null do nothing;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca100000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select lives_ok(
  $$ select api.publish_feed_post(
    'Suspended Member', 'LA', 'career_update',
    'This creates the public community profile before its suspension.'
  ) $$,
  'an active account can create its community profile before suspension'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca200000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
create temporary table hardening_thread as
select api.publish_forum_thread(
  'Active Author', 'FC', 'career-growth',
  'A durable discussion target',
  'This published discussion gives the reporting workflow a real target.'
) as id;
select ok((select id is not null from hardening_thread), 'active member publishes the report target');

reset role;
update community.member_profiles
set status = 'suspended'
where user_id = 'ca100000-0000-0000-0000-000000000001';
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca100000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.publish_forum_thread(
    'Suspended Member', 'LA', 'career-growth',
    'This thread must be rejected',
    'A suspended public profile must not create a hidden forum thread.'
  ) $$,
  '42501', null,
  'community-suspended profile cannot publish a forum thread'
);
select throws_ok(
  $$ select api.publish_forum_reply(
    'Suspended Member', 'LA',
    (select id from hardening_thread),
    'This reply must also be rejected.'
  ) $$,
  '42501', null,
  'community-suspended profile cannot publish a forum reply'
);
reset role;
select is(
  (select count(*)::integer
   from community.forum_threads t
   join community.member_profiles m on m.id = t.author_profile_id
   where m.user_id = 'ca100000-0000-0000-0000-000000000001'),
  0,
  'rejected suspended-member thread leaves no hidden row'
);
select is(
  (select count(*)::integer
   from community.forum_replies r
   join community.member_profiles m on m.id = r.author_profile_id
   where m.user_id = 'ca100000-0000-0000-0000-000000000001'),
  0,
  'rejected suspended-member reply leaves no hidden row'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca100000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.submit_report(
    'forum_thread', (select id::text from hardening_thread),
    'invented_category', null
  ) $$,
  '22023', null,
  'database report RPC rejects categories outside the web allowlist'
);
select throws_ok(
  $$ select api.submit_report(
    'forum_thread', '00000000-0000-4000-8000-000000000099',
    'spam', null
  ) $$,
  'P0002', null,
  'database report RPC rejects a nonexistent durable target'
);
create temporary table hardening_report as
select api.submit_report(
  'forum_thread', (select id::text from hardening_thread),
  'spam', 'Moderator review requested for this published discussion.'
) as id;
select ok((select id is not null from hardening_report), 'valid published target enters moderation');

reset role;
select ok(
  exists (
    select 1 from private.moderation_cases c
    where c.report_id = (select id from hardening_report) and c.state = 'open'
  ),
  'valid report creates one open moderation case'
);
select ok(
  exists (
    select 1
    from audit.event_log e
    join private.moderation_cases c
      on c.id::text = e.metadata ->> 'case_id'
    where e.action = 'content.reported'
      and e.new_state ->> 'report_id' = (select id::text from hardening_report)
      and c.report_id = (select id from hardening_report)
  ),
  'report audit metadata links the immutable event to its moderation case'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ca300000-0000-0000-0000-000000000003',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  api.admin_transition(
    'reports', 'resolve', (select id from hardening_report),
    'Published target and report evidence reviewed',
    (select admin_version from private.reports where id = (select id from hardening_report))
  ),
  true,
  'AAL2 admin can execute the formerly ambiguous report transition'
);
reset role;
select is(
  (select status::text from private.reports where id = (select id from hardening_report)),
  'resolved',
  'report transition stores the terminal report state'
);
select is(
  (select state::text from private.moderation_cases
   where report_id = (select id from hardening_report)),
  'closed',
  'report transition closes its moderation case'
);
select ok(
  (select admin_version = 2 from private.reports
   where id = (select id from hardening_report))
  and (select version = 2 and closed_at is not null from private.moderation_cases
       where report_id = (select id from hardening_report)),
  'report and moderation optimistic versions advance together'
);
select ok(
  exists (
    select 1 from audit.event_log
    where action = 'admin.reports.resolve'
      and target_id = (select id from hardening_report)
      and metadata ->> 'reason' = 'Published target and report evidence reviewed'
  ),
  'report admin transition emits its immutable reasoned audit event'
);

select * from finish();
rollback;
