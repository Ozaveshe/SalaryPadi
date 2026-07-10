begin;

create extension if not exists pg_trgm with schema extensions;

do $$
begin
  create type app.record_status as enum ('draft', 'pending', 'published', 'archived', 'removed');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.company_verification_status as enum (
    'unverified', 'domain_verified', 'organization_verified', 'suspended'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.source_type as enum (
    'direct_employer', 'partner_feed', 'permitted_api', 'employer_ats', 'manual'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.source_status as enum ('draft', 'active', 'paused', 'disabled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type ingest.import_status as enum (
    'queued', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.job_status as enum ('draft', 'pending', 'published', 'expired', 'removed', 'rejected');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.work_arrangement as enum ('remote', 'hybrid', 'onsite', 'unspecified');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.employment_type as enum (
    'full_time', 'part_time', 'contract', 'freelance', 'temporary',
    'internship', 'graduate_trainee', 'other'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.engagement_type as enum ('employee', 'contractor', 'freelance', 'unspecified');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.experience_level as enum (
    'entry', 'junior', 'mid', 'senior', 'lead', 'executive', 'unspecified'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.pay_period as enum ('hourly', 'daily', 'weekly', 'monthly', 'annual');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.gross_net_classification as enum ('gross', 'net', 'unspecified');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.eligibility_scope as enum (
    'worldwide', 'africa', 'emea', 'nigeria', 'named_countries', 'restricted_region', 'unclear'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.eligibility_provenance as enum ('source_provided', 'manually_verified', 'inferred');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.country_rule as enum ('include', 'exclude');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.application_status as enum (
    'saved', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.company_membership_role as enum ('owner', 'recruiter', 'representative');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.company_membership_status as enum ('pending', 'verified', 'revoked');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.employer_submission_status as enum (
    'draft', 'pending', 'in_review', 'revision_requested', 'approved', 'rejected', 'removed'
  );
exception when duplicate_object then null;
end;
$$;

create table if not exists app.role_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references app.role_families(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint role_families_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint role_families_name_length check (char_length(name) between 2 and 120)
);

create table if not exists app.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  legal_name text,
  website_url text,
  website_domain extensions.citext,
  industry text,
  size_band text,
  description text,
  headquarters_country text,
  verification_status app.company_verification_status not null default 'unverified',
  verification_scope text,
  record_status app.record_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint companies_name_length check (char_length(display_name) between 2 and 200),
  constraint companies_website_https check (website_url is null or website_url ~* '^https://'),
  constraint companies_country_format check (
    headquarters_country is null or headquarters_country ~ '^[A-Z]{2}$'
  )
);

create unique index if not exists companies_domain_unique
  on app.companies (website_domain) where website_domain is not null;
create index if not exists companies_public_listing
  on app.companies (record_status, display_name);

create table if not exists app.company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  alias extensions.citext not null,
  normalized_alias extensions.citext not null,
  source_note text,
  match_method text not null default 'manual',
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  unique (company_id, normalized_alias),
  constraint company_aliases_confidence_range check (confidence is null or confidence between 0 and 1)
);

create index if not exists company_aliases_normalized_lookup
  on app.company_aliases (normalized_alias);

create table if not exists app.company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  country_code text not null,
  city text,
  region text,
  location_type text not null default 'office',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint company_locations_country_format check (country_code ~ '^[A-Z]{2}$'),
  constraint company_locations_city_length check (city is null or char_length(city) <= 160)
);

create index if not exists company_locations_company on app.company_locations (company_id);

create table if not exists app.job_sources (
  id uuid primary key default gen_random_uuid(),
  adapter_key text not null unique,
  name text not null,
  source_type app.source_type not null,
  status app.source_status not null default 'draft',
  homepage_url text,
  terms_url text not null,
  attribution_required boolean not null default true,
  attribution_text text,
  may_store_full_description boolean not null default false,
  may_index_jobs boolean not null default false,
  may_emit_jobposting_schema boolean not null default false,
  allow_public_listing boolean not null default false,
  required_destination_kind text not null default 'source_url',
  refresh_interval interval not null default interval '6 hours',
  terms_reviewed_at timestamptz,
  terms_reviewed_by uuid references private.profiles(user_id) on delete set null,
  terms_version text,
  last_successful_import_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sources_adapter_format check (adapter_key ~ '^[a-z0-9_]+$'),
  constraint job_sources_terms_https check (
    terms_url ~* '^https://' or terms_url = '/terms'
  ),
  constraint job_sources_homepage_https check (homepage_url is null or homepage_url ~* '^https://'),
  constraint job_sources_refresh_positive check (refresh_interval >= interval '15 minutes'),
  constraint job_sources_public_terms_review check (
    not allow_public_listing or terms_reviewed_at is not null
  )
);

insert into app.job_sources (
  adapter_key, name, source_type, status, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, allow_public_listing,
  required_destination_kind, refresh_interval, terms_reviewed_at, terms_version
) values (
  'salarypadi_employer_submissions', 'SalaryPadi employer submissions',
  'direct_employer', 'active', '/terms', true,
  'Submitted by the employer and reviewed by SalaryPadi', true,
  true, true, true, 'employer_application_url', interval '24 hours',
  timestamptz '2026-07-10 00:00:00+00', 'salarypadi-terms-2026-07-10'
)
on conflict (adapter_key) do nothing;

create table if not exists ingest.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app.job_sources(id) on delete restrict,
  status ingest.import_status not null default 'queued',
  triggered_by text not null default 'schedule',
  started_at timestamptz,
  completed_at timestamptz,
  fetched_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  expired_count integer not null default 0,
  error_count integer not null default 0,
  error_summary jsonb not null default '{}'::jsonb,
  retry_of uuid references ingest.import_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint import_runs_counts_nonnegative check (
    fetched_count >= 0 and created_count >= 0 and updated_count >= 0
    and unchanged_count >= 0 and expired_count >= 0 and error_count >= 0
  ),
  constraint import_runs_error_object check (jsonb_typeof(error_summary) = 'object'),
  constraint import_runs_time_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index if not exists import_runs_source_created
  on ingest.import_runs (source_id, created_at desc);

create table if not exists ingest.raw_job_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app.job_sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  external_source_id text not null,
  source_url text not null,
  original_employer_url text,
  raw_payload jsonb,
  content_hash text not null,
  dedup_fingerprint text,
  full_description_stored boolean not null default false,
  imported_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  retention_expires_at timestamptz,
  unique (source_id, external_source_id),
  constraint raw_job_source_https check (source_url ~* '^https://'),
  constraint raw_job_employer_https check (
    original_employer_url is null or original_employer_url ~* '^https://'
  ),
  constraint raw_job_payload_object check (
    raw_payload is null or jsonb_typeof(raw_payload) = 'object'
  ),
  constraint raw_job_payload_size check (
    raw_payload is null or octet_length(raw_payload::text) <= 1048576
  ),
  constraint raw_job_content_hash_format check (content_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists raw_job_records_fingerprint
  on ingest.raw_job_records (dedup_fingerprint) where dedup_fingerprint is not null;

create table if not exists app.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete restrict,
  source_id uuid not null references app.job_sources(id) on delete restrict,
  external_source_id text not null,
  slug text not null unique,
  status app.job_status not null default 'draft',
  title text not null,
  description_text text not null,
  description_html text,
  requirements_text text,
  benefits_text text,
  work_arrangement app.work_arrangement not null default 'unspecified',
  employment_type app.employment_type not null,
  engagement_type app.engagement_type not null default 'unspecified',
  experience_level app.experience_level not null default 'unspecified',
  role_family_id uuid references app.role_families(id) on delete set null,
  salary_min numeric(18,2),
  salary_max numeric(18,2),
  currency_code text,
  pay_period app.pay_period,
  gross_net app.gross_net_classification not null default 'unspecified',
  bonus_text text,
  application_url text not null,
  source_url text not null,
  original_employer_url text,
  posted_at timestamptz,
  valid_through timestamptz,
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_verified_at timestamptz,
  content_sanitized_at timestamptz,
  dedup_fingerprint text,
  canonical_job_id uuid references app.jobs(id) on delete set null,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description_text, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(requirements_text, '')), 'C')
  ) stored,
  unique (source_id, external_source_id),
  constraint jobs_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint jobs_title_length check (char_length(title) between 2 and 300),
  constraint jobs_description_length check (char_length(description_text) between 20 and 100000),
  constraint jobs_salary_nonnegative check (
    (salary_min is null or salary_min >= 0)
    and (salary_max is null or salary_max >= 0)
  ),
  constraint jobs_salary_order check (
    salary_min is null or salary_max is null or salary_max >= salary_min
  ),
  constraint jobs_currency_format check (
    currency_code is null or currency_code ~ '^[A-Z]{3}$'
  ),
  constraint jobs_application_https check (application_url ~* '^https://'),
  constraint jobs_source_https check (source_url ~* '^https://'),
  constraint jobs_employer_https check (
    original_employer_url is null or original_employer_url ~* '^https://'
  ),
  constraint jobs_no_fixture_publication check (not (is_fixture and status = 'published')),
  constraint jobs_published_sanitized check (
    status <> 'published' or content_sanitized_at is not null
  )
);

create index if not exists jobs_search_gin on app.jobs using gin (search_document);
create index if not exists jobs_public_order on app.jobs (status, posted_at desc, id);
create index if not exists jobs_expiry on app.jobs (status, valid_through);
create index if not exists jobs_company on app.jobs (company_id, status, posted_at desc);
create index if not exists jobs_dedup_fingerprint
  on app.jobs (dedup_fingerprint) where dedup_fingerprint is not null;

create table if not exists app.job_locations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.jobs(id) on delete cascade,
  country_code text,
  city text,
  region text,
  is_primary boolean not null default false,
  constraint job_locations_country_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  )
);

