begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(13);

select ok(
  to_regprocedure('api.get_salary_cell_progress(text,text)') is not null,
  'the public salary progress RPC exists'
);
select ok(
  has_function_privilege('anon', 'api.get_salary_cell_progress(text,text)', 'EXECUTE')
  and has_function_privilege(
    'authenticated', 'api.get_salary_cell_progress(text,text)', 'EXECUTE'
  ),
  'anonymous and authenticated readers can request privacy-safe progress'
);
select ok(
  (select security_type = 'DEFINER'
   from information_schema.routines
   where routine_schema = 'api'
     and routine_name = 'get_salary_cell_progress')
  and (
    select coalesce(array_to_string(proc.proconfig, ','), '')
    from pg_proc as proc
    where proc.oid = 'api.get_salary_cell_progress(text,text)'::regprocedure
  ) like '%search_path=%',
  'the narrow public reader is a fixed-search-path definer'
);
select ok(
  pg_get_function_arguments(
    'api.get_salary_cell_progress(text,text)'::regprocedure
  ) not like '%company%',
  'the RPC has no company filter that could expose a narrow cell'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', format('progress%s@example.test', n),
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 4) as n
on conflict (id) do nothing;

insert into app.role_families (id, slug, name)
values
  ('96100000-0000-0000-0000-000000000001', 'data-analysis', 'Data Analysis'),
  ('96100000-0000-0000-0000-000000000002', 'empty-role', 'Empty Role')
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values
  (
    '96200000-0000-0000-0000-000000000001', 'progress-one',
    'Progress One', 'https://one.progress.test', 'one.progress.test', 'published'
  ),
  (
    '96200000-0000-0000-0000-000000000002', 'progress-two',
    'Progress Two', 'https://two.progress.test', 'two.progress.test', 'published'
  )
on conflict (id) do nothing;

insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at, decided_at
)
values
  (
    '96300000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001', 'salary', 'approved',
    repeat('1', 64), now() - interval '4 days', now() - interval '3 days'
  ),
  (
    '96300000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000001', 'salary', 'approved',
    repeat('2', 64), now() - interval '3 days', now() - interval '2 days'
  ),
  (
    '96300000-0000-0000-0000-000000000003',
    '96000000-0000-0000-0000-000000000002', 'salary', 'pending',
    repeat('3', 64), now() - interval '3 days', null
  );

insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values
  (
    '96300000-0000-0000-0000-000000000001', 'Data Analyst',
    '96100000-0000-0000-0000-000000000001', 'Data Analysis',
    '96200000-0000-0000-0000-000000000001', 'NG', 'hybrid', 'full_time',
    'employee', 'mid', 100000, 'NGN', 'monthly', 'gross', 1200000,
    'test-v1', current_date - 30
  ),
  (
    '96300000-0000-0000-0000-000000000002', 'Data Analyst',
    '96100000-0000-0000-0000-000000000001', 'Data Analysis',
    '96200000-0000-0000-0000-000000000002', 'NG', 'hybrid', 'full_time',
    'employee', 'mid', 110000, 'NGN', 'monthly', 'gross', 1320000,
    'test-v1', current_date - 20
  ),
  (
    '96300000-0000-0000-0000-000000000003', 'Data Analyst',
    '96100000-0000-0000-0000-000000000001', 'Data Analysis',
    '96200000-0000-0000-0000-000000000002', 'NG', 'hybrid', 'full_time',
    'employee', 'mid', 120000, 'NGN', 'monthly', 'gross', 1440000,
    'test-v1', current_date - 10
  );

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;

select is(
  (select displayed_contributions
   from api.get_salary_cell_progress('empty-role', 'NG')),
  0,
  'an empty broad cell may safely disclose zero'
);
select is(
  (select progress_status
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  'fewer_than_threshold',
  'one distinct approved contributor is reported only as a bucket'
);
select is(
  (select displayed_contributions
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  null::integer,
  'an exact count of one is never returned'
);
select ok(
  not ((select to_jsonb(progress) from api.get_salary_cell_progress(
    'data-analysis', 'NG'
  ) as progress) ?| array['company_id', 'company_slug', 'contributor_user_id']),
  'the result has no company or contributor identifiers'
);
select is(
  (select count(*)::integer
   from api.get_salary_cell_progress('not a valid slug', 'NG')),
  0,
  'invalid role input fails closed'
);

reset role;
update private.contributions
set state = 'approved', decided_at = now() - interval '2 days'
where id = '96300000-0000-0000-0000-000000000003';

set local role anon;
select is(
  (select displayed_contributions
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  null::integer,
  'two approved contributors remain indistinguishable from one'
);

reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at, decided_at
)
values
  (
    '96300000-0000-0000-0000-000000000004',
    '96000000-0000-0000-0000-000000000003', 'salary', 'approved',
    repeat('4', 64), now() - interval '3 days', now() - interval '2 days'
  ),
  (
    '96300000-0000-0000-0000-000000000005',
    '96000000-0000-0000-0000-000000000003', 'salary', 'approved',
    repeat('5', 64), now() - interval '2 days', now() - interval '2 days'
  );
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values
  (
    '96300000-0000-0000-0000-000000000004', 'Data Analyst',
    '96100000-0000-0000-0000-000000000001', 'Data Analysis',
    '96200000-0000-0000-0000-000000000001', 'NG', 'hybrid', 'full_time',
    'employee', 'mid', 2000, 'USD', 'monthly', 'gross', 24000,
    'test-v1', current_date - 8
  ),
  (
    '96300000-0000-0000-0000-000000000005', 'Data Analyst',
    '96100000-0000-0000-0000-000000000001', 'Data Analysis',
    '96200000-0000-0000-0000-000000000001', 'NG', 'hybrid', 'full_time',
    'employee', 'mid', 150000, 'NGN', 'monthly', 'gross', 1800000,
    'test-v1', current_date - 7
  );

set local role anon;
select is(
  (select displayed_contributions
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  3,
  'the public count is capped when a compatible cell reaches the threshold'
);
select is(
  (select progress_status
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  'threshold_met',
  'a compatible broad cell reports only that its threshold is met'
);
select is(
  (select privacy_threshold
   from api.get_salary_cell_progress('data-analysis', 'NG')),
  3,
  'the display uses the active configured privacy threshold'
);

select * from finish();
rollback;
