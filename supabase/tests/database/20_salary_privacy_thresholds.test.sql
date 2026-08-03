begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(21);

-- Naming an employer makes a cell a sensitive slice, so it needs the higher
-- contributor count. A cell that names no employer keeps the general
-- threshold but must span at least two identified employers, or it is that
-- one employer's pay figure wearing a national label.

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('90000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', format('salary%s@example.test', n),
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 12) n
on conflict (id) do nothing;

insert into app.role_families (id, slug, name)
values ('91000000-0000-0000-0000-000000000001', 'product-design', 'Product Design')
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values
  ('92000000-0000-0000-0000-000000000001', 'salary-example', 'Salary Example',
   'https://salary.example.test', 'salary.example.test', 'published'),
  ('92000000-0000-0000-0000-000000000002', 'second-salary-example',
   'Second Salary Example', 'https://second-salary.example.test',
   'second-salary.example.test', 'published')
on conflict (id) do nothing;

-- Nine distinct contributors at one employer, one of whom submits twice.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
select
  ('93000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('90000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'salary', 'approved', lpad(n::text, 64, '0'), now() - make_interval(days => 30 - n)
from generate_series(1, 9) n;

insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code,
  work_arrangement, employment_type, engagement_type, seniority,
  base_salary, currency_code, pay_period, gross_net,
  annualized_amount, normalization_version, reported_at
)
select
  ('93000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design',
  '92000000-0000-0000-0000-000000000001', 'NG',
  'remote', 'full_time', 'employee', 'mid',
  n * 100000, 'NGN', 'monthly', 'gross',
  n * 1000000, 'test-v1', current_date - (60 - n)
from generate_series(1, 9) n;

-- A tenth submission, but from an account that has already contributed.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  '93000000-0000-0000-0000-000000000010',
  '90000000-0000-0000-0000-000000000001', 'salary', 'approved',
  lpad('10', 64, '0'), now() - interval '2 days'
);
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values (
  '93000000-0000-0000-0000-000000000010', 'Product Designer',
  '91000000-0000-0000-0000-000000000001', 'Product Design',
  '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time',
  'employee', 'mid', 1100000, 'NGN', 'monthly', 'gross', 11000000,
  'test-v1', current_date - 5
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
  'ten submissions from nine distinct contributors leave an employer cell suppressed'
);

reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  '93000000-0000-0000-0000-000000000011',
  '90000000-0000-0000-0000-000000000010', 'salary', 'approved',
  lpad('11', 64, '0'), now() - interval '2 days'
);
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values (
  '93000000-0000-0000-0000-000000000011', 'Product Designer',
  '91000000-0000-0000-0000-000000000001', 'Product Design',
  '92000000-0000-0000-0000-000000000001', 'NG', 'remote', 'full_time',
  'employee', 'mid', 1000000, 'NGN', 'monthly', 'gross', 10000000,
  'test-v1', current_date - 4
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
  'the tenth distinct contributor releases the employer cell'
);
select is(
  (select sample_size from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  10,
  'two submissions by one account count once'
);
select is(
  (select median_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  6500000.00::numeric,
  'released median uses the latest submission per contributor and is rounded'
);
select is(
  (select p25_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  4250000.00::numeric,
  'released cell exposes a rounded lower percentile'
);
select is(
  (select p75_annual from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  8750000.00::numeric,
  'released cell exposes a rounded upper percentile'
);
select is(
  (select confidence_label from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000001'),
  'high',
  'a ten-contributor cell is labelled high confidence'
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
select is(
  (select count(*)::integer from api.salary_aggregates where company_id is null),
  0,
  'a national cell supplied by a single employer is not published'
);

reset role;
update private.contributions
set decided_at = clock_timestamp()
where id = '93000000-0000-0000-0000-000000000011';
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
where id = '93000000-0000-0000-0000-000000000011';

-- A second employer, which is what lets the national cell publish at all.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values
  ('93000000-0000-0000-0000-000000000012', '90000000-0000-0000-0000-000000000011', 'salary', 'approved', lpad('12', 64, '0'), now() - interval '2 days'),
  ('93000000-0000-0000-0000-000000000013', '90000000-0000-0000-0000-000000000012', 'salary', 'approved', lpad('13', 64, '0'), now() - interval '2 days');
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values
  ('93000000-0000-0000-0000-000000000012', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000002', 'NG', 'remote', 'full_time', 'employee', 'mid', 2000000, 'NGN', 'monthly', 'gross', 20000000, 'test-v1', current_date - 3),
  ('93000000-0000-0000-0000-000000000013', 'Product Designer', '91000000-0000-0000-0000-000000000001', 'Product Design', '92000000-0000-0000-0000-000000000002', 'NG', 'remote', 'full_time', 'employee', 'mid', 2200000, 'NGN', 'monthly', 'gross', 22000000, 'test-v1', current_date - 2);
select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select sample_size from api.salary_aggregates where company_id is null),
  12,
  'the national cell counts one row per contributor across employers'
);
select is(
  (select median_annual from api.salary_aggregates where company_id is null),
  7500000.00::numeric,
  'national median uses only the latest eligible row per contributor'
);
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id = '92000000-0000-0000-0000-000000000002'),
  0,
  'the second employer stays suppressed at two contributors'
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
   where currency_code <> 'NGN'),
  0,
  'salary aggregate does not silently mix currencies'
);

reset role;
update private.contributions set state = 'removed', withdrawn_at = now()
where id in (
  '93000000-0000-0000-0000-000000000011',
  '93000000-0000-0000-0000-000000000012',
  '93000000-0000-0000-0000-000000000013'
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
  2,
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
