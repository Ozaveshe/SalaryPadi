begin;

do $$
begin
  create type private.company_claim_status as enum (
    'pending', 'in_review', 'verified', 'rejected', 'revoked'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.contribution_kind as enum ('salary', 'review', 'interview');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.contribution_state as enum (
    'draft', 'pending', 'in_review', 'revision_requested', 'escalated',
    'approved', 'rejected', 'merged', 'removed'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.moderation_case_state as enum ('open', 'in_review', 'escalated', 'closed');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.moderation_action_kind as enum (
    'claim', 'approve', 'redact', 'reject', 'request_revision',
    'escalate', 'merge_duplicate', 'remove', 'restore'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.moderation_flag_kind as enum (
    'pii', 'doxxing', 'defamation_risk', 'harassment', 'hate_speech',
    'threat', 'spam', 'duplicate', 'review_manipulation',
    'employer_brigading', 'salary_manipulation', 'confidential_material'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.flag_source as enum ('automated', 'reporter', 'moderator', 'system');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.report_target_kind as enum ('job', 'company', 'review', 'interview');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.report_status as enum ('pending', 'in_review', 'resolved', 'dismissed');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.intelligence_source_kind as enum (
    'employer_provided', 'public_fact', 'community_reported', 'salarypadi_calculated'
  );
exception when duplicate_object then null;
end;
$$;

create table if not exists private.company_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  claimant_user_id uuid not null references private.profiles(user_id) on delete cascade,
  corporate_domain extensions.citext,
  evidence jsonb not null default '{}'::jsonb,
  status private.company_claim_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  resolution_note text,
  constraint company_claims_evidence_object check (jsonb_typeof(evidence) = 'object'),
  constraint company_claims_evidence_size check (octet_length(evidence::text) <= 32768)
);

create index if not exists company_claims_owner
  on private.company_claims (claimant_user_id, submitted_at desc);
create index if not exists company_claims_queue
  on private.company_claims (status, submitted_at)
  where status in ('pending', 'in_review');

create table if not exists app.company_benefits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  benefit_code text not null,
  label text not null,
  description text,
  source_kind app.intelligence_source_kind not null,
  sample_size integer,
  confidence_label text,
  record_status app.record_status not null default 'draft',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, benefit_code, source_kind),
  constraint company_benefits_code_format check (benefit_code ~ '^[a-z0-9_]+$'),
  constraint company_benefits_sample_nonnegative check (sample_size is null or sample_size >= 0),
  constraint company_benefits_community_threshold check (
    record_status <> 'published'
    or source_kind <> 'community_reported'
    or coalesce(sample_size, 0) >= 5
  )
);

create table if not exists app.currency_rate_sets (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  source_url text not null,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  status app.record_status not null default 'pending',
  constraint currency_rate_sets_source_https check (source_url ~* '^https://')
);

create table if not exists app.currency_rates (
  rate_set_id uuid not null references app.currency_rate_sets(id) on delete cascade,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(24,10) not null,
  primary key (rate_set_id, base_currency, quote_currency),
  constraint currency_rates_base_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint currency_rates_quote_format check (quote_currency ~ '^[A-Z]{3}$'),
  constraint currency_rates_positive check (rate > 0),
  constraint currency_rates_distinct check (base_currency <> quote_currency)
);

create table if not exists app.currency_rounding_rules (
  currency_code text primary key,
  annual_increment numeric(18,2) not null,
  constraint currency_rounding_code_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint currency_rounding_positive check (annual_increment > 0)
);

insert into app.currency_rounding_rules (currency_code, annual_increment)
values
  ('NGN', 5000), ('GHS', 100), ('KES', 1000), ('ZAR', 1000),
  ('USD', 100), ('EUR', 100), ('GBP', 100)
on conflict (currency_code) do update set annual_increment = excluded.annual_increment;

create table if not exists private.contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_user_id uuid not null references private.profiles(user_id) on delete cascade,
  kind private.contribution_kind not null,
  state private.contribution_state not null default 'pending',
  version integer not null default 1,
  content_hash text not null,
  supersedes_contribution_id uuid references private.contributions(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributions_version_positive check (version > 0),
  constraint contributions_hash_format check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint contributions_withdrawn_state check (
    withdrawn_at is null or state = 'removed'
  )
);

create index if not exists contributions_owner
  on private.contributions (contributor_user_id, submitted_at desc);
create index if not exists contributions_queue
  on private.contributions (state, kind, submitted_at)
  where state in ('pending', 'in_review', 'revision_requested', 'escalated');

create table if not exists private.salary_submissions (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  role_title text not null,
  role_family_id uuid references app.role_families(id) on delete set null,
  role_family_name_input text not null,
  company_id uuid references app.companies(id) on delete set null,
  company_name_input text,
  country_code text not null,
  city text,
  work_arrangement app.work_arrangement not null,
  employment_type app.employment_type not null,
  engagement_type app.engagement_type not null,
  seniority app.experience_level not null,
  years_experience numeric(4,1),
  base_salary numeric(18,2) not null,
  currency_code text not null,
  pay_period app.pay_period not null,
  gross_net app.gross_net_classification not null,
  annualized_amount numeric(18,2) not null,
  normalization_version text not null,
  bonus_amount numeric(18,2),
  commission_amount numeric(18,2),
  equity_notes text,
  pension boolean,
  hmo boolean,
  transport_allowance numeric(18,2),
  housing_allowance numeric(18,2),
  lunch_allowance numeric(18,2),
  data_airtime_allowance numeric(18,2),
  power_allowance numeric(18,2),
  thirteenth_month_pay boolean,
  other_benefits text,
  payment_reliability smallint,
  foreign_currency_policy text,
  reported_at date not null default current_date,
  verification_level text not null default 'self_reported',
  constraint salary_role_title_length check (char_length(role_title) between 2 and 200),
  constraint salary_role_family_name_length check (char_length(role_family_name_input) between 2 and 120),
  constraint salary_company_name_length check (
    company_name_input is null or char_length(company_name_input) between 2 and 180
  ),
  constraint salary_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint salary_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint salary_base_positive check (base_salary > 0 and annualized_amount > 0),
  constraint salary_experience_range check (years_experience is null or years_experience between 0 and 80),
  constraint salary_payment_reliability_range check (
    payment_reliability is null or payment_reliability between 1 and 5
  ),
  constraint salary_nonnegative_extras check (
    coalesce(bonus_amount, 0) >= 0 and coalesce(commission_amount, 0) >= 0
    and coalesce(transport_allowance, 0) >= 0 and coalesce(housing_allowance, 0) >= 0
    and coalesce(lunch_allowance, 0) >= 0 and coalesce(data_airtime_allowance, 0) >= 0
    and coalesce(power_allowance, 0) >= 0
  )
);

create index if not exists salary_submissions_cell
  on private.salary_submissions (
    company_id, role_family_id, country_code, currency_code, gross_net, engagement_type
  );

create table if not exists private.company_reviews (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  company_name_input text not null,
  role_family_id uuid references app.role_families(id) on delete set null,
  role_family_name_input text not null,
  country_code text not null,
  employment_status text not null,
  employment_period_label_input text,
  employment_start_year smallint,
  employment_end_year smallint,
  compensation_rating smallint not null,
  pay_reliability_rating smallint not null,
  management_rating smallint not null,
  work_life_rating smallint not null,
  career_growth_rating smallint not null,
  job_security_rating smallint,
  statutory_compliance_rating smallint,
  inclusion_rating smallint,
  workplace_safety_rating smallint,
  overall_rating numeric(2,1) not null,
  pros text,
  cons text,
  advice_to_management text,
  workplace_realities jsonb not null default '{}'::jsonb,
  constraint company_reviews_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint company_reviews_names_length check (
    char_length(company_name_input) between 2 and 180
    and char_length(role_family_name_input) between 2 and 120
  ),
  constraint company_reviews_year_range check (
    (employment_start_year is null or employment_start_year between 1950 and 2200)
    and (employment_end_year is null or employment_end_year between 1950 and 2200)
    and (employment_end_year is null or employment_start_year is null or employment_end_year >= employment_start_year)
  ),
  constraint company_reviews_rating_range check (
    compensation_rating between 1 and 5 and pay_reliability_rating between 1 and 5
    and management_rating between 1 and 5 and work_life_rating between 1 and 5
    and career_growth_rating between 1 and 5 and overall_rating between 1 and 5
    and (job_security_rating is null or job_security_rating between 1 and 5)
    and (statutory_compliance_rating is null or statutory_compliance_rating between 1 and 5)
    and (inclusion_rating is null or inclusion_rating between 1 and 5)
    and (workplace_safety_rating is null or workplace_safety_rating between 1 and 5)
  ),
  constraint company_reviews_text_lengths check (
    char_length(coalesce(pros, '')) <= 5000
    and char_length(coalesce(cons, '')) <= 5000
    and char_length(coalesce(advice_to_management, '')) <= 5000
  ),
  constraint company_reviews_realities_object check (jsonb_typeof(workplace_realities) = 'object')
);

create index if not exists company_reviews_company on private.company_reviews (company_id);

create table if not exists private.interview_experiences (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  company_name_input text not null,
  role_family_id uuid references app.role_families(id) on delete set null,
  role_family_name_input text not null,
  seniority app.experience_level not null,
  country_code text not null,
  application_source text,
  stages jsonb not null,
  assessments text,
  approximate_duration_days integer,
  difficulty smallint not null,
  feedback_received boolean,
  feedback_status text,
  outcome text not null,
  question_themes text,
  general_experience text,
  constraint interviews_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint interviews_names_length check (
    char_length(company_name_input) between 2 and 180
    and char_length(role_family_name_input) between 2 and 120
  ),
  constraint interviews_stages_array check (jsonb_typeof(stages) = 'array'),
  constraint interviews_stages_size check (octet_length(stages::text) <= 16384),
  constraint interviews_duration_range check (
    approximate_duration_days is null or approximate_duration_days between 0 and 730
  ),
  constraint interviews_difficulty_range check (difficulty between 1 and 5),
  constraint interviews_outcome check (outcome in ('offer', 'rejected', 'withdrawn', 'ghosted', 'ongoing')),
  constraint interviews_feedback_status check (
    feedback_status is null or feedback_status in ('yes', 'no', 'partial')
  ),
  constraint interviews_text_lengths check (
    char_length(coalesce(question_themes, '')) <= 5000
    and char_length(coalesce(general_experience, '')) <= 5000
    and char_length(coalesce(assessments, '')) <= 5000
  )
);

create index if not exists interview_experiences_company on private.interview_experiences (company_id);

create table if not exists private.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references private.profiles(user_id) on delete cascade,
  target_kind private.report_target_kind not null,
  target_id text not null,
  category text not null,
  narrative text,
  status private.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references private.profiles(user_id) on delete set null,
  constraint reports_category_length check (char_length(category) between 2 and 80),
  constraint reports_target_length check (char_length(target_id) between 1 and 300),
  constraint reports_narrative_length check (narrative is null or char_length(narrative) <= 5000)
);

create index if not exists reports_owner on private.reports (reporter_user_id, created_at desc);
create index if not exists reports_queue on private.reports (status, created_at) where status in ('pending', 'in_review');

create table if not exists private.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid references private.contributions(id) on delete cascade,
  report_id uuid references private.reports(id) on delete cascade,
  employer_submission_id uuid references private.employer_job_submissions(id) on delete cascade,
  state private.moderation_case_state not null default 'open',
  priority smallint not null default 3,
  assigned_to uuid references private.profiles(user_id) on delete set null,
  version integer not null default 1,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint moderation_cases_one_target check (
    num_nonnulls(contribution_id, report_id, employer_submission_id) = 1
  ),
  constraint moderation_cases_priority_range check (priority between 1 and 5),
  constraint moderation_cases_version_positive check (version > 0),
  constraint moderation_cases_closed_pair check (
    (state = 'closed' and closed_at is not null) or (state <> 'closed' and closed_at is null)
  )
);

create unique index if not exists moderation_case_open_contribution
  on private.moderation_cases (contribution_id)
  where contribution_id is not null and state <> 'closed';
create unique index if not exists moderation_case_open_employer_submission
  on private.moderation_cases (employer_submission_id)
  where employer_submission_id is not null and state <> 'closed';
create index if not exists moderation_cases_queue
  on private.moderation_cases (state, priority, opened_at)
  where state <> 'closed';

create table if not exists private.moderated_payloads (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  payload jsonb not null,
  updated_by uuid not null references private.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint moderated_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint moderated_payload_size check (octet_length(payload::text) <= 65536)
);

