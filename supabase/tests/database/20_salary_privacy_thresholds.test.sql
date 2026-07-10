begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(21);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('90000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', format('salary%s@example.test', n),
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 5) n
on conflict (id) do nothing;

insert into app.role_families (id, slug, name)
values ('91000000-0000-0000-0000-000000000001', 'product-design', 'Product Design')
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  '92000000-0000-0000-0000-000000000001', 'salary-example', 'Salary Example',
  'https://salary.example.test', 'salary.example.test', 'published'
)
on conflict (id) do nothing;

insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values
  ('93000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'salary', 'approved', repeat('1', 64), now() - interval '4 days'),
  ('93000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'salary', 'approved', repeat('2', 64), now() - interval '3 days'),
  ('93000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', 'salary', 'approved', repeat('3', 64), now() - interval '2 days');

insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code,
  work_arrangement, employment_type, engagement_type, seniority,
  base_salary, currency_code, pay_period, gross_net,
  annualized_amount, normalization_version, reported_at
)
values
  ('93000000-0000-0000-0000-000000000001', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time', 'employee', 'mid', 100000, 'NGN', 'monthly', 'gross', 1200000, 'test-v1', current_date - 60),
  ('93000000-0000-0000-0000-000000000002', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time', 'employee', 'mid', 150000, 'NGN', 'monthly', 'gross', 1800000, 'test-v1', current_date - 45),
  ('93000000-0000-0000-0000-000000000003', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time', 'employee', 'mid', 200000, 'NGN', 'monthly', 'gross', 2400000, 'test-v1', current_date - 30);

select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  0,
  'multiple rows from only two distinct contributors remain suppressed'
);

reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  '93000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000003', 'salary', 'approved', repeat('4', 64),
  now() - interval '2 days'
);
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code,
  work_arrangement, employment_type, engagement_type, seniority,
  base_salary, currency_code, pay_period, gross_net,
  annualized_amount, normalization_version, reported_at
)
values (
  '93000000-0000-0000-0000-000000000004', 'Product Designer',
  '91000000-0000-0000-0000-000000000001', 'Product Design',
  '92000000-0000-0000-0000-000000000001',
  'NG', 'remote', 'full_time', 'employee', 'mid', 300000, 'NGN', 'monthly',
  'gross', 3600000, 'test-v1', current_date - 15
);
select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  1,
  'three distinct approved contributors release one employer cell'
);
select is(
  (select sample_size from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  3,
  'duplicate submissions by one account count once'
);
select is(
  (select median_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  2400000.00::numeric,
  'released median uses the latest submission per contributor and is rounded'
);
select is(
  (select p25_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  null::numeric,
  'three-contributor cell does not expose p25'
);
select is(
  (select p75_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  null::numeric,
  'three-contributor cell does not expose p75'
);
select is(
  (select confidence_label from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  'low',
  'three-contributor cell is labelled low confidence'
);
select ok(
  (select source_month_from = date_trunc('month', source_month_from)::date
     and source_month_to = date_trunc('month', source_month_to)::date
   from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  'public salary dates are month-granular'
);
select ok(
  (select rule_version_id is not null from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  'released aggregate carries its privacy rule version'
);

reset role;
update private.contributions
set decided_at = clock_timestamp()
where id = '93000000-0000-0000-0000-000000000004';
select security.refresh_salary_aggregates();
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  0,
  'freshly approved salary data observes the publication lag even when submitted earlier'
);
reset role;
update private.contributions
set decided_at = clock_timestamp() - interval '2 days'
where id = '93000000-0000-0000-0000-000000000004';
select security.refresh_salary_aggregates();

reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values
  ('93000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', 'salary', 'approved', repeat('5', 64), now() - interval '2 days'),
  ('93000000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000005', 'salary', 'approved', repeat('6', 64), now() - interval '2 days');
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code,
  work_arrangement, employment_type, engagement_type, seniority,
  base_salary, currency_code, pay_period, gross_net,
  annualized_amount, normalization_version, reported_at
)
values
  ('93000000-0000-0000-0000-000000000005', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time', 'employee', 'mid', 400000, 'NGN', 'monthly', 'gross', 4800000, 'test-v1', current_date - 10),
  ('93000000-0000-0000-0000-000000000006', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time', 'employee', 'mid', 500000, 'NGN', 'monthly', 'gross', 6000000, 'test-v1', current_date - 5);
select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select sample_size from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  5,
  'five distinct contributors are counted in the released cell'
);
select ok(
  (select p25_annual is not null and p75_annual is not null
   from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  'five-contributor cell exposes the percentile band'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'api' and table_name = 'salary_aggregates'
      and column_name in ('minimum', 'maximum', 'min_annual', 'max_annual', 'contributor_user_id')
  ),
  'public salary surface has no individual identity or min/max fields'
);
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'
     and currency_code <> 'NGN'),
  0,
  'salary aggregate does not silently mix currencies'
);

reset role;
insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  '92000000-0000-0000-0000-000000000002', 'second-salary-example',
  'Second Salary Example', 'https://second-salary.example.test',
  'second-salary.example.test', 'published'
);
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  '93000000-0000-0000-0000-000000000007',
  '90000000-0000-0000-0000-000000000001', 'salary', 'approved', repeat('7', 64),
  now() - interval '2 days'
);
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values (
  '93000000-0000-0000-0000-000000000007', 'Product Designer',
  '91000000-0000-0000-0000-000000000001', 'Product Design',
  '92000000-0000-0000-0000-000000000002', 'NG', 'remote', 'full_time',
  'employee', 'mid', 1000000, 'NGN', 'monthly', 'gross', 12000000,
  'test-v1', current_date - 2
);
select security.refresh_salary_aggregates();
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select sample_size from api.salary_aggregates where company_id is null),
  5,
  'broader role-country cell still counts one row per contributor across companies'
);
select is(
  (select median_annual from api.salary_aggregates where company_id is null),
  4800000.00::numeric,
  'broader role-country median uses only the latest eligible row per contributor'
);

reset role;
update private.contributions set state = 'removed', withdrawn_at = now()
where id in (
  '93000000-0000-0000-0000-000000000004',
  '93000000-0000-0000-0000-000000000005',
  '93000000-0000-0000-0000-000000000006'
);
select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  0,
  'recompute unpublishes a cell after it falls below k'
);
select is(
  (select count(*)::integer from api.salary_aggregates),
  0,
  'no prior non-current snapshot remains publicly visible'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '90000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from private.salary_submissions),
  0,
  'ordinary contributor cannot read raw salary rows, including their own'
);
select is(
  (select count(*)::integer from api.my_contributions),
  3,
  'contributor can see only safe status metadata for their own contributions'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'api' and table_name = 'my_contributions'
      and column_name in ('content_hash', 'contributor_user_id')
  ),
  'contributor status projection omits identity and content hashes'
);

select * from finish();
rollback;
