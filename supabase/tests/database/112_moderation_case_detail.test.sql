begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(9);

select ok(
  to_regprocedure('api.admin_get_moderation_case(uuid)') is not null,
  'the protected moderation case detail RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'api.admin_get_moderation_case(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_get_moderation_case(uuid)', 'EXECUTE'),
  'only authenticated callers can invoke the case detail RPC'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('ac000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member-detail@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ac000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'moderator-detail@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ac000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'contributor-detail@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values (
  'ac000000-0000-4000-8000-000000000002', 'moderator', null,
  'moderation detail contract test'
)
on conflict (user_id, role) where revoked_at is null do nothing;

insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  'ac000000-0000-4000-8000-000000000010',
  'ac000000-0000-4000-8000-000000000003', 'benefits', 'pending',
  repeat('c', 64), now() - interval '1 hour'
);

insert into private.benefit_submissions (
  contribution_id, company_name_input, country_code, employment_status,
  benefits, overtime_expectation, weekend_work
)
values (
  'ac000000-0000-4000-8000-000000000010', 'Detail Test Co', 'NG', 'current',
  '{"health_cover":"employee_and_family"}'::jsonb, 'rare', 'never'
);

insert into private.moderation_cases (id, contribution_id, priority)
values (
  'ac000000-0000-4000-8000-000000000020',
  'ac000000-0000-4000-8000-000000000010', 1
);

insert into private.moderation_flags (id, case_id, kind, source, confidence, details)
values (
  'ac000000-0000-4000-8000-000000000030',
  'ac000000-0000-4000-8000-000000000020', 'pii', 'automated', 0.95,
  '{"matched_text":"must-never-leave-private-detector-details"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ac000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020') $$,
  '42501', null,
  'an ordinary AAL2 member cannot read private case content'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ac000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020') $$,
  '42501', null,
  'a moderator must complete AAL2 before reading case content'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'ac000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select is(
  api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020') ->> 'source_type',
  'benefits',
  'the detail identifies the contribution kind'
);
select is(
  api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020')
    #>> '{source_payload,company_name_input}',
  'Detail Test Co',
  'the moderator receives the source record needed for review'
);
select is(
  jsonb_array_length(
    api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020') -> 'flags'
  ),
  1,
  'the case carries its flag taxonomy'
);
select ok(
  not (
    api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020')
      #> '{flags,0}' ? 'details'
  ),
  'raw detector details are not exposed'
);
select ok(
  api.admin_get_moderation_case('ac000000-0000-4000-8000-000000000020')::text
    not like '%must-never-leave-private-detector-details%',
  'matched detector text never reaches the detail response'
);

select * from finish();
rollback;