create table if not exists private.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references private.moderation_cases(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role private.staff_role not null,
  action private.moderation_action_kind not null,
  reason_code text,
  reason_note text,
  previous_state private.contribution_state,
  new_state private.contribution_state,
  changed_fields text[] not null default '{}'::text[],
  before_hash text,
  after_hash text,
  linked_case_id uuid references private.moderation_cases(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint moderation_actions_reason_length check (
    reason_note is null or char_length(reason_note) <= 2000
  )
);

create index if not exists moderation_actions_case
  on private.moderation_actions (case_id, occurred_at);

create table if not exists private.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references private.moderation_cases(id) on delete cascade,
  kind private.moderation_flag_kind not null,
  source private.flag_source not null,
  confidence numeric(4,3),
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references private.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint moderation_flags_confidence_range check (confidence is null or confidence between 0 and 1),
  constraint moderation_flags_details_object check (jsonb_typeof(details) = 'object'),
  constraint moderation_flags_details_size check (octet_length(details::text) <= 16384)
);

create table if not exists app.review_publications (
  id uuid primary key default gen_random_uuid(),
  source_contribution_id uuid not null unique references private.contributions(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  role_family_id uuid references app.role_families(id) on delete set null,
  country_code text not null,
  employment_status text not null,
  employment_period_label text,
  compensation_rating smallint not null,
  pay_reliability_rating smallint not null,
  management_rating smallint not null,
  work_life_rating smallint not null,
  career_growth_rating smallint not null,
  overall_rating numeric(2,1) not null,
  pros text,
  cons text,
  advice_to_management text,
  publication_status app.record_status not null default 'published',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_publications_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint review_publications_text_lengths check (
    char_length(coalesce(pros, '')) <= 5000
    and char_length(coalesce(cons, '')) <= 5000
    and char_length(coalesce(advice_to_management, '')) <= 5000
  )
);

create index if not exists review_publications_company
  on app.review_publications (company_id, publication_status, published_at desc);

create table if not exists app.interview_publications (
  id uuid primary key default gen_random_uuid(),
  source_contribution_id uuid not null unique references private.contributions(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  role_family_id uuid references app.role_families(id) on delete set null,
  seniority app.experience_level not null,
  country_code text not null,
  application_source text,
  stages jsonb not null,
  approximate_duration_label text,
  difficulty smallint not null,
  feedback_received boolean,
  outcome text not null,
  question_themes text,
  general_experience text,
  publication_status app.record_status not null default 'published',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_publications_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint interview_publications_stages_array check (jsonb_typeof(stages) = 'array'),
  constraint interview_publications_text_lengths check (
    char_length(coalesce(question_themes, '')) <= 5000
    and char_length(coalesce(general_experience, '')) <= 5000
  )
);

create index if not exists interview_publications_company
  on app.interview_publications (company_id, publication_status, published_at desc);

create table if not exists app.privacy_rule_versions (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  version integer not null,
  min_distinct_contributors integer not null,
  min_range_contributors integer not null,
  max_age_months integer not null default 36,
  minimum_publication_lag interval not null default interval '24 hours',
  is_active boolean not null default false,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  methodology_note text not null,
  unique (metric, version),
  constraint privacy_rules_thresholds check (
    min_distinct_contributors >= 3
    and min_range_contributors >= min_distinct_contributors
    and max_age_months between 1 and 120
    and minimum_publication_lag >= interval '0 seconds'
  )
);

create unique index if not exists privacy_rule_one_active_metric
  on app.privacy_rule_versions (metric) where is_active;

insert into app.privacy_rule_versions (
  metric, version, min_distinct_contributors, min_range_contributors,
  max_age_months, minimum_publication_lag, is_active, methodology_note
)
values
  ('salary_employer_role_country', 1, 3, 5, 36, interval '24 hours', true,
   'Distinct-account threshold; sparse dimensions are suppressed and salary values are rounded.'),
  ('company_overall_rating', 1, 5, 5, 36, interval '24 hours', true,
   'Overall ratings require five distinct approved reviewers.'),
  ('interview_aggregate', 1, 3, 5, 36, interval '24 hours', true,
   'Interview aggregates require three distinct approved contributors.')
on conflict (metric, version) do update
set min_distinct_contributors = excluded.min_distinct_contributors,
    min_range_contributors = excluded.min_range_contributors,
    max_age_months = excluded.max_age_months,
    minimum_publication_lag = excluded.minimum_publication_lag,
    methodology_note = excluded.methodology_note;

create table if not exists app.aggregate_runs (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  rule_version_id uuid not null references app.privacy_rule_versions(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  released_cells integer not null default 0,
  suppressed_cells integer not null default 0,
  error_summary text,
  constraint aggregate_runs_status check (status in ('running', 'succeeded', 'failed')),
  constraint aggregate_runs_counts_nonnegative check (released_cells >= 0 and suppressed_cells >= 0)
);

create table if not exists app.salary_aggregate_snapshots (
  id uuid primary key default gen_random_uuid(),
  aggregate_run_id uuid not null references app.aggregate_runs(id) on delete restrict,
  rule_version_id uuid not null references app.privacy_rule_versions(id) on delete restrict,
  company_id uuid references app.companies(id) on delete cascade,
  role_family_id uuid not null references app.role_families(id) on delete cascade,
  country_code text not null,
  currency_code text not null,
  gross_net app.gross_net_classification not null,
  engagement_type app.engagement_type not null,
  sample_size integer not null,
  median_annual numeric(18,2) not null,
  p25_annual numeric(18,2),
  p75_annual numeric(18,2),
  source_month_from date not null,
  source_month_to date not null,
  confidence_label text not null,
  is_released boolean not null default false,
  is_current boolean not null default true,
  computed_at timestamptz not null default now(),
  constraint salary_aggregate_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint salary_aggregate_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint salary_aggregate_sample_min check (sample_size >= 3),
  constraint salary_aggregate_positive check (
    median_annual > 0 and (p25_annual is null or p25_annual > 0)
    and (p75_annual is null or p75_annual >= p25_annual)
  ),
  constraint salary_aggregate_dates check (source_month_to >= source_month_from),
  constraint salary_aggregate_confidence check (confidence_label in ('low', 'medium', 'high'))
);

create unique index if not exists salary_aggregate_current_cell
  on app.salary_aggregate_snapshots (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    role_family_id, country_code, currency_code, gross_net, engagement_type
  ) where is_current;
create index if not exists salary_aggregate_public
  on app.salary_aggregate_snapshots (is_current, is_released, country_code, role_family_id);

create table if not exists app.company_rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  aggregate_run_id uuid not null references app.aggregate_runs(id) on delete restrict,
  rule_version_id uuid not null references app.privacy_rule_versions(id) on delete restrict,
  company_id uuid not null references app.companies(id) on delete cascade,
  sample_size integer not null,
  overall_rating numeric(3,2) not null,
  confidence_label text not null,
  is_released boolean not null default false,
  is_current boolean not null default true,
  computed_at timestamptz not null default now(),
  constraint company_rating_sample_min check (sample_size >= 3),
  constraint company_rating_range check (overall_rating between 1 and 5),
  constraint company_rating_confidence check (confidence_label in ('low', 'medium', 'high'))
);

create unique index if not exists company_rating_current
  on app.company_rating_snapshots (company_id) where is_current;

create table if not exists private.aggregate_refresh_queue (
  id bigint generated always as identity primary key,
  metric text not null,
  target_id uuid,
  reason text not null,
  queued_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists aggregate_refresh_pending
  on private.aggregate_refresh_queue (metric, queued_at) where processed_at is null;

-- The generic admin UI uses one optimistic-concurrency contract across several
-- independently owned tables. Keep this counter separate from domain versions
-- such as moderation case versions and privacy-rule methodology versions.
alter table app.jobs
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table ingest.import_runs
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table app.job_sources
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table app.job_sources
  add column if not exists review_requested_at timestamptz;
alter table app.companies
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table app.companies
  add column if not exists evidence_requested_at timestamptz;
alter table private.reports
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table private.profiles
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table app.privacy_rule_versions
  add column if not exists admin_version integer not null default 1
  check (admin_version > 0);
alter table app.privacy_rule_versions
  add column if not exists review_requested_at timestamptz;

create or replace function security.bump_admin_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.admin_version := old.admin_version + 1;
  return new;
end;
$$;

drop trigger if exists jobs_bump_admin_version on app.jobs;
create trigger jobs_bump_admin_version
before update on app.jobs
for each row execute function security.bump_admin_version();

drop trigger if exists import_runs_bump_admin_version on ingest.import_runs;
create trigger import_runs_bump_admin_version
before update on ingest.import_runs
for each row execute function security.bump_admin_version();

drop trigger if exists job_sources_bump_admin_version on app.job_sources;
create trigger job_sources_bump_admin_version
before update on app.job_sources
for each row execute function security.bump_admin_version();

drop trigger if exists companies_bump_admin_version on app.companies;
create trigger companies_bump_admin_version
before update on app.companies
for each row execute function security.bump_admin_version();

drop trigger if exists reports_bump_admin_version on private.reports;
create trigger reports_bump_admin_version
before update on private.reports
for each row execute function security.bump_admin_version();

drop trigger if exists profiles_bump_admin_version on private.profiles;
create trigger profiles_bump_admin_version
before update on private.profiles
for each row execute function security.bump_admin_version();

drop trigger if exists privacy_rules_bump_admin_version on app.privacy_rule_versions;
create trigger privacy_rules_bump_admin_version
before update on app.privacy_rule_versions
for each row execute function security.bump_admin_version();

drop trigger if exists company_benefits_set_updated_at on app.company_benefits;
create trigger company_benefits_set_updated_at
before update on app.company_benefits
for each row execute function security.set_updated_at();

drop trigger if exists contributions_set_updated_at on private.contributions;
create trigger contributions_set_updated_at
before update on private.contributions
for each row execute function security.set_updated_at();

drop trigger if exists review_publications_set_updated_at on app.review_publications;
create trigger review_publications_set_updated_at
before update on app.review_publications
for each row execute function security.set_updated_at();

drop trigger if exists interview_publications_set_updated_at on app.interview_publications;
create trigger interview_publications_set_updated_at
before update on app.interview_publications
for each row execute function security.set_updated_at();

drop trigger if exists moderation_actions_append_only on private.moderation_actions;
create trigger moderation_actions_append_only
before update or delete on private.moderation_actions
for each row execute function security.reject_mutation();

create or replace function security.queue_employer_submission_for_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.moderation_cases (employer_submission_id)
  values (new.id)
  on conflict (employer_submission_id) where employer_submission_id is not null and state <> 'closed'
  do nothing;
  return new;
end;
$$;

drop trigger if exists employer_submission_moderation_queue on private.employer_job_submissions;
create trigger employer_submission_moderation_queue
after insert on private.employer_job_submissions
for each row execute function security.queue_employer_submission_for_moderation();

insert into private.moderation_cases (employer_submission_id)
select s.id
from private.employer_job_submissions s
where s.status in ('pending', 'in_review', 'revision_requested')
  and not exists (
    select 1 from private.moderation_cases c
    where c.employer_submission_id = s.id and c.state <> 'closed'
  );

create or replace function security.annualize_salary(
  p_amount numeric,
  p_period app.pay_period
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select case p_period
    when 'annual' then p_amount
    when 'monthly' then p_amount * 12
    when 'weekly' then p_amount * 52
    when 'daily' then p_amount * 260
    when 'hourly' then p_amount * 2080
  end
$$;

create or replace function security.find_company_by_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.id
  from (
    select c.id, 1 as priority
    from app.companies c
    where lower(c.display_name) = lower(btrim(p_name))
      and c.record_status <> 'removed'
    union all
    select a.company_id, 2
    from app.company_aliases a
    where lower(a.normalized_alias::text) = lower(btrim(p_name))
  ) candidate
  order by candidate.priority
  limit 1
$$;

create or replace function security.find_role_family_by_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from app.role_families r
  where lower(r.name) = lower(btrim(p_name))
     or lower(r.slug) = lower(regexp_replace(btrim(p_name), '\s+', '-', 'g'))
  order by r.is_active desc
  limit 1
$$;

create or replace function security.create_contribution_case(
  p_contribution_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_case_id uuid;
begin
  insert into private.moderation_cases (contribution_id)
  values (p_contribution_id)
  returning id into v_case_id;
  return v_case_id;
end;
$$;

create or replace function security.submit_salary(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_amount numeric;
  v_period app.pay_period;
  v_company_id uuid;
  v_role_family_id uuid;
  v_role_title text;
  v_role_family_name text;
  v_company_name text;
  v_country text;
  v_currency text;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid salary payload';
  end if;
  if coalesce(p_payload ->> 'accuracy_attestation', '') <> 'on' then
    raise exception using errcode = '22023', message = 'salary accuracy must be attested';
  end if;
  v_amount := (p_payload ->> 'base_salary')::numeric;
  v_period := (p_payload ->> 'pay_period')::app.pay_period;
  v_role_title := coalesce(p_payload ->> 'role_title', p_payload ->> 'role');
  v_role_family_name := coalesce(p_payload ->> 'role_family_name', p_payload ->> 'role_family');
  v_company_name := coalesce(p_payload ->> 'company_name', p_payload ->> 'company');
  v_country := upper(coalesce(p_payload ->> 'country_code', p_payload ->> 'country'));
  v_currency := upper(coalesce(p_payload ->> 'currency_code', p_payload ->> 'currency'));
  if v_amount <= 0
     or coalesce(v_currency, '') !~ '^[A-Z]{3}$'
     or coalesce(v_country, '') !~ '^[A-Z]{2}$'
     or char_length(coalesce(v_role_title, '')) not between 2 and 200
     or char_length(coalesce(v_role_family_name, '')) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid salary fields';
  end if;
  v_company_id := case
    when nullif(p_payload ->> 'company_id', '') is not null
      then (p_payload ->> 'company_id')::uuid
    when nullif(v_company_name, '') is not null
      then security.find_company_by_name(v_company_name)
    else null
  end;
  v_role_family_id := case
    when nullif(p_payload ->> 'role_family_id', '') is not null
      then (p_payload ->> 'role_family_id')::uuid
    else security.find_role_family_by_name(v_role_family_name)
  end;
  perform security.consume_rate_limit('salary_submit', 5, interval '7 days');

  insert into private.contributions (
    id, contributor_user_id, kind, state, content_hash
  ) values (
    v_id, (select auth.uid()), 'salary', 'pending',
    encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
  );

  insert into private.salary_submissions (
    contribution_id, role_title, role_family_id, role_family_name_input,
    company_id, company_name_input,
    country_code, city, work_arrangement, employment_type, engagement_type,
    seniority, years_experience, base_salary, currency_code, pay_period,
    gross_net, annualized_amount, normalization_version, bonus_amount,
    commission_amount, equity_notes, pension, hmo, transport_allowance,
    housing_allowance, lunch_allowance, data_airtime_allowance, power_allowance,
    thirteenth_month_pay, other_benefits, payment_reliability,
    foreign_currency_policy, reported_at, verification_level
  ) values (
    v_id, v_role_title, v_role_family_id, v_role_family_name,
    v_company_id, nullif(v_company_name, ''), v_country,
    nullif(p_payload ->> 'city', ''),
    coalesce(p_payload ->> 'work_arrangement', p_payload ->> 'work_mode')::app.work_arrangement,
    (p_payload ->> 'employment_type')::app.employment_type,
    coalesce(p_payload ->> 'engagement_type', p_payload ->> 'arrangement')::app.engagement_type,
    (p_payload ->> 'seniority')::app.experience_level,
    nullif(p_payload ->> 'years_experience', '')::numeric,
    v_amount, v_currency, v_period,
    (p_payload ->> 'gross_net')::app.gross_net_classification,
    security.annualize_salary(v_amount, v_period), 'period-v1-2080h-260d-52w',
    coalesce(nullif(p_payload ->> 'bonus_amount', '')::numeric, nullif(p_payload ->> 'bonus', '')::numeric),
    coalesce(nullif(p_payload ->> 'commission_amount', '')::numeric, nullif(p_payload ->> 'commission', '')::numeric),
    coalesce(nullif(p_payload ->> 'equity_notes', ''), nullif(p_payload ->> 'equity', '')),
    coalesce(nullif(p_payload ->> 'pension', '')::numeric, 0) > 0,
    coalesce(nullif(p_payload ->> 'hmo', '')::numeric, nullif(p_payload ->> 'health_cover', '')::numeric, 0) > 0,
    coalesce(nullif(p_payload ->> 'transport_allowance', '')::numeric, nullif(p_payload ->> 'transport', '')::numeric),
    coalesce(nullif(p_payload ->> 'housing_allowance', '')::numeric, nullif(p_payload ->> 'housing', '')::numeric),
    coalesce(nullif(p_payload ->> 'lunch_allowance', '')::numeric, nullif(p_payload ->> 'lunch', '')::numeric),
    coalesce(nullif(p_payload ->> 'data_airtime_allowance', '')::numeric, nullif(p_payload ->> 'data_airtime', '')::numeric),
    nullif(p_payload ->> 'power_allowance', '')::numeric,
    coalesce(nullif(p_payload ->> 'thirteenth_month_pay', '')::boolean,
      coalesce(nullif(p_payload ->> 'thirteenth_month', '')::numeric, 0) > 0),
    nullif(p_payload ->> 'other_benefits', ''),
    case p_payload ->> 'payment_reliability'
      when 'always_on_time' then 5 when 'usually_on_time' then 4
      when 'sometimes_late' then 3 when 'often_late' then 2
      when 'prefer_not_to_say' then null
      else nullif(p_payload ->> 'payment_reliability', '')::smallint end,
    nullif(p_payload ->> 'foreign_currency_policy', ''),
    coalesce(nullif(p_payload ->> 'reported_at', '')::date, current_date),
    coalesce(nullif(p_payload ->> 'verification_level', ''), 'self_reported')
  );

  perform security.create_contribution_case(v_id);
  perform audit.write_event(
    'user', 'contribution.submitted', 'contribution', v_id, 'salary',
    null, jsonb_build_object('kind', 'salary', 'state', 'pending'), array['state']
  );
  return v_id;
end;
$$;

create or replace function security.submit_review(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_company_id uuid;
  v_company_name text;
  v_role_family_id uuid;
  v_role_family_name text;
  v_country text;
  v_growth smallint;
  v_overall numeric;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid review payload';
  end if;
  if coalesce(p_payload ->> 'anonymity_attestation', '') <> 'on' then
    raise exception using errcode = '22023', message = 'review anonymity rules must be attested';
  end if;
  v_company_name := coalesce(p_payload ->> 'company_name', p_payload ->> 'company');
  v_role_family_name := coalesce(p_payload ->> 'role_family_name', p_payload ->> 'role_family');
  if char_length(coalesce(v_company_name, '')) not between 2 and 180
     or char_length(coalesce(v_role_family_name, '')) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'company and role family are required';
  end if;
  v_company_id := case
    when nullif(p_payload ->> 'company_id', '') is not null
      then (p_payload ->> 'company_id')::uuid
    else security.find_company_by_name(v_company_name)
  end;
  v_role_family_id := case
    when nullif(p_payload ->> 'role_family_id', '') is not null
      then (p_payload ->> 'role_family_id')::uuid
    else security.find_role_family_by_name(v_role_family_name)
  end;
  select coalesce(
    upper(nullif(p_payload ->> 'country_code', '')),
    p.country_code,
    'NG'
  ) into v_country
  from private.profiles p where p.user_id = (select auth.uid());
  v_growth := coalesce(
    nullif(p_payload ->> 'career_growth_rating', '')::smallint,
    (p_payload ->> 'growth_rating')::smallint
  );
  v_overall := coalesce(
    nullif(p_payload ->> 'overall_rating', '')::numeric,
    round((
      (p_payload ->> 'compensation_rating')::numeric
      + (p_payload ->> 'pay_reliability_rating')::numeric
      + (p_payload ->> 'management_rating')::numeric
      + (p_payload ->> 'work_life_rating')::numeric
      + v_growth::numeric
    ) / 5.0, 1)
  );
  perform pg_advisory_xact_lock(hashtextextended(
    (select auth.uid())::text || ':company-review:' ||
    coalesce(v_company_id::text, lower(btrim(v_company_name))),
    0
  ));
  if exists (
    select 1
    from private.contributions c
    join private.company_reviews r on r.contribution_id = c.id
    where c.contributor_user_id = (select auth.uid())
      and (
        (v_company_id is not null and r.company_id = v_company_id)
        or (v_company_id is null and lower(r.company_name_input) = lower(v_company_name))
      )
      and c.state not in ('rejected', 'merged', 'removed')
  ) then
    raise exception using errcode = '23505', message = 'an active review already exists for this company';
  end if;
  perform security.consume_rate_limit('review_submit', 3, interval '30 days');

  insert into private.contributions (id, contributor_user_id, kind, state, content_hash)
  values (
    v_id, (select auth.uid()), 'review', 'pending',
    encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
  );

  insert into private.company_reviews (
    contribution_id, company_id, company_name_input, role_family_id,
    role_family_name_input, country_code, employment_status,
    employment_period_label_input, employment_start_year, employment_end_year, compensation_rating,
    pay_reliability_rating, management_rating, work_life_rating,
    career_growth_rating, job_security_rating, statutory_compliance_rating,
    inclusion_rating, workplace_safety_rating, overall_rating,
    pros, cons, advice_to_management, workplace_realities
  ) values (
    v_id, v_company_id, v_company_name, v_role_family_id, v_role_family_name,
    v_country, p_payload ->> 'employment_status',
    nullif(p_payload ->> 'employment_period', ''),
    nullif(p_payload ->> 'employment_start_year', '')::smallint,
    nullif(p_payload ->> 'employment_end_year', '')::smallint,
    (p_payload ->> 'compensation_rating')::smallint,
    (p_payload ->> 'pay_reliability_rating')::smallint,
    (p_payload ->> 'management_rating')::smallint,
    (p_payload ->> 'work_life_rating')::smallint,
    v_growth,
    nullif(p_payload ->> 'job_security_rating', '')::smallint,
    coalesce(
      nullif(p_payload ->> 'statutory_compliance_rating', '')::smallint,
      case p_payload ->> 'pension_compliance'
        when 'yes' then 5 when 'no' then 1 else null end
    ),
    nullif(p_payload ->> 'inclusion_rating', '')::smallint,
    coalesce(
      nullif(p_payload ->> 'workplace_safety_rating', '')::smallint,
      nullif(p_payload ->> 'safety_rating', '')::smallint
    ),
    v_overall,
    nullif(p_payload ->> 'pros', ''), nullif(p_payload ->> 'cons', ''),
    coalesce(nullif(p_payload ->> 'advice_to_management', ''), nullif(p_payload ->> 'advice', '')),
    coalesce(p_payload -> 'workplace_realities', jsonb_build_object(
      'pension_compliance', p_payload ->> 'pension_compliance',
      'health_cover', p_payload ->> 'health_cover',
      'leave_quality', p_payload ->> 'leave_quality',
      'overtime_expectation', p_payload ->> 'overtime_expectation',
      'weekend_work', p_payload ->> 'weekend_work',
      'remote_reality', p_payload ->> 'remote_reality',
      'support_provided', p_payload ->> 'support_provided'
    ))
  );

  perform security.create_contribution_case(v_id);
  perform audit.write_event(
    'user', 'contribution.submitted', 'contribution', v_id, 'review',
    null, jsonb_build_object('kind', 'review', 'state', 'pending'), array['state']
  );
  return v_id;
end;
$$;

create or replace function security.submit_interview(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_company_name text;
  v_company_id uuid;
  v_role_family_name text;
  v_role_family_id uuid;
  v_feedback_status text;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid interview payload';
  end if;
  if coalesce(p_payload ->> 'confidentiality_attestation', '') <> 'on' then
    raise exception using errcode = '22023', message = 'interview confidentiality rules must be attested';
  end if;
  v_company_name := coalesce(p_payload ->> 'company_name', p_payload ->> 'company');
  v_role_family_name := coalesce(p_payload ->> 'role_family_name', p_payload ->> 'role_family');
  if char_length(coalesce(v_company_name, '')) not between 2 and 180
     or char_length(coalesce(v_role_family_name, '')) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'company and role family are required';
  end if;
  v_company_id := case
    when nullif(p_payload ->> 'company_id', '') is not null
      then (p_payload ->> 'company_id')::uuid
    else security.find_company_by_name(v_company_name)
  end;
  v_role_family_id := case
    when nullif(p_payload ->> 'role_family_id', '') is not null
      then (p_payload ->> 'role_family_id')::uuid
    else security.find_role_family_by_name(v_role_family_name)
  end;
  v_feedback_status := coalesce(nullif(p_payload ->> 'feedback_status', ''), p_payload ->> 'feedback_received');
  perform security.consume_rate_limit('interview_submit', 5, interval '30 days');
  insert into private.contributions (id, contributor_user_id, kind, state, content_hash)
  values (
    v_id, (select auth.uid()), 'interview', 'pending',
    encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
  );
  insert into private.interview_experiences (
    contribution_id, company_id, company_name_input, role_family_id,
    role_family_name_input, seniority, country_code,
    application_source, stages, assessments, approximate_duration_days,
    difficulty, feedback_received, feedback_status, outcome,
    question_themes, general_experience
  ) values (
    v_id, v_company_id, v_company_name, v_role_family_id, v_role_family_name,
    (p_payload ->> 'seniority')::app.experience_level,
    upper(coalesce(p_payload ->> 'country_code', p_payload ->> 'country')),
    nullif(p_payload ->> 'application_source', ''),
    case when jsonb_typeof(p_payload -> 'stages') = 'array'
      then p_payload -> 'stages'
      else jsonb_build_array(p_payload ->> 'stages') end,
    coalesce(nullif(p_payload ->> 'assessments', ''), nullif(p_payload ->> 'assessment', '')),
    coalesce(
      nullif(p_payload ->> 'approximate_duration_days', '')::integer,
      case p_payload ->> 'duration'
        when 'under_1_week' then 5 when '1_to_2_weeks' then 10
        when '2_to_4_weeks' then 21 when '1_to_2_months' then 45
        when 'over_2_months' then 75 else null end
    ),
    (p_payload ->> 'difficulty')::smallint,
    case v_feedback_status when 'yes' then true when 'no' then false else null end,
    v_feedback_status,
    case p_payload ->> 'outcome' when 'in_progress' then 'ongoing' else p_payload ->> 'outcome' end,
    nullif(p_payload ->> 'question_themes', ''),
    nullif(p_payload ->> 'general_experience', '')
  );
  perform security.create_contribution_case(v_id);
  perform audit.write_event(
    'user', 'contribution.submitted', 'contribution', v_id, 'interview',
    null, jsonb_build_object('kind', 'interview', 'state', 'pending'), array['state']
  );
  return v_id;
end;
$$;

create or replace function security.submit_report(
  p_target_kind private.report_target_kind,
  p_target_id text,
  p_category text,
  p_narrative text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_case_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(p_category) not between 2 and 80
     or char_length(coalesce(p_narrative, '')) > 5000 then
    raise exception using errcode = '22023', message = 'invalid report';
  end if;
  perform security.consume_rate_limit('content_report', 10, interval '1 day');
  insert into private.reports (reporter_user_id, target_kind, target_id, category, narrative)
  values ((select auth.uid()), p_target_kind, p_target_id, p_category, p_narrative)
  returning id into v_id;
  insert into private.moderation_cases (report_id) values (v_id) returning id into v_case_id;
  perform audit.write_event(
    'user', 'content.reported', p_target_kind::text,
    case
      when p_target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then p_target_id::uuid
      else null
    end,
    p_category, null, jsonb_build_object('report_id', v_id, 'status', 'pending'),
    array['status'], null, null, jsonb_build_object('reported_id', p_target_id)
  );
  return v_id;
end;
$$;

create or replace function security.normalize_contribution(
  p_contribution_id uuid,
  p_company_id uuid,
  p_role_family_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_contribution private.contributions%rowtype;
begin
  if not ((select security.can_manage_jobs()) or (select security.can_moderate())) then
    raise exception using errcode = '42501', message = 'staff role and AAL2 required';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'normalization reason required';
  end if;
  if p_company_id is not null
     and not exists (select 1 from app.companies where id = p_company_id) then
    raise exception using errcode = '22023', message = 'company does not exist';
  end if;
  if p_role_family_id is not null
     and not exists (select 1 from app.role_families where id = p_role_family_id) then
    raise exception using errcode = '22023', message = 'role family does not exist';
  end if;
  select * into v_contribution from private.contributions
  where id = p_contribution_id for update;
  if not found or v_contribution.state not in ('pending', 'in_review', 'revision_requested', 'escalated') then
    raise exception using errcode = '23514', message = 'contribution cannot be normalized in its current state';
  end if;

  if v_contribution.kind = 'salary' then
    update private.salary_submissions
    set company_id = coalesce(p_company_id, company_id),
        role_family_id = coalesce(p_role_family_id, role_family_id)
    where contribution_id = p_contribution_id;
    if not exists (
      select 1 from private.salary_submissions
      where contribution_id = p_contribution_id and role_family_id is not null
    ) then
      raise exception using errcode = '23514', message = 'salary role family is required';
    end if;
  elsif v_contribution.kind = 'review' then
    if p_company_id is null and not exists (
      select 1 from private.company_reviews
      where contribution_id = p_contribution_id and company_id is not null
    ) then
      raise exception using errcode = '23514', message = 'review company is required';
    end if;
    update private.company_reviews
    set company_id = coalesce(p_company_id, company_id),
        role_family_id = coalesce(p_role_family_id, role_family_id)
    where contribution_id = p_contribution_id;
  else
    if p_company_id is null and not exists (
      select 1 from private.interview_experiences
      where contribution_id = p_contribution_id and company_id is not null
    ) then
      raise exception using errcode = '23514', message = 'interview company is required';
    end if;
    update private.interview_experiences
    set company_id = coalesce(p_company_id, company_id),
        role_family_id = coalesce(p_role_family_id, role_family_id)
    where contribution_id = p_contribution_id;
  end if;

  update private.contributions set version = version + 1
  where id = p_contribution_id;
  update private.moderation_cases set version = version + 1
  where contribution_id = p_contribution_id and state <> 'closed';
  perform audit.write_event(
    'staff', 'contribution.normalized', 'contribution', p_contribution_id,
    'data_normalization', null,
    jsonb_build_object('company_id', p_company_id, 'role_family_id', p_role_family_id),
    array['company_id', 'role_family_id'], null, null,
    jsonb_build_object('reason', btrim(p_reason))
  );
  return true;
end;
$$;

create or replace function security.transition_moderation(
  p_case_id uuid,
  p_expected_version integer,
  p_action private.moderation_action_kind,
  p_reason_code text,
  p_reason_note text default null,
  p_changed_fields text[] default '{}'::text[],
  p_public_payload jsonb default '{}'::jsonb,
  p_linked_case_id uuid default null
)
returns private.contribution_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.moderation_cases%rowtype;
  v_contribution private.contributions%rowtype;
  v_new_state private.contribution_state;
  v_actor_role private.staff_role;
  v_payload jsonb := coalesce(p_public_payload, '{}'::jsonb);
  v_payload_hash text;
  v_review private.company_reviews%rowtype;
  v_interview private.interview_experiences%rowtype;
begin
  if not (select security.can_moderate()) then
    raise exception using errcode = '42501', message = 'moderator role and AAL2 required';
  end if;
  select r.role into v_actor_role
  from private.user_roles r
  where r.user_id = (select auth.uid()) and r.revoked_at is null
    and r.role in ('moderator', 'admin')
  order by case r.role when 'admin' then 1 else 2 end
  limit 1;

  select * into v_case from private.moderation_cases
  where id = p_case_id for update;
  if not found or v_case.contribution_id is null then
    raise exception using errcode = 'P0002', message = 'moderation case not found';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale moderation case version';
  end if;
  select * into v_contribution from private.contributions
  where id = v_case.contribution_id for update;

  if p_action <> 'claim' and char_length(btrim(coalesce(p_reason_code, ''))) < 2 then
    raise exception using errcode = '22023', message = 'reason code required';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid moderated payload';
  end if;

  v_new_state := case
    when p_action = 'claim' and v_contribution.state = 'pending' then 'in_review'
    when p_action = 'redact' and v_contribution.state = 'in_review' then 'in_review'
    when p_action = 'approve' and v_contribution.state in ('in_review', 'escalated') then 'approved'
    when p_action = 'reject' and v_contribution.state in ('pending', 'in_review', 'escalated') then 'rejected'
    when p_action = 'request_revision' and v_contribution.state = 'in_review' then 'revision_requested'
    when p_action = 'escalate' and v_contribution.state = 'in_review' then 'escalated'
    when p_action = 'merge_duplicate' and v_contribution.state in ('pending', 'in_review') then 'merged'
    when p_action = 'remove' and v_contribution.state = 'approved' then 'removed'
    when p_action = 'restore' and v_contribution.state = 'removed' then 'approved'
    else null
  end;
  if v_new_state is null then
    raise exception using errcode = '23514', message = 'invalid moderation transition';
  end if;
  if (p_action = 'restore' or (v_contribution.state = 'escalated' and p_action in ('approve', 'reject')))
     and v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin role required for this transition';
  end if;
  if p_action = 'merge_duplicate' then
    if p_linked_case_id is null or p_linked_case_id = p_case_id
       or not exists (
         select 1 from private.moderation_cases mc
         join private.contributions c on c.id = mc.contribution_id
         where mc.id = p_linked_case_id and c.kind = v_contribution.kind
       ) then
      raise exception using errcode = '22023', message = 'compatible duplicate case required';
    end if;
  end if;

  if p_action in ('redact', 'approve') and v_contribution.kind in ('review', 'interview') then
    v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
    insert into private.moderated_payloads (contribution_id, payload, updated_by)
    values (v_contribution.id, v_payload, (select auth.uid()))
    on conflict (contribution_id) do update
    set payload = excluded.payload, updated_by = excluded.updated_by, updated_at = clock_timestamp();
  end if;

  if p_action = 'approve' and v_contribution.kind = 'salary' then
    if not exists (
      select 1 from private.salary_submissions s
      where s.contribution_id = v_contribution.id
        and s.role_family_id is not null and s.annualized_amount > 0
    ) then
      raise exception using errcode = '23514', message = 'salary normalization is incomplete';
    end if;
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values ('salary_employer_role_country', v_contribution.id, 'salary approved');
  elsif p_action = 'approve' and v_contribution.kind = 'review' then
    select * into v_review from private.company_reviews
    where contribution_id = v_contribution.id;
    if v_review.company_id is null then
      raise exception using errcode = '23514', message = 'company normalization is incomplete';
    end if;
    insert into app.review_publications (
      source_contribution_id, company_id, role_family_id, country_code,
      employment_status, employment_period_label, compensation_rating,
      pay_reliability_rating, management_rating, work_life_rating,
      career_growth_rating, overall_rating, pros, cons, advice_to_management,
      publication_status
    ) values (
      v_contribution.id, v_review.company_id, v_review.role_family_id,
      v_review.country_code, v_review.employment_status,
      coalesce(v_review.employment_period_label_input, case
        when v_review.employment_start_year is null then null
        when v_review.employment_end_year is null then v_review.employment_start_year::text || '–present'
        else v_review.employment_start_year::text || '–' || v_review.employment_end_year::text
      end),
      v_review.compensation_rating, v_review.pay_reliability_rating,
      v_review.management_rating, v_review.work_life_rating,
      v_review.career_growth_rating, v_review.overall_rating,
      nullif(v_payload ->> 'pros', ''), nullif(v_payload ->> 'cons', ''),
      nullif(v_payload ->> 'advice_to_management', ''), 'published'
    )
    on conflict (source_contribution_id) do update
    set pros = excluded.pros, cons = excluded.cons,
        advice_to_management = excluded.advice_to_management,
        publication_status = 'published', updated_at = clock_timestamp();
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values ('company_overall_rating', v_review.company_id, 'review approved');
  elsif p_action = 'approve' and v_contribution.kind = 'interview' then
    select * into v_interview from private.interview_experiences
    where contribution_id = v_contribution.id;
    if v_interview.company_id is null then
      raise exception using errcode = '23514', message = 'company normalization is incomplete';
    end if;
    insert into app.interview_publications (
      source_contribution_id, company_id, role_family_id, seniority,
      country_code, application_source, stages, approximate_duration_label,
      difficulty, feedback_received, outcome, question_themes,
      general_experience, publication_status
    ) values (
      v_contribution.id, v_interview.company_id, v_interview.role_family_id,
      v_interview.seniority, v_interview.country_code,
      v_interview.application_source, v_interview.stages,
      case
        when v_interview.approximate_duration_days is null then null
        when v_interview.approximate_duration_days <= 7 then 'about a week'
        when v_interview.approximate_duration_days <= 30 then 'about a month'
        else 'more than a month'
      end,
      v_interview.difficulty, v_interview.feedback_received, v_interview.outcome,
      nullif(v_payload ->> 'question_themes', ''),
      nullif(v_payload ->> 'general_experience', ''), 'published'
    )
    on conflict (source_contribution_id) do update
    set question_themes = excluded.question_themes,
        general_experience = excluded.general_experience,
        publication_status = 'published', updated_at = clock_timestamp();
  elsif p_action = 'remove' then
    update app.review_publications set publication_status = 'removed'
    where source_contribution_id = v_contribution.id;
    update app.interview_publications set publication_status = 'removed'
    where source_contribution_id = v_contribution.id;
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values (
      case when v_contribution.kind = 'review' then 'company_overall_rating'
           when v_contribution.kind = 'salary' then 'salary_employer_role_country'
           else 'interview_aggregate' end,
      v_contribution.id, 'contribution removed'
    );
  elsif p_action = 'restore' then
    update app.review_publications set publication_status = 'published'
    where source_contribution_id = v_contribution.id;
    update app.interview_publications set publication_status = 'published'
    where source_contribution_id = v_contribution.id;
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values (
      case when v_contribution.kind = 'review' then 'company_overall_rating'
           when v_contribution.kind = 'salary' then 'salary_employer_role_country'
           else 'interview_aggregate' end,
      v_contribution.id, 'contribution restored'
    );
  end if;

  update private.contributions
  set state = v_new_state,
      version = version + 1,
      decided_at = case when v_new_state in ('approved', 'rejected', 'merged') then clock_timestamp() else decided_at end
  where id = v_contribution.id;

  update private.moderation_cases
  set state = case
        when v_new_state = 'in_review' then 'in_review'::private.moderation_case_state
        when v_new_state = 'escalated' then 'escalated'::private.moderation_case_state
        when v_new_state in ('approved', 'rejected', 'merged', 'removed') then 'closed'::private.moderation_case_state
        else 'open'::private.moderation_case_state
      end,
      assigned_to = case when p_action = 'claim' then (select auth.uid()) else assigned_to end,
      version = version + 1,
      closed_at = case when v_new_state in ('approved', 'rejected', 'merged', 'removed') then clock_timestamp() else null end
  where id = p_case_id;

  insert into private.moderation_actions (
    case_id, actor_user_id, actor_role, action, reason_code, reason_note,
    previous_state, new_state, changed_fields, before_hash, after_hash, linked_case_id
  ) values (
    p_case_id, (select auth.uid()), v_actor_role, p_action, p_reason_code,
    p_reason_note, v_contribution.state, v_new_state,
    coalesce(p_changed_fields, '{}'::text[]), v_contribution.content_hash,
    coalesce(v_payload_hash, v_contribution.content_hash), p_linked_case_id
  );

  perform audit.write_event(
    'staff', 'moderation.' || p_action::text, 'contribution', v_contribution.id,
    p_reason_code, jsonb_build_object('state', v_contribution.state),
    jsonb_build_object('state', v_new_state), coalesce(p_changed_fields, '{}'::text[]),
    v_contribution.content_hash, coalesce(v_payload_hash, v_contribution.content_hash),
    jsonb_build_object('case_id', p_case_id)
  );
  return v_new_state;
end;
$$;

create or replace function security.withdraw_contribution(p_contribution_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_kind private.contribution_kind; v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  select kind into v_kind from private.contributions
  where id = p_contribution_id and contributor_user_id = (select auth.uid())
  for update;
  if not found then return false; end if;
  update private.contributions
  set state = 'removed', withdrawn_at = clock_timestamp(), version = version + 1
  where id = p_contribution_id and state not in ('removed', 'merged');
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    update app.review_publications set publication_status = 'removed'
    where source_contribution_id = p_contribution_id;
    update app.interview_publications set publication_status = 'removed'
    where source_contribution_id = p_contribution_id;
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values (
      case when v_kind = 'salary' then 'salary_employer_role_country'
           when v_kind = 'review' then 'company_overall_rating'
           else 'interview_aggregate' end,
      p_contribution_id, 'contributor withdrawal'
    );
    perform audit.write_event(
      'user', 'contribution.withdrawn', 'contribution', p_contribution_id,
      'owner_withdrawal', null, jsonb_build_object('state', 'removed'), array['state']
    );
  end if;
  return v_changed > 0;
end;
$$;

create or replace function security.refresh_salary_aggregates()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule app.privacy_rule_versions%rowtype;
  v_run_id uuid;
  v_released integer;
  v_suppressed integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not ((select security.can_manage_jobs()) and (select security.has_staff_role('admin'))) then
    raise exception using errcode = '42501', message = 'trusted aggregate worker required';
  end if;
  select * into strict v_rule from app.privacy_rule_versions
  where metric = 'salary_employer_role_country' and is_active;
  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_rule.metric, v_rule.id) returning id into v_run_id;
  update app.salary_aggregate_snapshots set is_current = false where is_current;

  with ranked as (
    select
      c.contributor_user_id, c.submitted_at as contribution_submitted_at, s.*,
      row_number() over (
        partition by c.contributor_user_id, s.company_id, s.role_family_id,
          s.country_code, s.currency_code, s.gross_net, s.engagement_type
        order by c.submitted_at desc, c.id desc
      ) as rn
    from private.contributions c
    join private.salary_submissions s on s.contribution_id = c.id
    where c.state = 'approved'
      and c.withdrawn_at is null
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_rule.minimum_publication_lag
      and s.reported_at >= current_date - make_interval(months => v_rule.max_age_months)
      and s.role_family_id is not null
      and s.annualized_amount > 0
  ), base as (
    select * from ranked where rn = 1
  ), company_cells as (
    select company_id, role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at
    from base where company_id is not null
  ), broader_ranked as (
    select role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at,
      row_number() over (
        partition by contributor_user_id, role_family_id, country_code,
          currency_code, gross_net, engagement_type
        order by contribution_submitted_at desc, contribution_id desc
      ) as broader_rn
    from base
  ), cells as (
    select * from company_cells
    union all
    select null::uuid, role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at
    from broader_ranked where broader_rn = 1
  ), grouped as (
    select
      company_id, role_family_id, country_code, currency_code, gross_net,
      engagement_type, count(distinct contributor_user_id)::integer as sample_size,
      percentile_cont(0.5) within group (order by annualized_amount)::numeric as median_value,
      percentile_cont(0.25) within group (order by annualized_amount)::numeric as p25_value,
      percentile_cont(0.75) within group (order by annualized_amount)::numeric as p75_value,
      min(reported_at) as source_from, max(reported_at) as source_to
    from cells
    group by company_id, role_family_id, country_code, currency_code, gross_net, engagement_type
  )
  insert into app.salary_aggregate_snapshots (
    aggregate_run_id, rule_version_id, company_id, role_family_id,
    country_code, currency_code, gross_net, engagement_type, sample_size,
    median_annual, p25_annual, p75_annual, source_month_from, source_month_to,
    confidence_label, is_released, is_current
  )
  select
    v_run_id, v_rule.id, g.company_id, g.role_family_id, g.country_code,
    g.currency_code, g.gross_net, g.engagement_type, g.sample_size,
    round(g.median_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1),
    case when g.sample_size >= v_rule.min_range_contributors
      then round(g.p25_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1)
      else null end,
    case when g.sample_size >= v_rule.min_range_contributors
      then round(g.p75_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1)
      else null end,
    date_trunc('month', g.source_from)::date,
    date_trunc('month', g.source_to)::date,
    case when g.sample_size >= 10 then 'high'
         when g.sample_size >= 5 then 'medium' else 'low' end,
    true, true
  from grouped g
  left join app.currency_rounding_rules rr on rr.currency_code = g.currency_code
  where g.sample_size >= v_rule.min_distinct_contributors;
  get diagnostics v_released = row_count;

  with eligible_cells as (
    select count(*)::integer as total
    from (
      select s.company_id, s.role_family_id, s.country_code, s.currency_code,
        s.gross_net, s.engagement_type
      from private.contributions c
      join private.salary_submissions s on s.contribution_id = c.id
      where c.state = 'approved' and c.withdrawn_at is null and s.role_family_id is not null
      group by s.company_id, s.role_family_id, s.country_code, s.currency_code,
        s.gross_net, s.engagement_type
    ) x
  ) select greatest(total - v_released, 0) into v_suppressed from eligible_cells;

  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      released_cells = v_released, suppressed_cells = v_suppressed
  where id = v_run_id;
  update private.aggregate_refresh_queue
  set processed_at = clock_timestamp()
  where metric = v_rule.metric and processed_at is null;
  perform audit.write_event(
    'system', 'aggregate.refreshed', 'salary_aggregate_run', v_run_id,
    'scheduled_refresh', null,
    jsonb_build_object('released_cells', v_released, 'suppressed_cells', v_suppressed),
    array['released_cells', 'suppressed_cells'], null, null,
    jsonb_build_object('rule_version_id', v_rule.id), null
  );
  return v_run_id;
exception when others then
  if v_run_id is not null then
    update app.aggregate_runs
    set status = 'failed', completed_at = clock_timestamp(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$$;

create or replace function security.refresh_company_ratings()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule app.privacy_rule_versions%rowtype;
  v_run_id uuid;
  v_released integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not ((select security.can_manage_jobs()) and (select security.has_staff_role('admin'))) then
    raise exception using errcode = '42501', message = 'trusted aggregate worker required';
  end if;
  select * into strict v_rule from app.privacy_rule_versions
  where metric = 'company_overall_rating' and is_active;
  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_rule.metric, v_rule.id) returning id into v_run_id;
  update app.company_rating_snapshots set is_current = false where is_current;

  with ranked as (
    select p.company_id, p.overall_rating, c.contributor_user_id,
      row_number() over (
        partition by p.company_id, c.contributor_user_id
        order by coalesce(c.decided_at, c.submitted_at) desc, c.id desc
      ) as rn
    from app.review_publications p
    join private.contributions c on c.id = p.source_contribution_id
    where p.publication_status = 'published'
      and c.state = 'approved'
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_rule.minimum_publication_lag
      and c.submitted_at >= clock_timestamp() - make_interval(months => v_rule.max_age_months)
  ), latest as (
    select company_id, overall_rating, contributor_user_id
    from ranked where rn = 1
  )
  insert into app.company_rating_snapshots (
    aggregate_run_id, rule_version_id, company_id, sample_size,
    overall_rating, confidence_label, is_released, is_current
  )
  select
    v_run_id, v_rule.id, latest.company_id,
    count(*)::integer,
    round(avg(latest.overall_rating), 2),
    case when count(*) >= 20 then 'high'
         when count(*) >= 10 then 'medium' else 'low' end,
    true, true
  from latest
  group by latest.company_id
  having count(*) >= v_rule.min_distinct_contributors;
  get diagnostics v_released = row_count;
  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(), released_cells = v_released
  where id = v_run_id;
  update private.aggregate_refresh_queue set processed_at = clock_timestamp()
  where metric = v_rule.metric and processed_at is null;
  return v_run_id;
exception when others then
  if v_run_id is not null then
    update app.aggregate_runs set status = 'failed', completed_at = clock_timestamp(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$$;

create or replace view api.company_reviews
with (security_invoker = true, security_barrier = true)
as
select
  id, company_id, role_family_id, country_code, employment_status,
  employment_period_label, compensation_rating, pay_reliability_rating,
  management_rating, work_life_rating, career_growth_rating,
  overall_rating, pros, cons, advice_to_management, published_at
from app.review_publications
where publication_status = 'published';

create or replace view api.interview_experiences
with (security_invoker = true, security_barrier = true)
as
select
  id, company_id, role_family_id, seniority, country_code,
  application_source, stages, approximate_duration_label, difficulty,
  feedback_received, outcome, question_themes, general_experience, published_at
from app.interview_publications
where publication_status = 'published';

create or replace view api.salary_aggregates
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.company_id, c.slug as company_slug,
  s.role_family_id, r.slug as role_slug, r.name as role_family,
  s.country_code, 'all'::text as seniority,
  s.engagement_type::text as arrangement, s.engagement_type,
  s.currency_code, s.currency_code as currency, s.gross_net,
  s.sample_size, s.median_annual,
  s.p25_annual, s.p25_annual as percentile_25_annual,
  s.p75_annual, s.p75_annual as percentile_75_annual,
  s.source_month_from, s.source_month_from as submission_month_start,
  s.source_month_to, s.source_month_to as submission_month_end,
  s.confidence_label, s.confidence_label as confidence,
  s.rule_version_id, s.computed_at, s.computed_at as calculated_at
from app.salary_aggregate_snapshots s
join app.role_families r on r.id = s.role_family_id
left join app.companies c on c.id = s.company_id
where s.is_current and s.is_released;

create or replace view api.company_ratings
with (security_invoker = true, security_barrier = true)
as
select id, company_id, sample_size, overall_rating, confidence_label, rule_version_id, computed_at
from app.company_rating_snapshots
where is_current and is_released;

create or replace view api.privacy_thresholds
with (security_invoker = true, security_barrier = true)
as
select metric, version, min_distinct_contributors, min_range_contributors,
  max_age_months, minimum_publication_lag, effective_at, methodology_note
from app.privacy_rule_versions
where is_active;

create or replace view api.my_contributions
with (security_invoker = true, security_barrier = true)
as
select id, kind, state, version, submitted_at, decided_at, withdrawn_at
from private.contributions
where contributor_user_id = (select auth.uid());

create or replace view api.my_reports
with (security_invoker = true, security_barrier = true)
as
select id, target_kind, target_id, category, status, created_at, resolved_at
from private.reports
where reporter_user_id = (select auth.uid());

create or replace view api.my_company_claims
with (security_invoker = true, security_barrier = true)
as
select id, company_id, corporate_domain, status, submitted_at, reviewed_at, resolution_note
from private.company_claims
where claimant_user_id = (select auth.uid());

create or replace function api.submit_salary(p_payload jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select security.submit_salary(p_payload) $$;

create or replace function api.submit_review(p_payload jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select security.submit_review(p_payload) $$;

create or replace function api.submit_interview(p_payload jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select security.submit_interview(p_payload) $$;

create or replace function api.has_staff_role(required_role text)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Membership discovery is separate from authorization so an AAL1 staff
  -- session can be routed to the MFA challenge. Every privileged database
  -- mutation independently requires AAL2.
  return security.has_staff_role(required_role::private.staff_role);
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function api.submit_contribution(
  contribution_kind text,
  contribution_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  case lower(contribution_kind)
    when 'salary' then return security.submit_salary(contribution_payload);
    when 'review' then return security.submit_review(contribution_payload);
    when 'interview' then return security.submit_interview(contribution_payload);
    else
      raise exception using errcode = '22023', message = 'invalid contribution kind';
  end case;
end;
$$;

create or replace function api.submit_report(
  p_target_kind text, p_target_id text, p_category text, p_narrative text default null
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.submit_report(
    p_target_kind::private.report_target_kind, p_target_id, p_category, p_narrative
  )
$$;

create or replace function api.report_content(
  reported_type text,
  reported_id text,
  report_category text
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.submit_report(
    reported_type::private.report_target_kind,
    reported_id,
    report_category,
    null
  )
$$;

create or replace function api.withdraw_contribution(p_contribution_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select security.withdraw_contribution(p_contribution_id) $$;

create or replace function api.normalize_contribution(
  contribution_id uuid,
  company_id uuid,
  role_family_id uuid,
  reason text
)
returns boolean language sql security invoker set search_path = ''
as $$
  select security.normalize_contribution(
    contribution_id, company_id, role_family_id, reason
  )
$$;

create or replace function api.transition_moderation(
  p_case_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason_code text,
  p_reason_note text default null,
  p_changed_fields text[] default '{}'::text[],
  p_public_payload jsonb default '{}'::jsonb,
  p_linked_case_id uuid default null
)
returns text language sql security invoker set search_path = ''
as $$
  select security.transition_moderation(
    p_case_id, p_expected_version, p_action::private.moderation_action_kind,
    p_reason_code, p_reason_note, p_changed_fields, p_public_payload, p_linked_case_id
  )::text
$$;

create or replace function security.admin_list(p_resource text)
returns table (
  id uuid,
  title text,
  secondary text,
  status text,
  updated_at timestamptz,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.has_staff_role('admin'))
     or not (select security.is_aal2()) then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;

  case p_resource
    when 'jobs' then
      return query
      select j.id, left(j.title, 300),
        left(c.display_name || ' | ' || s.name, 500), j.status::text,
        j.updated_at, j.admin_version
      from app.jobs j
      join app.companies c on c.id = j.company_id
      join app.job_sources s on s.id = j.source_id
      order by j.updated_at desc, j.id
      limit 200;
    when 'imports' then
      return query
      select r.id, left(s.name || ' import', 300),
        left(format(
          'Fetched %s | created %s | updated %s | errors %s',
          r.fetched_count, r.created_count, r.updated_count, r.error_count
        ), 500), r.status::text,
        coalesce(r.completed_at, r.started_at, r.created_at), r.admin_version
      from ingest.import_runs r
      join app.job_sources s on s.id = r.source_id
      order by r.created_at desc, r.id
      limit 200;
    when 'sources' then
      return query
      select s.id, left(s.name, 300),
        left(s.adapter_key || ' | ' || s.terms_url, 500),
        case when s.review_requested_at is not null then 'review_requested'
             else s.status::text end,
        s.updated_at, s.admin_version
      from app.job_sources s
      order by s.updated_at desc, s.id
      limit 200;
    when 'companies' then
      return query
      select c.id, left(c.display_name, 300),
        left(concat_ws(' | ', c.industry, c.website_domain::text), 500),
        case when c.evidence_requested_at is not null then 'evidence_requested'
             else c.verification_status::text || ':' || c.record_status::text end,
        c.updated_at, c.admin_version
      from app.companies c
      order by c.updated_at desc, c.id
      limit 200;
    when 'moderation' then
      return query
      select mc.id,
        left(case
          when c.kind = 'salary' then coalesce(sr.company_name_input, 'Private employer') || ' salary'
          when c.kind = 'review' then cr.company_name_input || ' review'
          when c.kind = 'interview' then ie.company_name_input || ' interview'
          when es.id is not null then es.company_name || ' - ' || es.title
          when rp.id is not null then rp.category || ' report'
          else 'Moderation case'
        end, 300),
        left(case
          when c.kind = 'salary' then sr.role_title || ' | ' || sr.country_code
          when c.kind = 'review' then cr.role_family_name_input || ' | ' || cr.country_code
          when c.kind = 'interview' then ie.role_family_name_input || ' | ' || ie.country_code
          when es.id is not null then 'Employer submission | ' || es.status::text
          when rp.id is not null then rp.target_kind::text || ' | ' || rp.target_id
          else null
        end, 500),
        mc.state::text, coalesce(mc.closed_at, mc.opened_at), mc.version
      from private.moderation_cases mc
      left join private.contributions c on c.id = mc.contribution_id
      left join private.salary_submissions sr on sr.contribution_id = c.id
      left join private.company_reviews cr on cr.contribution_id = c.id
      left join private.interview_experiences ie on ie.contribution_id = c.id
      left join private.employer_job_submissions es on es.id = mc.employer_submission_id
      left join private.reports rp on rp.id = mc.report_id
      order by (mc.state = 'closed'), mc.priority, mc.opened_at, mc.id
      limit 200;
    when 'reports' then
      return query
      select r.id, left(r.category || ' report', 300),
        left(r.target_kind::text || ' | ' || r.target_id, 500), r.status::text,
        coalesce(r.resolved_at, r.created_at), r.admin_version
      from private.reports r
      order by (r.status in ('resolved', 'dismissed')), r.created_at desc, r.id
      limit 200;
    when 'users' then
      return query
      select p.user_id, left(coalesce(u.email, p.user_id::text), 300),
        left(coalesce(roles.active_roles, 'No staff role'), 500),
        p.account_status::text, p.updated_at, p.admin_version
      from private.profiles p
      join auth.users u on u.id = p.user_id
      left join lateral (
        select string_agg(ur.role::text, ', ' order by ur.role::text) as active_roles
        from private.user_roles ur
        where ur.user_id = p.user_id and ur.revoked_at is null
      ) roles on true
      order by p.updated_at desc, p.user_id
      limit 200;
    when 'calculation_rules' then
      return query
      select r.id, left(r.metric || ' v' || r.version::text, 300),
        left(r.methodology_note, 500),
        case when r.review_requested_at is not null then 'review_requested'
             when r.is_active then 'active'
             when r.retired_at is not null then 'retired'
             else 'draft' end,
        coalesce(r.retired_at, r.review_requested_at, r.effective_at),
        r.admin_version
      from app.privacy_rule_versions r
      order by r.metric, r.version desc, r.id
      limit 200;
    else
      raise exception using errcode = '22023', message = 'unknown admin resource';
  end case;
end;
$$;

create or replace function api.admin_list_jobs()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('jobs') $$;

create or replace function api.admin_list_imports()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('imports') $$;

create or replace function api.admin_list_sources()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('sources') $$;

create or replace function api.admin_list_companies()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('companies') $$;

create or replace function api.admin_list_moderation()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('moderation') $$;

create or replace function api.admin_list_reports()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('reports') $$;

create or replace function api.admin_list_users()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('users') $$;

create or replace function api.admin_list_calculation_rules()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security invoker set search_path = ''
as $$ select * from security.admin_list('calculation_rules') $$;

create or replace function security.remove_reported_content(
  p_kind private.report_target_kind,
  p_target text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer := 0; v_total integer := 0;
begin
  case p_kind
    when 'job' then
      update app.jobs
      set status = 'removed'
      where id::text = p_target or slug = p_target;
    when 'company' then
      update app.companies
      set record_status = 'removed', verification_status = 'suspended'
      where id::text = p_target or slug = p_target;
    when 'review' then
      update app.review_publications
      set publication_status = 'removed'
      where id::text = p_target;
    when 'interview' then
      update app.interview_publications
      set publication_status = 'removed'
      where id::text = p_target;
  end case;
  get diagnostics v_changed = row_count;
  v_total := v_total + v_changed;
  return v_total > 0;
end;
$$;

create or replace function security.admin_transition(
  resource_name text,
  action_name text,
  target_id uuid,
  action_reason text,
  expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version integer;
  v_before text;
  v_after text;
  v_related_id uuid;
  v_changed boolean;
  v_had_role boolean := false;
  v_role private.staff_role;
  v_case private.moderation_cases%rowtype;
  v_payload jsonb;
  v_contribution_kind private.contribution_kind;
  v_contribution_state private.contribution_state;
  v_report_kind private.report_target_kind;
  v_report_target text;
  v_metric text;
  v_source_ok boolean;
  v_submission private.employer_job_submissions%rowtype;
  v_company_id uuid;
  v_source_id uuid;
  v_company_slug text;
  v_job_slug text;
begin
  if not (select security.has_staff_role('admin'))
     or not (select security.is_aal2()) then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  if resource_name is null or resource_name not in (
       'jobs', 'imports', 'sources', 'companies', 'moderation',
       'reports', 'users', 'calculation_rules'
     )
     or action_name is null or action_name !~ '^[a-z_]{2,60}$'
     or char_length(btrim(coalesce(action_reason, ''))) not between 3 and 500
     or target_id is null or expected_version is null or expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid admin transition';
  end if;

  case resource_name
    when 'jobs' then
      select j.admin_version, j.status::text
      into v_current_version, v_before
      from app.jobs j where j.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'job not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'approve' then
        if v_before not in ('draft', 'pending', 'rejected') then
          raise exception using errcode = '23514', message = 'job cannot be approved from its current state';
        end if;
        select s.status = 'active' and s.allow_public_listing
          and s.terms_reviewed_at is not null
        into v_source_ok
        from app.jobs j join app.job_sources s on s.id = j.source_id
        where j.id = target_id and not j.is_fixture
          and j.content_sanitized_at is not null
          and (j.valid_through is null or j.valid_through > clock_timestamp());
        if not coalesce(v_source_ok, false) then
          raise exception using errcode = '23514', message = 'job source, sanitization, fixture, terms, or expiry gate failed';
        end if;
        update app.jobs set status = 'published', last_verified_at = clock_timestamp()
        where id = target_id;
      elsif action_name = 'expire' then
        if v_before not in ('published', 'pending') then
          raise exception using errcode = '23514', message = 'job cannot be expired from its current state';
        end if;
        update app.jobs set status = 'expired' where id = target_id;
      elsif action_name = 'remove' then
        if v_before = 'removed' then
          raise exception using errcode = '23514', message = 'job is already removed';
        end if;
        update app.jobs set status = 'removed' where id = target_id;
      elsif action_name = 'restore' then
        if v_before not in ('removed', 'expired', 'rejected') then
          raise exception using errcode = '23514', message = 'job cannot be restored from its current state';
        end if;
        update app.jobs set status = 'pending' where id = target_id;
      else
        raise exception using errcode = '22023', message = 'unsupported job action';
      end if;
      select status::text into v_after from app.jobs where id = target_id;

    when 'imports' then
      select r.admin_version, r.status::text
      into v_current_version, v_before
      from ingest.import_runs r where r.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'import run not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'retry' then
        if v_before not in ('failed', 'partially_succeeded', 'cancelled') then
          raise exception using errcode = '23514', message = 'only failed, partial, or cancelled imports can be retried';
        end if;
        insert into ingest.import_runs (source_id, status, triggered_by, retry_of)
        select source_id, 'queued', 'admin_retry', id
        from ingest.import_runs where id = target_id
        returning id into v_related_id;
        update ingest.import_runs set admin_version = admin_version where id = target_id;
        v_after := 'retry_queued';
      elsif action_name = 'cancel' then
        if v_before not in ('queued', 'running') then
          raise exception using errcode = '23514', message = 'import cannot be cancelled from its current state';
        end if;
        update ingest.import_runs
        set status = 'cancelled', completed_at = clock_timestamp()
        where id = target_id;
        v_after := 'cancelled';
      else
        raise exception using errcode = '22023', message = 'unsupported import action';
      end if;

    when 'sources' then
      select s.admin_version, s.status::text
      into v_current_version, v_before
      from app.job_sources s where s.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'source not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'enable' then
        if not exists (
          select 1 from app.job_sources s
          where s.id = target_id and s.terms_reviewed_at is not null
            and (not s.allow_public_listing or s.may_index_jobs)
        ) then
          raise exception using errcode = '23514', message = 'source terms and indexing permissions must be reviewed';
        end if;
        update app.job_sources
        set status = 'active', review_requested_at = null
        where id = target_id;
      elsif action_name = 'disable' then
        update app.job_sources
        set status = 'disabled', review_requested_at = null
        where id = target_id;
      elsif action_name = 'request_review' then
        update app.job_sources
        set status = 'paused', review_requested_at = clock_timestamp()
        where id = target_id;
      else
        raise exception using errcode = '22023', message = 'unsupported source action';
      end if;
      select case when review_requested_at is not null then 'review_requested'
                  else status::text end
      into v_after from app.job_sources where id = target_id;

    when 'companies' then
      select c.admin_version,
        c.verification_status::text || ':' || c.record_status::text
      into v_current_version, v_before
      from app.companies c where c.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'company not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'verify' then
        update app.companies
        set verification_status = case when website_domain is null
              then 'organization_verified'::app.company_verification_status
              else 'domain_verified'::app.company_verification_status end,
            verification_scope = case when website_domain is null
              then 'organization record reviewed'
              else 'website domain and organization record reviewed' end,
            record_status = 'published', evidence_requested_at = null
        where id = target_id;
      elsif action_name = 'request_evidence' then
        update app.companies
        set verification_status = 'unverified', record_status = 'pending',
            evidence_requested_at = clock_timestamp()
        where id = target_id;
      elsif action_name = 'remove' then
        update app.companies
        set verification_status = 'suspended', record_status = 'removed',
            evidence_requested_at = null
        where id = target_id;
      elsif action_name = 'merge' then
        raise exception using errcode = '22023', message = 'company merge requires an explicit destination company';
      else
        raise exception using errcode = '22023', message = 'unsupported company action';
      end if;
      select case when evidence_requested_at is not null then 'evidence_requested'
                  else verification_status::text || ':' || record_status::text end
      into v_after from app.companies where id = target_id;

    when 'reports' then
      select r.admin_version, r.status::text, r.target_kind, r.target_id
      into v_current_version, v_before, v_report_kind, v_report_target
      from private.reports r where r.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'report not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'resolve' then
        update private.reports set status = 'resolved', resolved_at = clock_timestamp(),
          resolved_by = (select auth.uid()) where id = target_id;
        v_after := 'resolved';
      elsif action_name = 'dismiss' then
        update private.reports set status = 'dismissed', resolved_at = clock_timestamp(),
          resolved_by = (select auth.uid()) where id = target_id;
        v_after := 'dismissed';
      elsif action_name = 'escalate' then
        update private.reports set status = 'in_review', resolved_at = null,
          resolved_by = null where id = target_id;
        v_after := 'in_review';
      elsif action_name = 'remove' then
        if not security.remove_reported_content(v_report_kind, v_report_target) then
          raise exception using errcode = 'P0002', message = 'reported content not found';
        end if;
        update private.reports set status = 'resolved', resolved_at = clock_timestamp(),
          resolved_by = (select auth.uid()) where id = target_id;
        v_after := 'resolved';
      else
        raise exception using errcode = '22023', message = 'unsupported report action';
      end if;
      update private.moderation_cases
      set state = case when action_name = 'escalate'
            then 'escalated'::private.moderation_case_state
            else 'closed'::private.moderation_case_state end,
          closed_at = case when action_name = 'escalate' then null else clock_timestamp() end,
          version = version + 1
      where report_id = target_id and state <> 'closed';

    when 'users' then
      select p.admin_version, p.account_status::text
      into v_current_version, v_before
      from private.profiles p where p.user_id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'user not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;
      if target_id = (select auth.uid()) then
        raise exception using errcode = '42501', message = 'administrators cannot transition their own account';
      end if;

      if action_name in ('grant_moderator', 'grant_data_quality', 'grant_admin') then
        v_role := case action_name
          when 'grant_moderator' then 'moderator'::private.staff_role
          when 'grant_data_quality' then 'data_quality'::private.staff_role
          else 'admin'::private.staff_role end;
        v_changed := security.set_staff_role(target_id, v_role, true, action_reason);
        if not v_changed then
          raise exception using errcode = '23514', message = 'user already has that active role';
        end if;
        update private.profiles set admin_version = admin_version where user_id = target_id;
      elsif action_name = 'revoke_role' then
        for v_role in
          select ur.role from private.user_roles ur
          where ur.user_id = target_id and ur.revoked_at is null
          order by case when ur.role = 'admin' then 2 else 1 end, ur.role
        loop
          v_had_role := true;
          perform security.set_staff_role(target_id, v_role, false, action_reason);
        end loop;
        if not v_had_role then
          raise exception using errcode = '23514', message = 'user has no active staff role';
        end if;
        update private.profiles set admin_version = admin_version where user_id = target_id;
      elsif action_name = 'suspend' then
        if v_before <> 'active' then
          raise exception using errcode = '23514', message = 'only an active user can be suspended';
        end if;
        if exists (
          select 1 from private.user_roles ur
          where ur.user_id = target_id and ur.role = 'admin' and ur.revoked_at is null
        ) then
          perform pg_advisory_xact_lock(hashtextextended('salarypadi:active-admin-set', 0));
          if (
            select count(*) from private.user_roles ur
            join private.profiles p on p.user_id = ur.user_id
            where ur.role = 'admin' and ur.revoked_at is null and p.account_status = 'active'
          ) <= 1 then
            raise exception using errcode = '23514', message = 'cannot suspend the last active admin';
          end if;
        end if;
        update private.profiles set account_status = 'suspended' where user_id = target_id;
      elsif action_name = 'restore' then
        if v_before <> 'suspended' then
          raise exception using errcode = '23514', message = 'only a suspended account can be restored';
        end if;
        update private.profiles set account_status = 'active' where user_id = target_id;
      else
        raise exception using errcode = '22023', message = 'unsupported user action';
      end if;
      select account_status::text into v_after from private.profiles where user_id = target_id;

    when 'calculation_rules' then
      select r.admin_version, r.metric,
        case when r.is_active then 'active'
             when r.review_requested_at is not null then 'review_requested'
             when r.retired_at is not null then 'retired' else 'draft' end
      into v_current_version, v_metric, v_before
      from app.privacy_rule_versions r where r.id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'calculation rule not found'; end if;
      if v_current_version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;

      if action_name = 'activate' then
        update app.privacy_rule_versions
        set is_active = false, retired_at = clock_timestamp()
        where metric = v_metric and is_active and id <> target_id;
        update app.privacy_rule_versions
        set is_active = true, retired_at = null, review_requested_at = null
        where id = target_id;
      elsif action_name = 'retire' then
        if v_before = 'active' then
          raise exception using errcode = '23514',
            message = 'activate a replacement before retiring the active rule';
        end if;
        update app.privacy_rule_versions
        set is_active = false, retired_at = clock_timestamp(), review_requested_at = null
        where id = target_id;
      elsif action_name = 'request_review' then
        update app.privacy_rule_versions
        set review_requested_at = clock_timestamp()
        where id = target_id;
      else
        raise exception using errcode = '22023', message = 'unsupported calculation-rule action';
      end if;
      select case when review_requested_at is not null then 'review_requested'
                  when is_active then 'active'
                  when retired_at is not null then 'retired' else 'draft' end
      into v_after from app.privacy_rule_versions where id = target_id;

    when 'moderation' then
      select * into v_case from private.moderation_cases
      where id = target_id for update;
      if not found then raise exception using errcode = 'P0002', message = 'moderation case not found'; end if;
      if v_case.version <> expected_version then
        raise exception using errcode = '40001', message = 'stale admin row version';
      end if;
      v_before := v_case.state::text;

      if v_case.contribution_id is not null then
        if action_name in ('merge', 'redact') then
          raise exception using errcode = '22023',
            message = 'merge and redaction require a dedicated payload-aware moderation request';
        end if;
        select c.kind, c.state into v_contribution_kind, v_contribution_state
        from private.contributions c where c.id = v_case.contribution_id for update;
        if action_name in ('approve', 'request_revision', 'escalate')
           and v_contribution_state = 'pending' then
          perform security.transition_moderation(
            target_id, expected_version, 'claim', 'auto_claim', action_reason
          );
          expected_version := expected_version + 1;
          v_contribution_state := 'in_review';
        end if;
        if action_name = 'approve' and v_contribution_kind in ('review', 'interview') then
          select mp.payload into v_payload from private.moderated_payloads mp
          where mp.contribution_id = v_case.contribution_id;
          if v_payload is null then
            raise exception using errcode = '23514',
              message = 'a reviewed public payload is required before approval';
          end if;
        else
          v_payload := '{}'::jsonb;
        end if;
        if action_name not in ('approve', 'reject', 'request_revision', 'escalate', 'remove', 'restore') then
          raise exception using errcode = '22023', message = 'unsupported moderation action';
        end if;
        v_after := security.transition_moderation(
          target_id, expected_version,
          action_name::private.moderation_action_kind,
          action_name, action_reason, '{}'::text[], v_payload, null
        )::text;
      elsif v_case.employer_submission_id is not null then
        select es.* into v_submission
        from private.employer_job_submissions es
        where es.id = v_case.employer_submission_id for update;
        v_before := v_submission.status::text;
        if action_name = 'approve' and v_before in ('pending', 'in_review') then
          v_after := 'approved';

          v_company_id := v_submission.company_id;
          if v_company_id is null then
            v_company_slug := trim(both '-' from regexp_replace(
              lower(v_submission.company_name), '[^a-z0-9]+', '-', 'g'
            ));
            if char_length(v_company_slug) < 2 then
              v_company_slug := 'employer';
            end if;
            v_company_slug := left(v_company_slug, 80) || '-' ||
              left(replace(v_submission.id::text, '-', ''), 8);
            insert into app.companies (
              slug, display_name, website_url, website_domain,
              headquarters_country, verification_status, verification_scope,
              record_status
            ) values (
              v_company_slug, v_submission.company_name,
              v_submission.company_website,
              case when v_submission.corporate_domain_matches
                then v_submission.corporate_email_domain else null end,
              v_submission.country_code, 'unverified',
              'Employer-submitted record reviewed; identity not independently verified',
              'published'
            )
            returning id into v_company_id;
          end if;

          select s.id into strict v_source_id
          from app.job_sources s
          where s.adapter_key = 'salarypadi_employer_submissions'
            and s.status = 'active' and s.allow_public_listing;

          v_job_slug := trim(both '-' from regexp_replace(
            lower(v_submission.title || '-' || v_submission.company_name),
            '[^a-z0-9]+', '-', 'g'
          ));
          if char_length(v_job_slug) < 2 then
            v_job_slug := 'employer-job';
          end if;
          v_job_slug := left(v_job_slug, 150) || '-' ||
            left(replace(v_submission.id::text, '-', ''), 8);

          insert into app.jobs (
            company_id, source_id, external_source_id, slug, status, title,
            description_text, requirements_text, benefits_text,
            work_arrangement, employment_type, engagement_type,
            experience_level, salary_min, salary_max, currency_code,
            pay_period, gross_net, application_url, source_url,
            original_employer_url, posted_at, valid_through, last_seen_at,
            last_checked_at, last_verified_at, content_sanitized_at,
            dedup_fingerprint, is_fixture
          ) values (
            v_company_id, v_source_id, v_submission.id::text, v_job_slug,
            'published', v_submission.title, v_submission.description_text,
            v_submission.requirements_text, v_submission.benefits_text,
            v_submission.work_arrangement, v_submission.employment_type,
            v_submission.engagement_type, v_submission.experience_level,
            v_submission.salary_min, v_submission.salary_max,
            v_submission.currency_code, v_submission.pay_period,
            v_submission.gross_net, v_submission.application_url,
            v_submission.application_url, v_submission.application_url,
            v_submission.submitted_at,
            case when v_submission.deadline is null then null else
              (v_submission.deadline::timestamp + interval '1 day') at time zone 'UTC'
            end,
            clock_timestamp(), clock_timestamp(), clock_timestamp(),
            clock_timestamp(),
            encode(extensions.digest(
              lower(v_submission.title || '|' || v_submission.company_name || '|' ||
                v_submission.application_url), 'sha256'
            ), 'hex'), false
          )
          on conflict (source_id, external_source_id) do update
          set company_id = excluded.company_id,
              slug = excluded.slug,
              status = 'published',
              title = excluded.title,
              description_text = excluded.description_text,
              requirements_text = excluded.requirements_text,
              benefits_text = excluded.benefits_text,
              work_arrangement = excluded.work_arrangement,
              employment_type = excluded.employment_type,
              engagement_type = excluded.engagement_type,
              experience_level = excluded.experience_level,
              salary_min = excluded.salary_min,
              salary_max = excluded.salary_max,
              currency_code = excluded.currency_code,
              pay_period = excluded.pay_period,
              gross_net = excluded.gross_net,
              application_url = excluded.application_url,
              source_url = excluded.source_url,
              original_employer_url = excluded.original_employer_url,
              valid_through = excluded.valid_through,
              last_seen_at = excluded.last_seen_at,
              last_checked_at = excluded.last_checked_at,
              last_verified_at = excluded.last_verified_at,
              content_sanitized_at = excluded.content_sanitized_at,
              dedup_fingerprint = excluded.dedup_fingerprint
          returning id into v_related_id;

          delete from app.job_locations where job_id = v_related_id;
          insert into app.job_locations (
            job_id, country_code, city, is_primary
          ) values (
            v_related_id, v_submission.country_code,
            v_submission.location_text, true
          )
          on conflict do nothing;

          insert into app.job_eligibility (
            job_id, scope, required_timezone_overlap,
            work_authorization_requirement, visa_sponsorship, evidence_text,
            provenance, confidence, last_verified_at, verified_by
          ) values (
            v_related_id, v_submission.eligibility_scope,
            v_submission.timezone_overlap, v_submission.work_authorization,
            v_submission.visa_sponsorship, v_submission.eligibility_evidence,
            'manually_verified', 0.800, clock_timestamp(), (select auth.uid())
          )
          on conflict (job_id) do update
          set scope = excluded.scope,
              required_timezone_overlap = excluded.required_timezone_overlap,
              work_authorization_requirement = excluded.work_authorization_requirement,
              visa_sponsorship = excluded.visa_sponsorship,
              evidence_text = excluded.evidence_text,
              provenance = excluded.provenance,
              confidence = excluded.confidence,
              last_verified_at = excluded.last_verified_at,
              verified_by = excluded.verified_by;
        elsif action_name = 'reject' and v_before in ('pending', 'in_review') then
          v_after := 'rejected';
        elsif action_name = 'request_revision' and v_before in ('pending', 'in_review') then
          v_after := 'revision_requested';
        elsif action_name = 'escalate' and v_before in ('pending', 'in_review') then
          v_after := 'in_review';
        elsif action_name = 'remove' and v_before = 'approved' then
          v_after := 'removed';
          update app.jobs j
          set status = 'removed'
          from app.job_sources s
          where j.source_id = s.id
            and s.adapter_key = 'salarypadi_employer_submissions'
            and j.external_source_id = v_submission.id::text;
        elsif action_name = 'restore' and v_before in ('removed', 'rejected') then
          v_after := 'pending';
        else
          raise exception using errcode = '23514', message = 'invalid employer-submission moderation transition';
        end if;
        update private.employer_job_submissions
        set status = v_after::private.employer_submission_status,
            company_id = coalesce(v_company_id, company_id)
        where id = v_case.employer_submission_id;
        update private.moderation_cases
        set state = case
              when action_name = 'escalate' then 'escalated'::private.moderation_case_state
              when v_after in ('approved', 'rejected', 'removed') then 'closed'::private.moderation_case_state
              when v_after = 'in_review' then 'in_review'::private.moderation_case_state
              else 'open'::private.moderation_case_state end,
            closed_at = case when v_after in ('approved', 'rejected', 'removed')
              then clock_timestamp() else null end,
            version = version + 1
        where id = target_id;
        insert into private.moderation_actions (
          case_id, actor_user_id, actor_role, action, reason_code, reason_note
        ) values (
          target_id, (select auth.uid()), 'admin',
          action_name::private.moderation_action_kind, action_name, action_reason
        );
      else
        select r.status::text, r.target_kind, r.target_id
        into v_before, v_report_kind, v_report_target
        from private.reports r where r.id = v_case.report_id for update;
        if action_name = 'approve' then v_after := 'resolved';
        elsif action_name = 'reject' then v_after := 'dismissed';
        elsif action_name = 'escalate' then v_after := 'in_review';
        elsif action_name = 'remove' then
          if not security.remove_reported_content(v_report_kind, v_report_target) then
            raise exception using errcode = 'P0002', message = 'reported content not found';
          end if;
          v_after := 'resolved';
        else
          raise exception using errcode = '22023', message = 'unsupported report moderation action';
        end if;
        update private.reports
        set status = v_after::private.report_status,
            resolved_at = case when v_after in ('resolved', 'dismissed') then clock_timestamp() else null end,
            resolved_by = case when v_after in ('resolved', 'dismissed') then (select auth.uid()) else null end
        where id = v_case.report_id;
        update private.moderation_cases
        set state = case when v_after = 'in_review' then 'escalated'::private.moderation_case_state
                         else 'closed'::private.moderation_case_state end,
            closed_at = case when v_after = 'in_review' then null else clock_timestamp() end,
            version = version + 1
        where id = target_id;
        insert into private.moderation_actions (
          case_id, actor_user_id, actor_role, action, reason_code, reason_note
        ) values (
          target_id, (select auth.uid()), 'admin',
          case when action_name = 'approve' then 'approve'::private.moderation_action_kind
               when action_name = 'reject' then 'reject'::private.moderation_action_kind
               when action_name = 'escalate' then 'escalate'::private.moderation_action_kind
               else 'remove'::private.moderation_action_kind end,
          action_name, action_reason
        );
      end if;
  end case;

  perform audit.write_event(
    'staff', 'admin.' || resource_name || '.' || action_name,
    resource_name, target_id, action_name,
    jsonb_build_object('status', v_before, 'version', expected_version),
    jsonb_build_object('status', v_after), array['status'], null, null,
    jsonb_strip_nulls(jsonb_build_object(
      'reason', btrim(action_reason), 'related_id', v_related_id
    ))
  );
  return true;
end;
$$;

create or replace function api.admin_transition(
  resource_name text,
  action_name text,
  target_id uuid,
  action_reason text,
  expected_version integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select security.admin_transition(
    resource_name, action_name, target_id, action_reason, expected_version
  )
$$;

do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'private', 'audit') and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', r.nspname, r.relname);
    execute format('alter table %I.%I force row level security', r.nspname, r.relname);
  end loop;
end;
$$;

drop policy if exists company_benefits_public_read on app.company_benefits;
create policy company_benefits_public_read on app.company_benefits
for select to anon, authenticated using (record_status = 'published');

drop policy if exists currency_rate_sets_public_read on app.currency_rate_sets;
create policy currency_rate_sets_public_read on app.currency_rate_sets
for select to anon, authenticated using (status = 'published');
drop policy if exists currency_rates_public_read on app.currency_rates;
create policy currency_rates_public_read on app.currency_rates
for select to anon, authenticated using (
  exists (select 1 from app.currency_rate_sets s where s.id = rate_set_id and s.status = 'published')
);
drop policy if exists currency_rounding_public_read on app.currency_rounding_rules;
create policy currency_rounding_public_read on app.currency_rounding_rules
for select to anon, authenticated using (true);

drop policy if exists review_publications_public_read on app.review_publications;
create policy review_publications_public_read on app.review_publications
for select to anon, authenticated using (publication_status = 'published');
drop policy if exists interview_publications_public_read on app.interview_publications;
create policy interview_publications_public_read on app.interview_publications
for select to anon, authenticated using (publication_status = 'published');
drop policy if exists privacy_rules_public_read on app.privacy_rule_versions;
create policy privacy_rules_public_read on app.privacy_rule_versions
for select to anon, authenticated using (is_active);
drop policy if exists salary_aggregates_public_read on app.salary_aggregate_snapshots;
create policy salary_aggregates_public_read on app.salary_aggregate_snapshots
for select to anon, authenticated using (is_current and is_released);
drop policy if exists company_ratings_public_read on app.company_rating_snapshots;
create policy company_ratings_public_read on app.company_rating_snapshots
for select to anon, authenticated using (is_current and is_released);

drop policy if exists company_claims_owner_read on private.company_claims;
create policy company_claims_owner_read on private.company_claims
for select to authenticated using (claimant_user_id = (select auth.uid()));
drop policy if exists company_claims_staff_read on private.company_claims;
create policy company_claims_staff_read on private.company_claims
for select to authenticated using ((select security.can_manage_jobs()));

drop policy if exists contributions_owner_read on private.contributions;
create policy contributions_owner_read on private.contributions
for select to authenticated using (contributor_user_id = (select auth.uid()));
drop policy if exists contributions_moderator_read on private.contributions;
create policy contributions_moderator_read on private.contributions
for select to authenticated using ((select security.can_moderate()));

drop policy if exists salary_submissions_moderator_read on private.salary_submissions;
create policy salary_submissions_moderator_read on private.salary_submissions
for select to authenticated using ((select security.can_moderate()));
drop policy if exists company_reviews_moderator_read on private.company_reviews;
create policy company_reviews_moderator_read on private.company_reviews
for select to authenticated using ((select security.can_moderate()));
drop policy if exists interviews_moderator_read on private.interview_experiences;
create policy interviews_moderator_read on private.interview_experiences
for select to authenticated using ((select security.can_moderate()));

drop policy if exists reports_owner_read on private.reports;
create policy reports_owner_read on private.reports
for select to authenticated using (reporter_user_id = (select auth.uid()));
drop policy if exists reports_moderator_read on private.reports;
create policy reports_moderator_read on private.reports
for select to authenticated using ((select security.can_moderate()));

drop policy if exists moderation_cases_staff_read on private.moderation_cases;
create policy moderation_cases_staff_read on private.moderation_cases
for select to authenticated using ((select security.can_moderate()));
drop policy if exists moderated_payloads_staff_read on private.moderated_payloads;
create policy moderated_payloads_staff_read on private.moderated_payloads
for select to authenticated using ((select security.can_moderate()));
drop policy if exists moderation_actions_staff_read on private.moderation_actions;
create policy moderation_actions_staff_read on private.moderation_actions
for select to authenticated using ((select security.can_moderate()));
drop policy if exists moderation_flags_staff_read on private.moderation_flags;
create policy moderation_flags_staff_read on private.moderation_flags
for select to authenticated using ((select security.can_moderate()));

grant select on app.company_benefits, app.currency_rate_sets, app.currency_rates,
  app.currency_rounding_rules, app.privacy_rule_versions,
  app.salary_aggregate_snapshots, app.company_rating_snapshots to anon, authenticated;

grant select (
  id, company_id, role_family_id, country_code, employment_status,
  employment_period_label, compensation_rating, pay_reliability_rating,
  management_rating, work_life_rating, career_growth_rating, overall_rating,
  pros, cons, advice_to_management, publication_status, published_at
) on app.review_publications to anon, authenticated;

grant select (
  id, company_id, role_family_id, seniority, country_code,
  application_source, stages, approximate_duration_label, difficulty,
  feedback_received, outcome, question_themes, general_experience,
  publication_status, published_at
) on app.interview_publications to anon, authenticated;

grant select on private.company_claims, private.contributions, private.reports to authenticated;
grant select on private.salary_submissions, private.company_reviews,
  private.interview_experiences, private.moderation_cases,
  private.moderated_payloads, private.moderation_actions,
  private.moderation_flags to authenticated;

grant select on api.company_reviews, api.interview_experiences,
  api.salary_aggregates, api.company_ratings, api.privacy_thresholds to anon, authenticated;
grant select on api.my_contributions, api.my_reports, api.my_company_claims to authenticated;

grant execute on function security.submit_salary(jsonb) to authenticated;
grant execute on function security.submit_review(jsonb) to authenticated;
grant execute on function security.submit_interview(jsonb) to authenticated;
grant execute on function security.submit_report(private.report_target_kind, text, text, text) to authenticated;
grant execute on function security.withdraw_contribution(uuid) to authenticated;
grant execute on function security.normalize_contribution(uuid, uuid, uuid, text) to authenticated;
grant execute on function security.transition_moderation(
  uuid, integer, private.moderation_action_kind, text, text, text[], jsonb, uuid
) to authenticated;
grant execute on function security.admin_list(text) to authenticated;
grant execute on function security.admin_transition(text, text, uuid, text, integer) to authenticated;
grant execute on function security.refresh_salary_aggregates() to service_role;
grant execute on function security.refresh_company_ratings() to service_role;

grant execute on function api.submit_salary(jsonb) to authenticated;
grant execute on function api.submit_review(jsonb) to authenticated;
grant execute on function api.submit_interview(jsonb) to authenticated;
grant execute on function api.has_staff_role(text) to authenticated;
grant execute on function api.submit_contribution(text, jsonb) to authenticated;
grant execute on function api.submit_report(text, text, text, text) to authenticated;
grant execute on function api.report_content(text, text, text) to authenticated;
grant execute on function api.withdraw_contribution(uuid) to authenticated;
grant execute on function api.normalize_contribution(uuid, uuid, uuid, text) to authenticated;
grant execute on function api.transition_moderation(
  uuid, integer, text, text, text, text[], jsonb, uuid
) to authenticated;
grant execute on function api.admin_list_jobs() to authenticated;
grant execute on function api.admin_list_imports() to authenticated;
grant execute on function api.admin_list_sources() to authenticated;
grant execute on function api.admin_list_companies() to authenticated;
grant execute on function api.admin_list_moderation() to authenticated;
grant execute on function api.admin_list_reports() to authenticated;
grant execute on function api.admin_list_users() to authenticated;
grant execute on function api.admin_list_calculation_rules() to authenticated;
grant execute on function api.admin_transition(text, text, uuid, text, integer) to authenticated;

comment on table private.salary_submissions is
  'Never expose individual salary submissions. Public salary data comes only from thresholded snapshots.';
comment on table app.review_publications is
  'Public redacted copy. source_contribution_id is omitted from the api.company_reviews projection.';
comment on table private.moderation_actions is
  'Append-only action trail; stores state and hashes, not removed PII or full raw text.';
comment on table app.salary_aggregate_snapshots is
  'Only current released rows meeting a versioned distinct-contributor threshold are publicly selectable.';

commit;