create index if not exists job_locations_job on app.job_locations (job_id);
create index if not exists job_locations_country on app.job_locations (country_code, job_id);

create table if not exists app.job_eligibility (
  job_id uuid primary key references app.jobs(id) on delete cascade,
  scope app.eligibility_scope not null,
  required_timezone_overlap text,
  work_authorization_requirement text,
  visa_sponsorship boolean,
  relocation_support boolean,
  evidence_text text,
  provenance app.eligibility_provenance not null,
  confidence numeric(4,3),
  last_verified_at timestamptz,
  verified_by uuid references private.profiles(user_id) on delete set null,
  constraint job_eligibility_confidence_range check (confidence is null or confidence between 0 and 1),
  constraint job_eligibility_manual_verified_date check (
    provenance <> 'manually_verified' or last_verified_at is not null
  )
);

create table if not exists app.job_eligibility_countries (
  job_id uuid not null references app.jobs(id) on delete cascade,
  country_code text not null,
  rule app.country_rule not null,
  primary key (job_id, country_code, rule),
  constraint job_eligibility_country_format check (country_code ~ '^[A-Z]{2}$')
);

create index if not exists eligibility_countries_lookup
  on app.job_eligibility_countries (country_code, rule, job_id);

create table if not exists app.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint skills_slug_format check (slug ~ '^[a-z0-9+#.]+(?:-[a-z0-9+#.]+)*$'),
  constraint skills_name_length check (char_length(name) between 1 and 120)
);

create table if not exists app.job_skills (
  job_id uuid not null references app.jobs(id) on delete cascade,
  skill_id uuid not null references app.skills(id) on delete restrict,
  is_required boolean not null default true,
  primary key (job_id, skill_id)
);

create table if not exists app.job_risk_indicators (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.jobs(id) on delete cascade,
  code text not null,
  severity smallint not null,
  evidence_text text,
  detection_method text not null,
  is_public boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, code),
  constraint job_risk_severity_range check (severity between 1 and 5),
  constraint job_risk_code_format check (code ~ '^[a-z0-9_]+$')
);

create table if not exists private.company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  role private.company_membership_role not null,
  status private.company_membership_status not null default 'pending',
  corporate_domain extensions.citext,
  verified_at timestamptz,
  verified_by uuid references private.profiles(user_id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role),
  constraint company_membership_verification_pair check (
    status <> 'verified' or verified_at is not null
  )
);

create index if not exists company_memberships_scope
  on private.company_memberships (user_id, company_id, status);

create table if not exists private.external_job_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references private.profiles(user_id) on delete cascade,
  source_key text not null,
  external_id text not null,
  job_slug text not null,
  job_title text not null,
  company_name text not null,
  source_url text not null,
  posted_at timestamptz,
  eligibility_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, source_key, external_id),
  constraint external_jobs_source_key_length check (char_length(source_key) between 1 and 120),
  constraint external_jobs_external_id_length check (char_length(external_id) between 1 and 300),
  constraint external_jobs_slug_format check (job_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint external_jobs_title_length check (char_length(job_title) between 2 and 300),
  constraint external_jobs_company_length check (char_length(company_name) between 2 and 200),
  constraint external_jobs_source_https check (source_url ~* '^https://'),
  constraint external_jobs_evidence_length check (
    eligibility_evidence is null or char_length(eligibility_evidence) <= 5000
  )
);

