begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, community, security, audit;
select plan(17);

select ok(
  to_regprocedure('security.update_job_alert(uuid,jsonb,text,boolean)') is not null
  and to_regprocedure('security.update_community_profile(text,text)') is not null
  and to_regprocedure('api.update_job_alert(uuid,jsonb,text,boolean)') is not null
  and to_regprocedure('api.update_community_profile(text,text)') is not null,
  'account and alert management RPCs exist'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.update_job_alert(uuid,jsonb,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'api.update_job_alert(uuid,jsonb,text,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'api.update_job_alert(uuid,jsonb,text,boolean)',
    'EXECUTE'
  ),
  'alert updates are exposed only to authenticated accounts'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.update_community_profile(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'api.update_community_profile(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'api.update_community_profile(text,text)',
    'EXECUTE'
  ),
  'community profile settings are exposed only to authenticated accounts'
);
select ok(
  (select p.prosecdef
   from pg_proc p
   where p.oid = 'security.update_job_alert(uuid,jsonb,text,boolean)'::regprocedure)
  and (select p.prosecdef
       from pg_proc p
       where p.oid = 'security.update_community_profile(text,text)'::regprocedure)
  and (
    select coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    where p.oid = 'security.update_job_alert(uuid,jsonb,text,boolean)'::regprocedure
  ) like '%search_path=%'
  and (
    select coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    where p.oid = 'security.update_community_profile(text,text)'::regprocedure
  ) like '%search_path=%',
  'owner-scoped account implementations are fixed-search-path definers'
);
select ok(
  not (select p.prosecdef
       from pg_proc p
       where p.oid = 'api.update_job_alert(uuid,jsonb,text,boolean)'::regprocedure)
  and not (select p.prosecdef
           from pg_proc p
           where p.oid = 'api.update_community_profile(text,text)'::regprocedure),
  'public API wrappers remain security invokers'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'ac000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'account-a@example.test',
    '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()
  ),
  (
    'ac000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'account-b@example.test',
    '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()
  )
on conflict (id) do nothing;

update private.profiles
set account_status = 'active'
where user_id in (
  'ac000000-0000-0000-0000-000000000001',
  'ac000000-0000-0000-0000-000000000002'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ac000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select api.update_community_profile('Ada Account', 'LA') $$,
  'an active account can save community identity without publishing content'
);
select is(
  (select display_name || ':' || state_code
   from api.get_my_community_profile()),
  'Ada Account:LA',
  'the profile wrapper persists the validated display name and state'
);
select matches(
  (select handle from api.get_my_community_profile()),
  '^sp-[a-f0-9]{8}$',
  'central profile editing preserves the random non-email public handle'
);

select set_config(
  'test.account_alert_id',
  api.create_job_alert(
    jsonb_build_object(
      'q', 'engineer',
      'location', 'Lagos',
      'eligibility', 'nigeria'
    ),
    'daily'
  )::text,
  true
);
select ok(
  current_setting('test.account_alert_id')::uuid is not null,
  'the owner has an alert to manage'
);
select is(
  api.update_job_alert(
    current_setting('test.account_alert_id')::uuid,
    jsonb_build_object(
      'q', 'platform engineer',
      'location', 'Nigeria',
      'eligibility', 'nigeria'
    ),
    'weekly',
    null
  ),
  true,
  'the owner can edit alert query filters and cadence'
);

reset role;
select ok(
  (select search_spec ->> 'q' = 'platform engineer'
          and search_spec ->> 'location' = 'Nigeria'
          and search_spec ->> 'schema_version' = '1'
          and cadence = 'weekly'
   from private.job_alerts
   where id = current_setting('test.account_alert_id')::uuid),
  'the edited alert stores a versioned query and supported cadence'
);

set local role authenticated;
select is(
  api.update_job_alert(
    current_setting('test.account_alert_id')::uuid,
    alert_active => false
  ),
  true,
  'the owner can pause an alert without resubmitting its query'
);
reset role;
select is(
  (select is_enabled
   from private.job_alerts
   where id = current_setting('test.account_alert_id')::uuid),
  false,
  'the paused state is stored on the owner alert'
);

set local role authenticated;
select throws_ok(
  $$ select api.update_job_alert(
       current_setting('test.account_alert_id')::uuid,
       alert_cadence => 'monthly'
     ) $$,
  '22023',
  'invalid alert',
  'unsupported alert cadences fail closed'
);
select throws_ok(
  $$ select api.update_community_profile('Ada Account', 'XX') $$,
  '22023',
  'invalid Nigerian state',
  'central profile editing reuses the existing state validation'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ac000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  api.update_job_alert(
    current_setting('test.account_alert_id')::uuid,
    alert_active => true
  ),
  false,
  'another account cannot resume the owner alert'
);

reset role;
select is(
  (select is_enabled
   from private.job_alerts
   where id = current_setting('test.account_alert_id')::uuid),
  false,
  'a cross-account update attempt leaves the owner alert unchanged'
);

select * from finish();
rollback;
