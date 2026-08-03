begin;

-- Shape suppression: the rules that no contributor count can argue past.
--
-- `20_salary_privacy_thresholds` covers how many people a cell needs. This
-- covers which cells may exist at all, and mirrors
-- src/lib/contributions/slice-privacy.ts.

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(6);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', format('shape%s@example.test', n),
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 12) n
on conflict (id) do nothing;

insert into app.role_families (id, slug, name)
values ('a1000000-0000-0000-0000-000000000001', 'data-analysis', 'Data Analysis')
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values
  ('a2000000-0000-0000-0000-000000000001', 'shape-one', 'Shape One',
   'https://shape-one.example.test', 'shape-one.example.test', 'published'),
  ('a2000000-0000-0000-0000-000000000002', 'shape-two', 'Shape Two',
   'https://shape-two.example.test', 'shape-two.example.test', 'published')
on conflict (id) do nothing;

-- Twelve contributors, every one of them at the same employer.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
select
  ('a3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'salary', 'approved', lpad(('9' || n::text), 64, '0'), now() - interval '5 days'
from generate_series(1, 12) n;

insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code,
  work_arrangement, employment_type, engagement_type, seniority,
  base_salary, currency_code, pay_period, gross_net,
  annualized_amount, normalization_version, reported_at
)
select
  ('a3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'Data Analyst', 'a1000000-0000-0000-0000-000000000001', 'Data Analysis',
  'a2000000-0000-0000-0000-000000000001', 'NG',
  'remote', 'full_time', 'employee', 'mid',
  n * 100000, 'NGN', 'monthly', 'gross',
  n * 1000000, 'test-v1', current_date - 20
from generate_series(1, 12) n;

select security.refresh_salary_aggregates();

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is(
  (select count(*)::integer from api.salary_aggregates
   where company_id is null
     and role_family_id = 'a1000000-0000-0000-0000-000000000001'),
  0,
  'twelve contributors cannot publish a national cell when all work at one employer'
);
select is(
  (select sample_size from api.salary_aggregates
   where company_id = 'a2000000-0000-0000-0000-000000000001'),
  12,
  'the same twelve publish as the employer cell they actually describe'
);

-- One contributor at a second employer is still not a spread of employers.
reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  'a3000000-0000-0000-0000-000000000013',
  'a0000000-0000-0000-0000-000000000001', 'salary', 'approved',
  lpad('913', 64, '0'), now() - interval '4 days'
);
insert into private.salary_submissions (
  contribution_id, role_title, role_family_id, role_family_name_input,
  company_id, country_code, work_arrangement, employment_type,
  engagement_type, seniority, base_salary, currency_code, pay_period,
  gross_net, annualized_amount, normalization_version, reported_at
)
values (
  'a3000000-0000-0000-0000-000000000013', 'Data Analyst',
  'a1000000-0000-0000-0000-000000000001', 'Data Analysis',
  'a2000000-0000-0000-0000-000000000002', 'NG', 'remote', 'full_time',
  'employee', 'mid', 1300000, 'NGN', 'monthly', 'gross', 13000000,
  'test-v1', current_date - 10
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
   where company_id is null
     and role_family_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'a second identified employer releases the national cell'
);

-- An office-scoped cell names a group of colleagues who already know each
-- other's roles. No count makes that publishable.
reset role;
insert into app.company_locations (id, company_id, country_code, city, location_type)
values (
  'a4000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001', 'NG', 'Lagos', 'office'
);

select throws_ok(
  $$
    insert into app.salary_aggregate_snapshots (
      aggregate_run_id, rule_version_id, company_id, office_id, role_family_id,
      country_code, currency_code, gross_net, engagement_type, sample_size,
      median_annual, source_month_from, source_month_to, confidence_label,
      is_released, is_current
    )
    select
      (select id from app.aggregate_runs order by started_at desc limit 1),
      (select id from app.privacy_rule_versions
       where metric = 'salary_employer_role_country' and is_active),
      'a2000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'NG', 'NGN', 'gross', 'employee', 500,
      6000000, current_date - 60, current_date - 30, 'high', true, true
  $$,
  '23514',
  null,
  'an office-scoped salary cell cannot be released at any sample size'
);

select lives_ok(
  $$
    insert into app.salary_aggregate_snapshots (
      aggregate_run_id, rule_version_id, company_id, office_id, role_family_id,
      country_code, currency_code, gross_net, engagement_type, sample_size,
      median_annual, source_month_from, source_month_to, confidence_label,
      is_released, is_current
    )
    select
      (select id from app.aggregate_runs order by started_at desc limit 1),
      (select id from app.privacy_rule_versions
       where metric = 'salary_employer_role_country' and is_active),
      'a2000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'NG', 'NGN', 'gross', 'employee', 500,
      6000000, current_date - 60, current_date - 30, 'high', false, false
  $$,
  'an office-scoped cell may be computed as long as it is never released'
);

select ok(
  (select min_sensitive_contributors > min_distinct_contributors
   from app.privacy_rule_versions
   where metric = 'salary_employer_role_country' and is_active),
  'naming an employer costs more contributors than not naming one'
);

select * from finish();
rollback;
