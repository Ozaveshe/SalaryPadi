begin;

-- Shape suppression for the workers that publish statements about a company.
--
-- Ratings, benefits and pay reliability each name an employer, which makes
-- every cell a sensitive slice under src/lib/contributions/slice-privacy.ts.
-- Before this, all three published at the general threshold.
--
-- This file is also the first behavioural coverage these two workers have
-- had, which is why the missing aggregate-run bookkeeping went unnoticed.

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(10);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('b0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', format('practice%s@example.test', n),
  '{}'::jsonb, '{}'::jsonb, now(), now()
from generate_series(1, 10) n
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  'b2000000-0000-0000-0000-000000000001', 'practice-example', 'Practice Example',
  'https://practice.example.test', 'practice.example.test', 'published'
)
on conflict (id) do nothing;

-- Nine reviewers.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
select
  ('b3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('b0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'review', 'approved', lpad(n::text, 64, '0'), now() - interval '5 days'
from generate_series(1, 9) n;

insert into app.review_publications (
  source_contribution_id, company_id, country_code, employment_status,
  compensation_rating, pay_reliability_rating, management_rating,
  work_life_rating, career_growth_rating, overall_rating, publication_status
)
select
  ('b3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'b2000000-0000-0000-0000-000000000001', 'NG', 'current',
  4, 4, 4, 4, 4, 4.0, 'published'
from generate_series(1, 9) n;

select security.refresh_company_ratings();

select is(
  (select count(*)::integer from app.company_rating_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  0,
  'nine reviewers leave a company rating suppressed'
);

select is(
  (select suppressed_cells from app.aggregate_runs
   where metric = 'company_overall_rating' order by started_at desc limit 1),
  1,
  'the rating run records the cell it withheld'
);

-- The tenth.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  'b3000000-0000-0000-0000-000000000010',
  'b0000000-0000-0000-0000-000000000010', 'review', 'approved',
  lpad('10', 64, '0'), now() - interval '5 days'
);
insert into app.review_publications (
  source_contribution_id, company_id, country_code, employment_status,
  compensation_rating, pay_reliability_rating, management_rating,
  work_life_rating, career_growth_rating, overall_rating, publication_status
)
values (
  'b3000000-0000-0000-0000-000000000010',
  'b2000000-0000-0000-0000-000000000001', 'NG', 'current',
  4, 4, 4, 4, 4, 4.0, 'published'
);
select security.refresh_company_ratings();

select is(
  (select sample_size from app.company_rating_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  10,
  'the tenth reviewer releases the rating'
);
select ok(
  (select rule_version_id is not null from app.company_rating_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  'a released rating carries the privacy rule version it was computed under'
);

-- Nine benefit reporters and nine pay-reliability reporters.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
select
  ('b4000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('b0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'benefits', 'approved', lpad((100 + n)::text, 64, '0'), now() - interval '5 days'
from generate_series(1, 9) n;
insert into private.benefit_submissions (
  contribution_id, company_id, company_name_input, country_code,
  employment_status, benefits, overtime_expectation, weekend_work
)
select
  ('b4000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'b2000000-0000-0000-0000-000000000001', 'Practice Example', 'NG',
  'current', '{"pension": "yes"}'::jsonb, 'rare', 'never'
from generate_series(1, 9) n;

insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
select
  ('b5000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('b0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'pay_reliability', 'approved', lpad((200 + n)::text, 64, '0'), now() - interval '5 days'
from generate_series(1, 9) n;
insert into private.pay_reliability_submissions (
  contribution_id, company_id, company_name_input, country_code,
  employment_status, observation_window, on_time_frequency, longest_delay,
  arrears_resolved
)
select
  ('b5000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'b2000000-0000-0000-0000-000000000001', 'Practice Example', 'NG',
  'current', '6_to_12_months', 'sometimes_late', '1_to_4_weeks', 'partly'
from generate_series(1, 9) n;

select security.refresh_company_workplace_aggregates();

select is(
  (select count(*)::integer from app.company_benefit_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  0,
  'nine reporters leave a company benefit suppressed'
);
select is(
  (select count(*)::integer from app.pay_reliability_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  0,
  'nine reporters leave a pay-reliability pattern suppressed'
);

-- The tenth of each.
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values
  ('b4000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000010', 'benefits', 'approved', lpad('110', 64, '0'), now() - interval '5 days'),
  ('b5000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000010', 'pay_reliability', 'approved', lpad('210', 64, '0'), now() - interval '5 days');
insert into private.benefit_submissions (
  contribution_id, company_id, company_name_input, country_code,
  employment_status, benefits, overtime_expectation, weekend_work
)
values (
  'b4000000-0000-0000-0000-000000000010',
  'b2000000-0000-0000-0000-000000000001', 'Practice Example', 'NG',
  'current', '{"pension": "yes"}'::jsonb, 'rare', 'never'
);
insert into private.pay_reliability_submissions (
  contribution_id, company_id, company_name_input, country_code,
  employment_status, observation_window, on_time_frequency, longest_delay,
  arrears_resolved
)
values (
  'b5000000-0000-0000-0000-000000000010',
  'b2000000-0000-0000-0000-000000000001', 'Practice Example', 'NG',
  'current', '6_to_12_months', 'sometimes_late', '1_to_4_weeks', 'partly'
);

select security.refresh_company_workplace_aggregates();

select is(
  (select sample_size from app.company_benefit_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  10,
  'the tenth reporter releases the benefit cell'
);
select is(
  (select sample_size from app.pay_reliability_snapshots
   where is_current and is_released
     and company_id = 'b2000000-0000-0000-0000-000000000001'),
  10,
  'the tenth reporter releases the pay-reliability pattern'
);

-- The workplace worker kept no run record at all before this. It unpublishes
-- every snapshot before recomputing, so with no run row there was no way to
-- tell whether it had run, what it released, or what it withheld.
select is(
  (select count(distinct metric)::integer from app.aggregate_runs
   where metric in ('company_benefit_aggregate', 'pay_reliability_aggregate')),
  2,
  'the workplace worker records a run for each metric it publishes'
);
-- Asserted per metric rather than "the latest run", because started_at
-- defaults to now() and every run in this file shares one transaction
-- timestamp. In production each refresh is its own transaction; here the
-- runs are not orderable, so the claim is made over all of them.
select ok(
  (select bool_and(status = 'succeeded') from app.aggregate_runs
   where metric in ('company_benefit_aggregate', 'pay_reliability_aggregate'))
  and (select bool_and(released = 1) from (
    select metric, max(released_cells) as released
    from app.aggregate_runs
    where metric in ('company_benefit_aggregate', 'pay_reliability_aggregate')
    group by metric
  ) per_metric),
  'every workplace run succeeds, and each metric records the cell it released'
);

select * from finish();
rollback;