create table if not exists private.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  job_id uuid references app.jobs(id) on delete cascade,
  external_job_id uuid references private.external_job_snapshots(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_jobs_one_target check (num_nonnulls(job_id, external_job_id) = 1),
  unique (user_id, job_id),
  unique (user_id, external_job_id)
);

create table if not exists private.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  job_id uuid references app.jobs(id) on delete cascade,
  external_job_id uuid references private.external_job_snapshots(id) on delete cascade,
  status private.application_status not null default 'saved',
  private_notes text,
  next_action_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_one_target check (num_nonnulls(job_id, external_job_id) = 1),
  unique (user_id, job_id),
  unique (user_id, external_job_id),
  constraint applications_notes_length check (
    private_notes is null or char_length(private_notes) <= 10000
  )
);

create index if not exists applications_owner_status
  on private.applications (user_id, status, updated_at desc);

create table if not exists private.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.applications(id) on delete cascade,
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  previous_status private.application_status,
  new_status private.application_status not null,
  changed_at timestamptz not null default now(),
  constraint application_history_actual_change check (
    previous_status is null or previous_status <> new_status
  )
);

create index if not exists application_history_application
  on private.application_history (application_id, changed_at desc);

create table if not exists private.job_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  name text not null,
  search_spec jsonb not null,
  cadence text not null default 'daily',
  is_enabled boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_alerts_name_length check (char_length(name) between 1 and 120),
  constraint job_alerts_search_object check (jsonb_typeof(search_spec) = 'object'),
  constraint job_alerts_search_size check (octet_length(search_spec::text) <= 16384),
  constraint job_alerts_schema_version check (search_spec ? 'schema_version'),
  constraint job_alerts_cadence check (cadence in ('daily', 'weekly'))
);

create index if not exists job_alerts_owner_enabled
  on private.job_alerts (user_id, is_enabled, created_at desc);

create table if not exists private.employer_job_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references private.profiles(user_id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  company_name text not null,
  corporate_email extensions.citext,
  corporate_email_domain extensions.citext,
  company_website text,
  corporate_domain_matches boolean not null default false,
  title text not null,
  country_code text,
  location_text text,
  work_arrangement app.work_arrangement not null,
  employment_type app.employment_type not null,
  engagement_type app.engagement_type not null,
  experience_level app.experience_level not null default 'unspecified',
  eligibility_scope app.eligibility_scope not null,
  eligibility_evidence text not null,
  included_countries text,
  excluded_countries text,
  timezone_overlap text,
  work_authorization text,
  visa_sponsorship boolean,
  salary_min numeric(18,2),
  salary_max numeric(18,2),
  currency_code text,
  pay_period app.pay_period,
  gross_net app.gross_net_classification not null default 'unspecified',
  description_text text not null,
  requirements_text text not null,
  benefits_text text,
  application_url text not null,
  deadline date,
  authorization_attested boolean not null,
  status private.employer_submission_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_submission_company_length check (char_length(company_name) between 2 and 200),
  constraint employer_submission_title_length check (char_length(title) between 2 and 300),
  constraint employer_submission_website_https check (
    company_website is null or company_website ~* '^https://'
  ),
  constraint employer_submission_country_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint employer_submission_salary_order check (
    (salary_min is null or salary_min >= 0)
    and (salary_max is null or salary_max >= 0)
    and (salary_min is null or salary_max is null or salary_max >= salary_min)
  ),
  constraint employer_submission_currency_format check (
    currency_code is null or currency_code ~ '^[A-Z]{3}$'
  ),
  constraint employer_submission_description_length check (
    char_length(description_text) between 50 and 100000
  ),
  constraint employer_submission_requirements_length check (
    char_length(requirements_text) between 20 and 20000
  ),
  constraint employer_submission_application_https check (application_url ~* '^https://'),
  constraint employer_submission_authorized check (authorization_attested)
);

create index if not exists employer_submissions_owner
  on private.employer_job_submissions (submitted_by, submitted_at desc);
create index if not exists employer_submissions_queue
  on private.employer_job_submissions (status, submitted_at)
  where status in ('pending', 'in_review', 'revision_requested');

drop trigger if exists companies_set_updated_at on app.companies;
create trigger companies_set_updated_at
before update on app.companies
for each row execute function security.set_updated_at();

drop trigger if exists job_sources_set_updated_at on app.job_sources;
create trigger job_sources_set_updated_at
before update on app.job_sources
for each row execute function security.set_updated_at();

drop trigger if exists jobs_set_updated_at on app.jobs;
create trigger jobs_set_updated_at
before update on app.jobs
for each row execute function security.set_updated_at();

drop trigger if exists applications_set_updated_at on private.applications;
create trigger applications_set_updated_at
before update on private.applications
for each row execute function security.set_updated_at();

drop trigger if exists external_job_snapshots_set_updated_at on private.external_job_snapshots;
create trigger external_job_snapshots_set_updated_at
before update on private.external_job_snapshots
for each row execute function security.set_updated_at();

drop trigger if exists job_alerts_set_updated_at on private.job_alerts;
create trigger job_alerts_set_updated_at
before update on private.job_alerts
for each row execute function security.set_updated_at();

drop trigger if exists employer_submissions_set_updated_at on private.employer_job_submissions;
create trigger employer_submissions_set_updated_at
before update on private.employer_job_submissions
for each row execute function security.set_updated_at();

