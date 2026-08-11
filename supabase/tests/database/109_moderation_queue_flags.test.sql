begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(9);

select ok(
  to_regprocedure('api.admin_list_moderation()') is not null,
  'the dedicated moderation queue RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'api.admin_list_moderation()', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_list_moderation()', 'EXECUTE'),
  'only authenticated callers can invoke the moderation queue RPC'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'moderator@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'contributor@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values (
  'a9000000-0000-4000-8000-000000000002', 'moderator', null,
  'moderation queue contract test'
)
on conflict (user_id, role) where revoked_at is null do nothing;

insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values
  (
    'a9000000-0000-4000-8000-000000000010',
    'a9000000-0000-4000-8000-000000000003', 'benefits', 'pending',
    repeat('a', 64), now() - interval '2 hours'
  ),
  (
    'a9000000-0000-4000-8000-000000000011',
    'a9000000-0000-4000-8000-000000000003', 'pay_reliability', 'pending',
    repeat('b', 64), now() - interval '1 hour'
  );

insert into private.benefit_submissions (
  contribution_id, company_name_input, country_code, employment_status,
  benefits, overtime_expectation, weekend_work
)
values (
  'a9000000-0000-4000-8000-000000000010', 'Benefits Test Co', 'NG', 'current',
  '{}'::jsonb, 'rare', 'never'
);

insert into private.pay_reliability_submissions (
  contribution_id, company_name_input, country_code, employment_status,
  observation_window, on_time_frequency, longest_delay, arrears_resolved
)
values (
  'a9000000-0000-4000-8000-000000000011', 'Pay Test Co', 'NG', 'former',
  '6_to_12_months', 'sometimes_late', '1_to_4_weeks', 'partly'
);

insert into private.moderation_cases (id, contribution_id, priority)
values
  ('a9000000-0000-4000-8000-000000000020', 'a9000000-0000-4000-8000-000000000010', 1),
  ('a9000000-0000-4000-8000-000000000021', 'a9000000-0000-4000-8000-000000000011', 2);

insert into private.moderation_flags (case_id, kind, source, confidence, details)
values
  (
    'a9000000-0000-4000-8000-000000000020', 'pii', 'automated', 0.95,
    '{"matched_text":"must-never-reach-the-queue"}'::jsonb
  ),
  (
    'a9000000-0000-4000-8000-000000000020', 'threat', 'automated', 0.90,
    '{"matched_text":"must-never-reach-the-queue"}'::jsonb
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a9000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_list_moderation() $$,
  '42501', null,
  'an ordinary AAL2 member cannot read the moderation queue'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a9000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_list_moderation() $$,
  '42501', null,
  'a moderator must complete AAL2 before reading the queue'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a9000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api.admin_list_moderation()
   where id in (
     'a9000000-0000-4000-8000-000000000020',
     'a9000000-0000-4000-8000-000000000021'
   )),
  2,
  'an AAL2 moderator receives both new contribution kinds'
);
select is(
  (select title from api.admin_list_moderation()
   where id = 'a9000000-0000-4000-8000-000000000020'),
  'Benefits Test Co benefits',
  'the benefits contribution has an actionable queue title'
);
select is(
  (select title from api.admin_list_moderation()
   where id = 'a9000000-0000-4000-8000-000000000021'),
  'Pay Test Co pay reliability',
  'the pay-reliability contribution has an actionable queue title'
);
select ok(
  (select secondary from api.admin_list_moderation()
   where id = 'a9000000-0000-4000-8000-000000000020')
    like '%Flags: pii, threat%',
  'the queue exposes the safety flag taxonomy in deterministic order'
);
select ok(
  (select secondary from api.admin_list_moderation()
   where id = 'a9000000-0000-4000-8000-000000000020')
    not like '%must-never-reach-the-queue%',
  'the queue never exposes matched text or private flag details'
);

select * from finish();
rollback;