create or replace function security.upsert_raw_job_record(
  p_source_id uuid,
  p_import_run_id uuid,
  p_external_source_id text,
  p_source_url text,
  p_original_employer_url text,
  p_raw_payload jsonb,
  p_content_hash text,
  p_dedup_fingerprint text,
  p_retention_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_may_store boolean;
  v_status app.source_status;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'trusted import worker required';
  end if;
  select s.may_store_full_description, s.status
  into v_may_store, v_status
  from app.job_sources s where s.id = p_source_id;
  if not found or v_status <> 'active' then
    raise exception using errcode = '23514', message = 'active configured source required';
  end if;
  if p_import_run_id is not null and not exists (
    select 1 from ingest.import_runs r
    where r.id = p_import_run_id and r.source_id = p_source_id
  ) then
    raise exception using errcode = '23503', message = 'import run does not belong to source';
  end if;
  if p_raw_payload is not null and not v_may_store then
    raise exception using errcode = '42501', message = 'source terms prohibit raw payload storage';
  end if;
  if char_length(p_external_source_id) not between 1 and 300
     or p_source_url !~* '^https://'
     or (p_original_employer_url is not null and p_original_employer_url !~* '^https://')
     or p_content_hash !~ '^[0-9a-f]{64}$'
     or (p_raw_payload is not null and (
       jsonb_typeof(p_raw_payload) <> 'object'
       or octet_length(p_raw_payload::text) > 1048576
     )) then
    raise exception using errcode = '22023', message = 'invalid raw job record';
  end if;

  insert into ingest.raw_job_records as existing (
    source_id, import_run_id, external_source_id, source_url,
    original_employer_url, raw_payload, content_hash, dedup_fingerprint,
    full_description_stored, last_seen_at, retention_expires_at
  ) values (
    p_source_id, p_import_run_id, p_external_source_id, p_source_url,
    p_original_employer_url, p_raw_payload, p_content_hash, p_dedup_fingerprint,
    p_raw_payload is not null, clock_timestamp(), p_retention_expires_at
  )
  on conflict (source_id, external_source_id) do update
  set import_run_id = excluded.import_run_id,
      source_url = excluded.source_url,
      original_employer_url = coalesce(excluded.original_employer_url, existing.original_employer_url),
      raw_payload = excluded.raw_payload,
      content_hash = excluded.content_hash,
      dedup_fingerprint = excluded.dedup_fingerprint,
      full_description_stored = excluded.full_description_stored,
      last_seen_at = excluded.last_seen_at,
      retention_expires_at = excluded.retention_expires_at
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function security.can_manage_jobs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select security.is_aal2())
    and (select security.has_any_staff_role(array['data_quality', 'admin']::private.staff_role[]))
$$;

create or replace function security.can_moderate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select security.is_aal2())
    and (select security.has_any_staff_role(array['moderator', 'admin']::private.staff_role[]))
$$;

create or replace function security.can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select security.is_active_user())
    and exists (
      select 1 from private.company_memberships m
      where m.user_id = (select auth.uid())
        and m.company_id = p_company_id
        and m.status = 'verified'
        and m.revoked_at is null
    )
$$;

create or replace function security.set_job_saved(p_job_id uuid, p_saved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_saved and not exists (
    select 1
    from app.jobs j
    join app.job_sources s on s.id = j.source_id
    where j.id = p_job_id
      and j.status = 'published'
      and not j.is_fixture
      and (j.valid_through is null or j.valid_through > clock_timestamp())
      and s.status = 'active'
      and s.allow_public_listing
  ) then
    raise exception using errcode = '22023', message = 'job is unavailable';
  end if;

  if p_saved then
    insert into private.saved_jobs (user_id, job_id)
    values ((select auth.uid()), p_job_id)
    on conflict do nothing;
  else
    delete from private.saved_jobs
    where user_id = (select auth.uid()) and job_id = p_job_id;
  end if;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function security.upsert_application(
  p_job_id uuid,
  p_status private.application_status,
  p_private_notes text default null,
  p_next_action_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old_status private.application_status;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_private_notes is not null and char_length(p_private_notes) > 10000 then
    raise exception using errcode = '22023', message = 'private notes are too long';
  end if;
  if not exists (select 1 from app.jobs where id = p_job_id) then
    raise exception using errcode = '22023', message = 'job does not exist';
  end if;

  select a.id, a.status into v_id, v_old_status
  from private.applications a
  where a.user_id = (select auth.uid()) and a.job_id = p_job_id
  for update;

  if v_id is null then
    insert into private.applications (
      user_id, job_id, status, private_notes, next_action_at, applied_at
    ) values (
      (select auth.uid()), p_job_id, p_status, p_private_notes, p_next_action_at,
      case when p_status = 'applied' then clock_timestamp() else null end
    ) returning id into v_id;

    insert into private.application_history (
      application_id, user_id, previous_status, new_status
    ) values (v_id, (select auth.uid()), null, p_status);
  else
    update private.applications
    set status = p_status,
        private_notes = p_private_notes,
        next_action_at = p_next_action_at,
        applied_at = case
          when applied_at is null and p_status = 'applied' then clock_timestamp()
          else applied_at
        end
    where id = v_id;

    if v_old_status <> p_status then
      insert into private.application_history (
        application_id, user_id, previous_status, new_status
      ) values (v_id, (select auth.uid()), v_old_status, p_status);
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function security.create_job_alert(
  p_name text,
  p_search_spec jsonb,
  p_cadence text default 'daily'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(p_name) not between 1 and 120
     or jsonb_typeof(p_search_spec) <> 'object'
     or not (p_search_spec ? 'schema_version')
     or octet_length(p_search_spec::text) > 16384
     or p_cadence not in ('daily', 'weekly') then
    raise exception using errcode = '22023', message = 'invalid alert';
  end if;
  perform security.consume_rate_limit('job_alert_create', 20, interval '1 day');
  insert into private.job_alerts (user_id, name, search_spec, cadence)
  values ((select auth.uid()), p_name, p_search_spec, p_cadence)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function security.delete_job_alert(p_alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  delete from private.job_alerts
  where id = p_alert_id and user_id = (select auth.uid());
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function security.submit_employer_job(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_company_id uuid;
  v_salary_min numeric;
  v_salary_max numeric;
  v_authorized boolean;
  v_corporate_email text;
  v_pay_period app.pay_period;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 131072 then
    raise exception using errcode = '22023', message = 'invalid submission payload';
  end if;
  v_authorized := coalesce(nullif(p_payload ->> 'authorization_attested', '')::boolean, false)
    or coalesce(p_payload ->> 'authorization_attestation', '') = 'on';
  if not v_authorized then
    raise exception using errcode = '22023', message = 'publishing authorization must be attested';
  end if;
  if coalesce(p_payload ->> 'application_url', '') !~* '^https://' then
    raise exception using errcode = '22023', message = 'application URL must use HTTPS';
  end if;

  if nullif(p_payload ->> 'company_id', '') is not null then
    v_company_id := (p_payload ->> 'company_id')::uuid;
    if not (select security.can_manage_company(v_company_id)) then
      raise exception using errcode = '42501', message = 'verified company membership required';
    end if;
  end if;
  v_corporate_email := nullif(p_payload ->> 'corporate_email', '');
  if v_corporate_email is null or position('@' in v_corporate_email) < 2 then
    raise exception using errcode = '22023', message = 'valid corporate email required';
  end if;
  if coalesce(p_payload ->> 'company_website', '') !~* '^https://' then
    raise exception using errcode = '22023', message = 'company website must use HTTPS';
  end if;

  v_salary_min := coalesce(
    nullif(p_payload ->> 'salary_min', '')::numeric,
    nullif(p_payload ->> 'salary_minimum', '')::numeric
  );
  v_salary_max := coalesce(
    nullif(p_payload ->> 'salary_max', '')::numeric,
    nullif(p_payload ->> 'salary_maximum', '')::numeric
  );
  if v_salary_min is not null and v_salary_min < 0
     or v_salary_max is not null and v_salary_max < coalesce(v_salary_min, 0) then
    raise exception using errcode = '22023', message = 'invalid salary range';
  end if;
  v_pay_period := case
    when nullif(p_payload ->> 'pay_period', '') in ('hourly', 'daily', 'weekly', 'monthly', 'annual')
      then (p_payload ->> 'pay_period')::app.pay_period
    else null
  end;

  perform security.consume_rate_limit('employer_job_submit', 5, interval '1 day');

  insert into private.employer_job_submissions (
    submitted_by, company_id, company_name, corporate_email,
    corporate_email_domain, company_website, corporate_domain_matches, title,
    country_code, location_text, work_arrangement, employment_type,
    engagement_type, experience_level, eligibility_scope, eligibility_evidence,
    included_countries, excluded_countries, timezone_overlap,
    work_authorization, visa_sponsorship, salary_min, salary_max,
    currency_code, pay_period, gross_net, description_text,
    requirements_text, benefits_text, application_url, deadline,
    authorization_attested, status
  ) values (
    (select auth.uid()), v_company_id, p_payload ->> 'company_name',
    v_corporate_email::extensions.citext,
    lower(split_part(v_corporate_email, '@', 2))::extensions.citext,
    p_payload ->> 'company_website',
    coalesce(nullif(p_payload ->> 'corporate_domain_matches', '')::boolean, false),
    p_payload ->> 'title', upper(nullif(p_payload ->> 'country_code', '')),
    nullif(p_payload ->> 'location', ''),
    coalesce(p_payload ->> 'work_arrangement', p_payload ->> 'work_mode')::app.work_arrangement,
    (p_payload ->> 'employment_type')::app.employment_type,
    coalesce(p_payload ->> 'engagement_type', p_payload ->> 'arrangement')::app.engagement_type,
    coalesce(nullif(p_payload ->> 'experience_level', ''), 'unspecified')::app.experience_level,
    (p_payload ->> 'eligibility_scope')::app.eligibility_scope,
    p_payload ->> 'eligibility_evidence',
    nullif(p_payload ->> 'included_countries', ''),
    nullif(p_payload ->> 'excluded_countries', ''),
    nullif(p_payload ->> 'timezone_overlap', ''),
    nullif(p_payload ->> 'work_authorization', ''),
    case p_payload ->> 'visa_sponsorship'
      when 'yes' then true when 'no' then false else null end,
    v_salary_min, v_salary_max,
    upper(coalesce(nullif(p_payload ->> 'currency_code', ''), nullif(p_payload ->> 'currency', ''))),
    v_pay_period,
    case coalesce(p_payload ->> 'gross_net', 'unknown')
      when 'gross' then 'gross'::app.gross_net_classification
      when 'net' then 'net'::app.gross_net_classification
      else 'unspecified'::app.gross_net_classification end,
    coalesce(p_payload ->> 'description_text', p_payload ->> 'description'),
    p_payload ->> 'requirements', nullif(p_payload ->> 'benefits', ''),
    p_payload ->> 'application_url', nullif(p_payload ->> 'deadline', '')::date,
    true, 'pending'
  ) returning id into v_id;

  perform audit.write_event(
    'user', 'employer_job_submission.created', 'employer_job_submission', v_id,
    'submitted', null, jsonb_build_object('status', 'pending'), array['status']
  );
  return v_id;
end;
$$;

create or replace function security.upsert_external_job_snapshot(
  p_source_key text,
  p_external_id text,
  p_job_slug text,
  p_job_title text,
  p_company_name text,
  p_source_url text,
  p_posted_at timestamptz default null,
  p_eligibility_evidence text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if char_length(p_source_key) not between 1 and 120
     or char_length(p_external_id) not between 1 and 300
     or p_job_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(p_job_title) not between 2 and 300
     or char_length(p_company_name) not between 2 and 200
     or p_source_url !~* '^https://'
     or char_length(coalesce(p_eligibility_evidence, '')) > 5000 then
    raise exception using errcode = '22023', message = 'invalid external job snapshot';
  end if;

  insert into private.external_job_snapshots as current_snapshot (
    owner_user_id, source_key, external_id, job_slug, job_title, company_name,
    source_url, posted_at, eligibility_evidence
  ) values (
    (select auth.uid()), p_source_key, p_external_id, p_job_slug, p_job_title, p_company_name,
    p_source_url, p_posted_at, p_eligibility_evidence
  )
  on conflict (owner_user_id, source_key, external_id) do update
  set job_slug = excluded.job_slug,
      job_title = excluded.job_title,
      company_name = excluded.company_name,
      source_url = excluded.source_url,
      posted_at = coalesce(excluded.posted_at, current_snapshot.posted_at),
      eligibility_evidence = coalesce(
        excluded.eligibility_evidence, current_snapshot.eligibility_evidence
      )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function security.save_external_job(
  source_key text,
  external_id text,
  job_slug text,
  job_title text,
  company_name text,
  source_url text,
  posted_at timestamptz default null,
  eligibility_evidence text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_external_job_id uuid; v_saved_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  perform security.consume_rate_limit('saved_job_write', 100, interval '1 day');
  v_external_job_id := security.upsert_external_job_snapshot(
    source_key, external_id, job_slug, job_title, company_name,
    source_url, posted_at, eligibility_evidence
  );
  insert into private.saved_jobs as current_saved (user_id, external_job_id)
  values ((select auth.uid()), v_external_job_id)
  on conflict (user_id, external_job_id) do update set created_at = current_saved.created_at
  returning id into v_saved_id;
  return v_saved_id;
end;
$$;

create or replace function security.remove_saved_job(p_saved_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  delete from private.saved_jobs
  where id = p_saved_job_id and user_id = (select auth.uid());
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function security.record_external_application(
  source_key text,
  external_id text,
  job_slug text,
  job_title text,
  company_name text,
  source_url text,
  application_status private.application_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_external_job_id uuid;
  v_application_id uuid;
  v_old_status private.application_status;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  perform security.consume_rate_limit('application_write', 100, interval '1 day');
  v_external_job_id := security.upsert_external_job_snapshot(
    source_key, external_id, job_slug, job_title, company_name, source_url, null, null
  );
  select a.id, a.status into v_application_id, v_old_status
  from private.applications a
  where a.user_id = (select auth.uid()) and a.external_job_id = v_external_job_id
  for update;

  if v_application_id is null then
    insert into private.applications (
      user_id, external_job_id, status, applied_at
    ) values (
      (select auth.uid()), v_external_job_id, application_status,
      case when application_status = 'applied' then clock_timestamp() else null end
    ) returning id into v_application_id;
    insert into private.application_history (
      application_id, user_id, previous_status, new_status
    ) values (v_application_id, (select auth.uid()), null, application_status);
  elsif v_old_status <> application_status then
    update private.applications
    set status = application_status,
        applied_at = case
          when applied_at is null and application_status = 'applied' then clock_timestamp()
          else applied_at end
    where id = v_application_id;
    insert into private.application_history (
      application_id, user_id, previous_status, new_status
    ) values (v_application_id, (select auth.uid()), v_old_status, application_status);
  end if;
  return v_application_id;
end;
$$;

create or replace function security.update_application_status(
  p_application_id uuid,
  p_status private.application_status,
  p_notes text default null,
  p_next_action_date date default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_old_status private.application_status; v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'private notes are too long';
  end if;
  select status into v_old_status
  from private.applications
  where id = p_application_id and user_id = (select auth.uid())
  for update;
  if not found then return false; end if;

  update private.applications
  set status = p_status,
      private_notes = p_notes,
      next_action_at = p_next_action_date::timestamptz,
      applied_at = case
        when applied_at is null and p_status = 'applied' then clock_timestamp()
        else applied_at end
  where id = p_application_id and user_id = (select auth.uid());
  get diagnostics v_changed = row_count;
  if v_old_status <> p_status then
    insert into private.application_history (
      application_id, user_id, previous_status, new_status
    ) values (p_application_id, (select auth.uid()), v_old_status, p_status);
  end if;
  return v_changed > 0;
end;
$$;

create or replace function security.remove_application(p_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  delete from private.applications
  where id = p_application_id and user_id = (select auth.uid());
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function security.get_my_saved_jobs()
returns table (
  id uuid, job_slug text, title text, company_name text, source_name text, saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select
    sj.id,
    coalesce(x.job_slug, j.slug),
    coalesce(x.job_title, j.title),
    coalesce(x.company_name, c.display_name),
    coalesce(x.source_key, s.name),
    sj.created_at
  from private.saved_jobs sj
  left join private.external_job_snapshots x on x.id = sj.external_job_id
  left join app.jobs j on j.id = sj.job_id
  left join app.companies c on c.id = j.company_id
  left join app.job_sources s on s.id = j.source_id
  where sj.user_id = (select auth.uid())
  order by sj.created_at desc;
end;
$$;

create or replace function security.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status private.application_status, private_notes text,
  next_action_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select
    a.id, coalesce(x.job_slug, j.slug), coalesce(x.job_title, j.title),
    coalesce(x.company_name, c.display_name), a.status, a.private_notes,
    a.next_action_at, a.updated_at
  from private.applications a
  left join private.external_job_snapshots x on x.id = a.external_job_id
  left join app.jobs j on j.id = a.job_id
  left join app.companies c on c.id = j.company_id
  where a.user_id = (select auth.uid())
  order by a.updated_at desc;
end;
$$;

create or replace function security.get_my_job_alerts()
returns table (id uuid, query jsonb, cadence text, active boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select a.id, a.search_spec, a.cadence, a.is_enabled, a.created_at
  from private.job_alerts a
  where a.user_id = (select auth.uid())
  order by a.created_at desc;
end;
$$;

create or replace view api.companies
with (security_invoker = true, security_barrier = true)
as
select
  c.id, c.slug, c.display_name, c.website_url, c.industry, c.size_band,
  c.description, c.headquarters_country, c.verification_status,
  c.verification_scope, c.updated_at
from app.companies c
where c.record_status = 'published';

create or replace view api.job_sources
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.name, s.source_type, s.homepage_url, s.terms_url,
  s.attribution_required, s.attribution_text,
  s.may_index_jobs, s.may_emit_jobposting_schema,
  s.required_destination_kind, s.terms_reviewed_at
from app.job_sources s
where s.status = 'active' and s.allow_public_listing;

create or replace view api.jobs
with (security_invoker = true, security_barrier = true)
as
select
  j.id, j.slug, j.title, j.description_text, j.description_html,
  j.requirements_text, j.benefits_text, j.work_arrangement,
  j.employment_type, j.engagement_type, j.experience_level,
  j.role_family_id, j.salary_min, j.salary_max, j.currency_code,
  j.pay_period, j.gross_net, j.bonus_text, j.application_url,
  j.source_url, j.posted_at, j.valid_through, j.last_checked_at,
  j.last_verified_at,
  c.id as company_id, c.slug as company_slug, c.display_name as company_name,
  c.verification_status as company_verification_status,
  s.name as source_name, s.attribution_text, s.may_index_jobs,
  s.may_emit_jobposting_schema,
  e.scope as eligibility_scope, e.required_timezone_overlap,
  e.work_authorization_requirement, e.visa_sponsorship,
  e.relocation_support, e.evidence_text as eligibility_evidence,
  e.provenance as eligibility_provenance, e.last_verified_at as eligibility_verified_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', l.country_code, 'city', l.city, 'region', l.region,
      'is_primary', l.is_primary
    ) order by l.is_primary desc, l.country_code, l.city)
    from app.job_locations l where l.job_id = j.id
  ), '[]'::jsonb) as locations,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', ec.country_code, 'rule', ec.rule
    ) order by ec.rule, ec.country_code)
    from app.job_eligibility_countries ec where ec.job_id = j.id
  ), '[]'::jsonb) as eligibility_countries
from app.jobs j
join app.companies c on c.id = j.company_id
join app.job_sources s on s.id = j.source_id
left join app.job_eligibility e on e.job_id = j.id
where j.status = 'published'
  and not j.is_fixture
  and (j.valid_through is null or j.valid_through > clock_timestamp())
  and c.record_status = 'published'
  and s.status = 'active'
  and s.allow_public_listing;

create or replace view api.my_saved_jobs
with (security_invoker = true, security_barrier = true)
as
select sj.job_id, sj.created_at
from private.saved_jobs sj
where sj.user_id = (select auth.uid());

create or replace view api.my_applications
with (security_invoker = true, security_barrier = true)
as
select id, job_id, status, private_notes, next_action_at, applied_at, created_at, updated_at
from private.applications
where user_id = (select auth.uid());

create or replace view api.my_application_history
with (security_invoker = true, security_barrier = true)
as
select h.id, h.application_id, h.previous_status, h.new_status, h.changed_at
from private.application_history h
where h.user_id = (select auth.uid());

create or replace view api.my_job_alerts
with (security_invoker = true, security_barrier = true)
as
select id, name, search_spec, cadence, is_enabled, last_sent_at, created_at, updated_at
from private.job_alerts
where user_id = (select auth.uid());

create or replace view api.my_employer_job_submissions
with (security_invoker = true, security_barrier = true)
as
select
  id, company_id, company_name, title, country_code, work_arrangement,
  employment_type, engagement_type, eligibility_scope, salary_min,
  salary_max, currency_code, pay_period, application_url, status,
  submitted_at, updated_at
from private.employer_job_submissions
where submitted_by = (select auth.uid());

create or replace function api.set_job_saved(p_job_id uuid, p_saved boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select security.set_job_saved(p_job_id, p_saved) $$;

create or replace function api.save_external_job(
  source_key text,
  external_id text,
  job_slug text,
  job_title text,
  company_name text,
  source_url text,
  posted_at timestamptz default null,
  eligibility_evidence text default null
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.save_external_job(
    source_key, external_id, job_slug, job_title, company_name,
    source_url, posted_at, eligibility_evidence
  )
$$;

create or replace function api.remove_saved_job(saved_job_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select security.remove_saved_job(saved_job_id) $$;

create or replace function api.upsert_application(
  p_job_id uuid,
  p_status text,
  p_private_notes text default null,
  p_next_action_at timestamptz default null
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.upsert_application(
    p_job_id, p_status::private.application_status, p_private_notes, p_next_action_at
  )
$$;

create or replace function api.record_external_application(
  source_key text,
  external_id text,
  job_slug text,
  job_title text,
  company_name text,
  source_url text,
  application_status text
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.record_external_application(
    source_key, external_id, job_slug, job_title, company_name, source_url,
    application_status::private.application_status
  )
$$;

create or replace function api.update_application_status(
  application_id uuid,
  application_status text,
  notes text default null,
  next_action_date date default null
)
returns boolean language sql security invoker set search_path = ''
as $$
  select security.update_application_status(
    application_id, application_status::private.application_status,
    notes, next_action_date
  )
$$;

create or replace function api.remove_application(application_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select security.remove_application(application_id) $$;

create or replace function api.create_job_alert(
  p_name text, p_search_spec jsonb, p_cadence text default 'daily'
)
returns uuid language sql security invoker set search_path = ''
as $$ select security.create_job_alert(p_name, p_search_spec, p_cadence) $$;

create or replace function api.create_job_alert(
  alert_query jsonb,
  alert_cadence text
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.create_job_alert(
    left(coalesce(nullif(alert_query ->> 'q', ''), 'Saved search'), 120),
    alert_query || jsonb_build_object('schema_version', 1),
    alert_cadence
  )
$$;

create or replace function api.delete_job_alert(p_alert_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select security.delete_job_alert(p_alert_id) $$;

create or replace function api.remove_job_alert(alert_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select security.delete_job_alert(alert_id) $$;

create or replace function api.submit_employer_job(p_payload jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select security.submit_employer_job(p_payload) $$;

create or replace function api.submit_employer_job(
  submission_payload jsonb,
  corporate_domain_matches boolean
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.submit_employer_job(
    submission_payload || jsonb_build_object(
      'corporate_domain_matches', coalesce(corporate_domain_matches, false)
    )
  )
$$;

create or replace function api.get_my_saved_jobs()
returns table (
  id uuid, job_slug text, title text, company_name text, source_name text, saved_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from security.get_my_saved_jobs() $$;

create or replace function api.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status text, private_notes text, next_action_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select a.id, a.job_slug, a.title, a.company_name, a.status::text,
    a.private_notes, a.next_action_at, a.updated_at
  from security.get_my_applications() a
$$;

create or replace function api.get_my_job_alerts()
returns table (id uuid, query jsonb, cadence text, active boolean, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from security.get_my_job_alerts() $$;

do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'private', 'ingest')
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', r.nspname, r.relname);
    execute format('alter table %I.%I force row level security', r.nspname, r.relname);
  end loop;
end;
$$;

drop policy if exists role_families_public_read on app.role_families;
create policy role_families_public_read on app.role_families
for select to anon, authenticated using (is_active);

drop policy if exists companies_public_read on app.companies;
create policy companies_public_read on app.companies
for select to anon, authenticated using (record_status = 'published');
drop policy if exists companies_staff_read on app.companies;
create policy companies_staff_read on app.companies
for select to authenticated using ((select security.can_manage_jobs()));

drop policy if exists company_locations_public_read on app.company_locations;
create policy company_locations_public_read on app.company_locations
for select to anon, authenticated using (
  exists (select 1 from app.companies c where c.id = company_id and c.record_status = 'published')
);

drop policy if exists job_sources_public_read on app.job_sources;
create policy job_sources_public_read on app.job_sources
for select to anon, authenticated using (status = 'active' and allow_public_listing);
drop policy if exists job_sources_staff_read on app.job_sources;
create policy job_sources_staff_read on app.job_sources
for select to authenticated using ((select security.can_manage_jobs()));

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published' and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and exists (
    select 1 from app.job_sources s
    where s.id = source_id and s.status = 'active' and s.allow_public_listing
  )
);
drop policy if exists jobs_staff_read on app.jobs;
create policy jobs_staff_read on app.jobs
for select to authenticated using ((select security.can_manage_jobs()));

drop policy if exists job_locations_public_read on app.job_locations;
create policy job_locations_public_read on app.job_locations
for select to anon, authenticated using (
  exists (select 1 from app.jobs j where j.id = job_id and j.status = 'published' and not j.is_fixture)
);

drop policy if exists job_eligibility_public_read on app.job_eligibility;
create policy job_eligibility_public_read on app.job_eligibility
for select to anon, authenticated using (
  exists (select 1 from app.jobs j where j.id = job_id and j.status = 'published' and not j.is_fixture)
);

drop policy if exists job_eligibility_countries_public_read on app.job_eligibility_countries;
create policy job_eligibility_countries_public_read on app.job_eligibility_countries
for select to anon, authenticated using (
  exists (select 1 from app.jobs j where j.id = job_id and j.status = 'published' and not j.is_fixture)
);

drop policy if exists skills_public_read on app.skills;
create policy skills_public_read on app.skills
for select to anon, authenticated using (true);

drop policy if exists job_skills_public_read on app.job_skills;
create policy job_skills_public_read on app.job_skills
for select to anon, authenticated using (
  exists (select 1 from app.jobs j where j.id = job_id and j.status = 'published' and not j.is_fixture)
);

drop policy if exists job_risk_public_read on app.job_risk_indicators;
create policy job_risk_public_read on app.job_risk_indicators
for select to anon, authenticated using (
  is_public and exists (
    select 1 from app.jobs j where j.id = job_id and j.status = 'published' and not j.is_fixture
  )
);

drop policy if exists company_memberships_owner_read on private.company_memberships;
create policy company_memberships_owner_read on private.company_memberships
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists company_memberships_staff_read on private.company_memberships;
create policy company_memberships_staff_read on private.company_memberships
for select to authenticated using ((select security.can_manage_jobs()));

drop policy if exists external_job_snapshots_owner_read on private.external_job_snapshots;
create policy external_job_snapshots_owner_read on private.external_job_snapshots
for select to authenticated
using (owner_user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists saved_jobs_owner_all on private.saved_jobs;
create policy saved_jobs_owner_all on private.saved_jobs
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists applications_owner_all on private.applications;
create policy applications_owner_all on private.applications
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists application_history_owner_read on private.application_history;
create policy application_history_owner_read on private.application_history
for select to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists job_alerts_owner_all on private.job_alerts;
create policy job_alerts_owner_all on private.job_alerts
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists employer_submissions_owner_read on private.employer_job_submissions;
create policy employer_submissions_owner_read on private.employer_job_submissions
for select to authenticated using (submitted_by = (select auth.uid()));
drop policy if exists employer_submissions_staff_read on private.employer_job_submissions;
create policy employer_submissions_staff_read on private.employer_job_submissions
for select to authenticated using ((select security.can_manage_jobs()));

grant select on app.role_families, app.companies, app.company_locations,
  app.job_sources, app.jobs, app.job_locations, app.job_eligibility,
  app.job_eligibility_countries, app.skills, app.job_skills,
  app.job_risk_indicators to anon, authenticated;

grant select on private.company_memberships, private.external_job_snapshots, private.saved_jobs,
  private.applications, private.application_history, private.job_alerts,
  private.employer_job_submissions to authenticated;

grant select on api.companies, api.job_sources, api.jobs to anon, authenticated;
grant select on api.my_saved_jobs, api.my_applications,
  api.my_application_history, api.my_job_alerts,
  api.my_employer_job_submissions to authenticated;

grant execute on function security.can_manage_jobs() to authenticated;
grant execute on function security.can_moderate() to authenticated;
grant execute on function security.can_manage_company(uuid) to authenticated;
grant execute on function security.upsert_raw_job_record(
  uuid, uuid, text, text, text, jsonb, text, text, timestamptz
) to service_role;
grant execute on function security.set_job_saved(uuid, boolean) to authenticated;
grant execute on function security.save_external_job(
  text, text, text, text, text, text, timestamptz, text
) to authenticated;
grant execute on function security.remove_saved_job(uuid) to authenticated;
grant execute on function security.upsert_application(uuid, private.application_status, text, timestamptz) to authenticated;
grant execute on function security.record_external_application(
  text, text, text, text, text, text, private.application_status
) to authenticated;
grant execute on function security.update_application_status(
  uuid, private.application_status, text, date
) to authenticated;
grant execute on function security.remove_application(uuid) to authenticated;
grant execute on function security.create_job_alert(text, jsonb, text) to authenticated;
grant execute on function security.delete_job_alert(uuid) to authenticated;
grant execute on function security.submit_employer_job(jsonb) to authenticated;
grant execute on function security.get_my_saved_jobs() to authenticated;
grant execute on function security.get_my_applications() to authenticated;
grant execute on function security.get_my_job_alerts() to authenticated;

grant execute on function api.set_job_saved(uuid, boolean) to authenticated;
grant execute on function api.save_external_job(
  text, text, text, text, text, text, timestamptz, text
) to authenticated;
grant execute on function api.remove_saved_job(uuid) to authenticated;
grant execute on function api.upsert_application(uuid, text, text, timestamptz) to authenticated;
grant execute on function api.record_external_application(
  text, text, text, text, text, text, text
) to authenticated;
grant execute on function api.update_application_status(uuid, text, text, date) to authenticated;
grant execute on function api.remove_application(uuid) to authenticated;
grant execute on function api.create_job_alert(text, jsonb, text) to authenticated;
grant execute on function api.create_job_alert(jsonb, text) to authenticated;
grant execute on function api.delete_job_alert(uuid) to authenticated;
grant execute on function api.remove_job_alert(uuid) to authenticated;
grant execute on function api.submit_employer_job(jsonb) to authenticated;
grant execute on function api.submit_employer_job(jsonb, boolean) to authenticated;
grant execute on function api.get_my_saved_jobs() to authenticated;
grant execute on function api.get_my_applications() to authenticated;
grant execute on function api.get_my_job_alerts() to authenticated;

comment on table ingest.raw_job_records is
  'Raw payloads are retained only when the source policy permits; never expose this schema.';
comment on column app.job_eligibility.provenance is
  'Inference must never be presented as source-provided or manually verified eligibility.';
comment on column private.applications.private_notes is
  'Private to the owning user; never include in analytics or shared caches.';

commit;
