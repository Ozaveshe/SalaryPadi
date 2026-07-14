begin;

do $$
begin
  create type app.source_policy_state as enum ('draft', 'enabled', 'disabled', 'expired');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.source_authority as enum (
    'direct_employer', 'employer_ats', 'licensed_partner', 'secondary_feed'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.job_lifecycle_state as enum ('open', 'checking', 'closed');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.apply_link_state as enum (
    'unchecked', 'healthy', 'broken', 'indeterminate'
  );
exception when duplicate_object then null;
end;
$$;

alter table app.job_sources
  add column if not exists policy_state app.source_policy_state not null default 'draft',
  add column if not exists authority app.source_authority not null default 'secondary_feed',
  add column if not exists allowed_fields text[] not null default '{}'::text[],
  add column if not exists policy_review_due_at timestamptz,
  add column if not exists raw_retention interval not null default interval '0 days',
  add column if not exists minimum_poll_interval interval,
  add column if not exists maximum_requests_per_day integer,
  add column if not exists required_dependencies text[] not null default '{}'::text[],
  add column if not exists missing_dependencies text[] not null default '{}'::text[],
  add column if not exists expected_daily_new_canonical integer,
  add column if not exists expected_capacity_evidence_ref text;

update app.job_sources
set authority = case source_type
      when 'direct_employer' then 'direct_employer'::app.source_authority
      when 'employer_ats' then 'employer_ats'::app.source_authority
      when 'partner_feed' then 'licensed_partner'::app.source_authority
      else 'secondary_feed'::app.source_authority
    end,
    policy_state = 'disabled',
    allowed_fields = '{}'::text[],
    policy_review_due_at = null,
    required_dependencies = array['source_policy_migration_review']::text[],
    missing_dependencies = array['source_policy_migration_review']::text[]
;

update app.job_sources
set policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'title', 'company', 'description', 'application_url', 'location',
      'source_url', 'work_arrangement', 'eligibility', 'salary', 'deadline',
      'valid_through', 'employment_type', 'engagement_type'
    ],
    policy_review_due_at = timestamptz '2026-08-10 00:00:00+00',
    raw_retention = interval '7 years',
    minimum_poll_interval = null,
    maximum_requests_per_day = null,
    required_dependencies = array[
      'moderated_employer_submission', 'authorization_attestation'
    ],
    missing_dependencies = '{}'::text[]
where adapter_key = 'salarypadi_employer_submissions';

-- The public API page and the newer general terms currently conflict on
-- republication. Fail closed until written confirmation resolves that conflict.
update app.job_sources
set status = 'paused',
    policy_state = 'disabled',
    authority = 'secondary_feed',
    allowed_fields = array[
      'id', 'url', 'title', 'company_name', 'category', 'tags', 'job_type',
      'publication_date', 'candidate_required_location', 'salary'
    ],
    terms_url = 'https://remotive.com/terms-of-use',
    terms_version = 'remotive-terms-conflict-reviewed-2026-07-14',
    terms_reviewed_at = timestamptz '2026-07-14 00:00:00+00',
    policy_review_due_at = timestamptz '2026-08-14 00:00:00+00',
    raw_retention = interval '1 day',
    refresh_interval = interval '6 hours',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    allow_public_listing = false,
    may_store_full_description = false,
    may_index_jobs = false,
    may_emit_jobposting_schema = false,
    may_email_jobs = false,
    required_dependencies = array['written_republication_confirmation'],
    missing_dependencies = array['written_republication_confirmation']
where adapter_key = 'remotive';

-- The authorization guard deliberately clears review timestamps when source
-- terms change. Record the completed conflict review only after that guarded
-- policy mutation; authorization remains revoked and the source stays paused.
update app.job_sources
set terms_reviewed_at = timestamptz '2026-07-14 00:00:00+00'
where adapter_key = 'remotive';

update app.job_sources
set status = 'paused'
where status = 'active' and policy_state <> 'enabled';

alter table app.job_sources
  drop constraint if exists job_sources_supply_policy_shape;
alter table app.job_sources
  add constraint job_sources_supply_policy_shape check (
    authority is not null
    and cardinality(allowed_fields) <= 80
    and cardinality(required_dependencies) <= 30
    and cardinality(missing_dependencies) <= 30
    and missing_dependencies <@ required_dependencies
    and raw_retention between interval '0 days' and interval '10 years'
    and (minimum_poll_interval is null or minimum_poll_interval >= interval '15 minutes')
    and (maximum_requests_per_day is null or maximum_requests_per_day between 1 and 10000)
    and (expected_daily_new_canonical is null or expected_daily_new_canonical >= 0)
    and (
      (expected_daily_new_canonical is null and expected_capacity_evidence_ref is null)
      or (
        expected_daily_new_canonical is not null
        and char_length(expected_capacity_evidence_ref) between 3 and 500
      )
    )
  );

create or replace function security.job_source_policy_is_runnable(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.job_sources source
    where source.id = p_source_id
      and source.status = 'active'
      and source.policy_state = 'enabled'
      and source.terms_url is not null
      and source.terms_reviewed_at is not null
      and source.authorization_basis is not null
      and source.authorization_evidence_ref is not null
      and source.authorization_reviewed_at is not null
      and source.authorization_revoked_at is null
      and source.allowed_fields <> '{}'::text[]
      and source.policy_review_due_at > statement_timestamp()
      and (source.authorization_expires_at is null
        or source.authorization_expires_at > statement_timestamp())
      and source.missing_dependencies = '{}'::text[]
  );
$$;

revoke all on function security.job_source_policy_is_runnable(uuid)
from public, anon, authenticated, service_role;

create or replace function security.enforce_job_source_supply_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if regexp_replace(new.adapter_key, '_', '', 'g') in (
    'linkedin', 'indeed', 'glassdoor', 'jobberman', 'myjobmag',
    'brightermonday', 'googlejobs', 'workday'
  ) then
    raise exception using errcode = '23514', message = 'forbidden job source adapter';
  end if;

  if new.status = 'active' then
    if new.policy_state <> 'enabled'
       or new.terms_reviewed_at is null
       or new.authorization_basis is null
       or new.authorization_evidence_ref is null
       or new.authorization_reviewed_at is null
       or new.authorization_revoked_at is not null
       or new.allowed_fields = '{}'::text[]
       or new.policy_review_due_at is null
       or new.policy_review_due_at <= statement_timestamp()
       or new.missing_dependencies <> '{}'::text[]
       or (new.attribution_required and nullif(btrim(new.attribution_text), '') is null)
       or (new.may_store_full_description and not ('description' = any(new.allowed_fields)))
       or (new.minimum_poll_interval is not null
         and new.refresh_interval < new.minimum_poll_interval)
       or (new.may_emit_jobposting_schema and not new.may_index_jobs) then
      raise exception using errcode = '23514',
        message = 'enabled source requires complete current rights policy';
    end if;
  end if;

  if new.adapter_key in ('remotive', 'jobicy') and (
    new.may_index_jobs or new.may_emit_jobposting_schema
  ) then
    raise exception using errcode = '23514',
      message = 'secondary feed may not be submitted to search job platforms';
  end if;
  return new;
end;
$$;

drop trigger if exists job_sources_supply_policy_guard on app.job_sources;
create trigger job_sources_supply_policy_guard
before insert or update on app.job_sources
for each row execute function security.enforce_job_source_supply_policy();

create table if not exists private.job_source_dependencies (
  source_id uuid not null references app.job_sources(id) on delete cascade,
  dependency_key text not null,
  state text not null default 'missing',
  evidence_reference text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, dependency_key),
  constraint job_source_dependencies_key check (
    dependency_key ~ '^[a-z0-9_]{2,100}$'
  ),
  constraint job_source_dependencies_state check (
    state in ('missing', 'verified', 'expired', 'revoked')
  ),
  constraint job_source_dependencies_verified_evidence check (
    state <> 'verified' or (
      evidence_reference is not null and reviewed_at is not null
    )
  )
);

alter table private.job_source_dependencies enable row level security;
alter table private.job_source_dependencies force row level security;
revoke all on private.job_source_dependencies
from public, anon, authenticated, service_role;

create or replace function security.sync_job_source_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid := coalesce(new.source_id, old.source_id);
  v_missing text[];
  v_expired boolean;
begin
  select coalesce(array_agg(required.dependency_key order by required.dependency_key)
      filter (where dependency.state is distinct from 'verified'
        or dependency.evidence_reference is null
        or dependency.reviewed_at is null), '{}'::text[]),
    coalesce(bool_or(dependency.state in ('expired', 'revoked')), false)
  into v_missing, v_expired
  from app.job_sources source
  cross join lateral unnest(source.required_dependencies) required(dependency_key)
  left join private.job_source_dependencies dependency
    on dependency.source_id = source.id
   and dependency.dependency_key = required.dependency_key
  where source.id = v_source_id;

  update app.job_sources source
  set missing_dependencies = coalesce(v_missing, '{}'::text[]),
      status = case
        when coalesce(v_missing, '{}'::text[]) <> '{}'::text[]
          and source.status = 'active' then 'paused'::app.source_status
        else source.status end,
      policy_state = case
        when v_expired and source.policy_state = 'enabled'
          then 'expired'::app.source_policy_state
        else source.policy_state end,
      updated_at = clock_timestamp()
  where source.id = v_source_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select source.id, dependency,
  case when dependency = any(source.missing_dependencies)
    then 'missing' else 'verified' end,
  case when dependency = any(source.missing_dependencies)
    then null else source.authorization_evidence_ref end,
  case when dependency = any(source.missing_dependencies)
    then null else source.authorization_reviewed_at end
from app.job_sources source
cross join lateral unnest(source.required_dependencies) dependency
on conflict (source_id, dependency_key) do nothing;

drop trigger if exists job_source_dependencies_sync
  on private.job_source_dependencies;
create trigger job_source_dependencies_sync
after insert or update or delete on private.job_source_dependencies
for each row execute function security.sync_job_source_dependencies();

-- Rebind the runnable predicate after the dependency ledger exists. Missing,
-- expired, or revoked evidence always wins over mutable source flags.
create or replace function security.job_source_policy_is_runnable(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.job_sources source
    where source.id = p_source_id
      and source.status = 'active'
      and source.policy_state = 'enabled'
      and source.terms_url is not null
      and source.terms_reviewed_at is not null
      and source.authorization_basis is not null
      and source.authorization_evidence_ref is not null
      and source.authorization_reviewed_at is not null
      and source.authorization_revoked_at is null
      and source.allowed_fields <> '{}'::text[]
      and source.policy_review_due_at > statement_timestamp()
      and (source.authorization_expires_at is null
        or source.authorization_expires_at > statement_timestamp())
      and source.missing_dependencies = '{}'::text[]
      and not exists (
        select 1
        from unnest(source.required_dependencies) required(dependency_key)
        left join private.job_source_dependencies dependency
          on dependency.source_id = source.id
         and dependency.dependency_key = required.dependency_key
        where dependency.state is distinct from 'verified'
          or dependency.evidence_reference is null
          or dependency.reviewed_at is null
      )
  );
$$;

create table if not exists private.job_supply_targets (
  id boolean primary key default true check (id),
  target_daily_new_canonical integer not null default 200,
  pilot_days integer not null default 14,
  updated_at timestamptz not null default now(),
  constraint job_supply_target_positive check (
    target_daily_new_canonical > 0 and pilot_days between 1 and 90
  )
);

insert into private.job_supply_targets (id, target_daily_new_canonical, pilot_days)
values (true, 200, 14)
on conflict (id) do update
set target_daily_new_canonical = excluded.target_daily_new_canonical,
    pilot_days = excluded.pilot_days;

alter table private.job_supply_targets enable row level security;
alter table private.job_supply_targets force row level security;
revoke all on private.job_supply_targets from public, anon, authenticated;

alter table app.jobs
  add column if not exists lifecycle_state app.job_lifecycle_state not null default 'open',
  add column if not exists lifecycle_reason text,
  add column if not exists manual_reconfirmed_at timestamptz,
  add column if not exists apply_link_state app.apply_link_state not null default 'unchecked',
  add column if not exists apply_link_checked_at timestamptz,
  add column if not exists apply_check_claimed_at timestamptz;

update app.jobs
set lifecycle_state = case
      when status in ('expired', 'removed', 'rejected') then 'closed'::app.job_lifecycle_state
      else 'open'::app.job_lifecycle_state
    end,
    manual_reconfirmed_at = coalesce(last_verified_at, last_checked_at, created_at);

alter table ingest.raw_job_records
  add column if not exists first_successful_absence_at timestamptz,
  add column if not exists last_successful_absence_at timestamptz;

alter table app.job_eligibility
  add column if not exists region_wording text,
  add column if not exists physical_location_requirement text,
  add column if not exists arrangement_evidence text;

create table if not exists ingest.job_source_occurrences (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app.job_sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  external_source_id text not null,
  observation_key text not null,
  observed_at timestamptz not null,
  source_url text not null,
  application_url text,
  content_hash text not null,
  dedup_fingerprint text,
  allowed_payload jsonb not null default '{}'::jsonb,
  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, external_source_id, observation_key),
  constraint job_source_occurrence_external check (
    char_length(external_source_id) between 1 and 300
  ),
  constraint job_source_occurrence_observation check (
    char_length(observation_key) between 3 and 200
  ),
  constraint job_source_occurrence_source_url check (source_url ~* '^https://'),
  constraint job_source_occurrence_application_url check (
    application_url is null or application_url ~* '^https://'
  ),
  constraint job_source_occurrence_hash check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint job_source_occurrence_fingerprint check (
    dedup_fingerprint is null or dedup_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint job_source_occurrence_payload check (
    jsonb_typeof(allowed_payload) = 'object'
    and octet_length(allowed_payload::text) <= 1048576
  )
);

create index if not exists job_source_occurrences_source_observed
  on ingest.job_source_occurrences (source_id, observed_at desc);
create index if not exists job_source_occurrences_fingerprint
  on ingest.job_source_occurrences (dedup_fingerprint, observed_at desc)
  where dedup_fingerprint is not null;

alter table ingest.job_source_occurrences enable row level security;
alter table ingest.job_source_occurrences force row level security;
revoke all on ingest.job_source_occurrences from public, anon, authenticated;

drop trigger if exists job_source_occurrences_append_only
  on ingest.job_source_occurrences;
create or replace function security.protect_job_source_occurrence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('salarypadi.retention_purge', true) = 'on'
     and old.retention_expires_at is not null
     and old.retention_expires_at <= clock_timestamp() then
    return old;
  end if;
  raise exception using errcode = '42501',
    message = 'source occurrence history is append-only until policy retention expires';
end;
$$;

create trigger job_source_occurrences_append_only
before update or delete on ingest.job_source_occurrences
for each row execute function security.protect_job_source_occurrence_mutation();

create table if not exists ingest.job_occurrence_links (
  occurrence_id uuid primary key references ingest.job_source_occurrences(id) on delete restrict,
  source_job_id uuid not null references app.jobs(id) on delete restrict,
  canonical_job_id uuid not null references app.jobs(id) on delete restrict,
  match_kind text not null,
  authority app.source_authority not null,
  linked_at timestamptz not null default now(),
  constraint job_occurrence_links_match check (
    match_kind in ('source_identity', 'exact', 'reviewed_fuzzy', 'manual')
  )
);

create index if not exists job_occurrence_links_canonical
  on ingest.job_occurrence_links (canonical_job_id, linked_at desc);
alter table ingest.job_occurrence_links enable row level security;
alter table ingest.job_occurrence_links force row level security;
revoke all on ingest.job_occurrence_links from public, anon, authenticated;

create table if not exists audit.canonical_job_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  canonical_job_id uuid not null references app.jobs(id) on delete restrict,
  source_job_id uuid not null references app.jobs(id) on delete restrict,
  source_id uuid not null references app.job_sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint canonical_job_events_type check (
    event_type in ('canonical_created', 'authority_changed', 'exact_linked', 'closed')
  ),
  constraint canonical_job_events_evidence check (
    jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 8192
  )
);

alter table audit.canonical_job_events enable row level security;
alter table audit.canonical_job_events force row level security;
revoke all on audit.canonical_job_events from public, anon, authenticated;
drop trigger if exists canonical_job_events_append_only on audit.canonical_job_events;
create trigger canonical_job_events_append_only
before update or delete on audit.canonical_job_events
for each row execute function security.reject_mutation();

alter table ingest.import_runs
  add column if not exists canonical_created_count integer;
alter table ingest.import_runs
  drop constraint if exists import_runs_canonical_count_nonnegative;
alter table ingest.import_runs
  add constraint import_runs_canonical_count_nonnegative check (
    canonical_created_count is null or canonical_created_count >= 0
  );

create or replace function security.guard_raw_job_source_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source app.job_sources%rowtype;
  v_key text;
  v_allowed boolean;
begin
  select * into v_source
  from app.job_sources source
  where source.id = new.source_id;

  if not found or not security.job_source_policy_is_runnable(new.source_id) then
    raise exception using errcode = '42501',
      message = 'current enabled source rights policy required';
  end if;

  new.retention_expires_at := case
    when v_source.raw_retention = interval '0 days' then new.last_seen_at
    else new.last_seen_at + v_source.raw_retention end;

  -- Raw payload storage is checked again in the database. This prevents a
  -- newly added adapter or a malformed worker configuration from persisting a
  -- provider field that was not named in the reviewed source policy.
  for v_key in
    select payload_key.key
    from jsonb_object_keys(
      coalesce(new.raw_payload, '{}'::jsonb)
    ) as payload_key(key)
  loop
    v_allowed := v_key = any(v_source.allowed_fields)
      or (v_key = 'external_id' and (
        'id' = any(v_source.allowed_fields)
        or 'external_id' = any(v_source.allowed_fields)
      ))
      or (v_key = 'source_url' and (
        'url' = any(v_source.allowed_fields)
        or 'source_url' = any(v_source.allowed_fields)
      ))
      or (v_key = 'original_employer_url' and (
        'url' = any(v_source.allowed_fields)
        or 'application_url' = any(v_source.allowed_fields)
      ))
      or (v_key = 'work_arrangement' and (
        'location' = any(v_source.allowed_fields)
        or 'jobGeo' = any(v_source.allowed_fields)
      ))
      or (v_key = 'experience_level' and (
        'jobLevel' = any(v_source.allowed_fields)
        or 'employment_type' = any(v_source.allowed_fields)
      ))
      or (v_key = 'posted_at' and (
        'publication_date' = any(v_source.allowed_fields)
        or 'pubDate' = any(v_source.allowed_fields)
      ))
      or (v_key = 'valid_through' and (
        'deadline' = any(v_source.allowed_fields)
        or 'closing_date' = any(v_source.allowed_fields)
      ))
      or (v_key = 'locations' and (
        'location' = any(v_source.allowed_fields)
        or 'jobGeo' = any(v_source.allowed_fields)
        or 'country' = any(v_source.allowed_fields)
      ))
      or (v_key in ('description_text', 'requirements_text', 'benefits_text')
        and v_source.may_store_full_description
        and 'description' = any(v_source.allowed_fields));

    if not v_allowed then
      raise exception using errcode = '42501',
        message = 'raw source field is not permitted by current policy',
        detail = 'field=' || v_key;
    end if;
    if v_key = 'eligibility' and (
      jsonb_typeof(new.raw_payload -> v_key) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(new.raw_payload -> v_key) nested(key)
        where nested.key not in (
          'scope', 'evidence_text', 'provenance', 'countries',
          'required_timezone_overlap', 'work_authorization_requirement',
          'visa_sponsorship', 'physical_location_requirement',
          'arrangement_evidence', 'region_wording'
        )
      )
    ) then
      raise exception using errcode = '42501',
        message = 'raw eligibility field is not permitted by current policy';
    end if;
    if v_key = 'eligibility'
       and (new.raw_payload #> '{eligibility,countries}') is not null
       and (
         jsonb_typeof(new.raw_payload #> '{eligibility,countries}') <> 'array'
         or exists (
           select 1
           from jsonb_array_elements(
             new.raw_payload #> '{eligibility,countries}'
           ) country(value)
           where jsonb_typeof(country.value) <> 'object'
         )
         or exists (
           select 1
           from (
             select item.value
             from jsonb_array_elements(
               new.raw_payload #> '{eligibility,countries}'
             ) item(value)
             where jsonb_typeof(item.value) = 'object'
           ) country
           cross join lateral jsonb_object_keys(country.value) nested(key)
           where nested.key not in ('country_code', 'rule')
         )
       ) then
      raise exception using errcode = '42501',
        message = 'raw eligibility country field is not permitted by current policy';
    end if;
    if v_key = 'locations' and (
      jsonb_typeof(new.raw_payload -> v_key) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(new.raw_payload -> v_key) location(value)
        where jsonb_typeof(location.value) <> 'object'
      )
      or exists (
        select 1
        from (
          select item.value
          from jsonb_array_elements(new.raw_payload -> v_key) item(value)
          where jsonb_typeof(item.value) = 'object'
        ) location
        cross join lateral jsonb_object_keys(location.value) nested(key)
        where nested.key not in (
            'country_code', 'city', 'region', 'is_primary'
          )
      )
    ) then
      raise exception using errcode = '42501',
        message = 'raw location field is not permitted by current policy';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists raw_job_source_policy_guard on ingest.raw_job_records;
create trigger raw_job_source_policy_guard
before insert or update on ingest.raw_job_records
for each row execute function security.guard_raw_job_source_policy();

create or replace function security.record_raw_job_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention interval;
begin
  if new.import_run_id is null then return new; end if;
  select source.raw_retention into v_retention
  from app.job_sources source where source.id = new.source_id;

  insert into ingest.job_source_occurrences (
    source_id, import_run_id, external_source_id, observation_key,
    observed_at, source_url, application_url, content_hash,
    dedup_fingerprint, allowed_payload, retention_expires_at
  ) values (
    new.source_id, new.import_run_id, new.external_source_id,
    'run:' || new.import_run_id::text, new.last_seen_at, new.source_url,
    coalesce(new.raw_payload ->> 'application_url', new.original_employer_url, new.source_url),
    new.content_hash, new.dedup_fingerprint, coalesce(new.raw_payload, '{}'::jsonb),
    case when v_retention = interval '0 days' then new.last_seen_at
      else new.last_seen_at + v_retention end
  ) on conflict (source_id, external_source_id, observation_key) do nothing;
  return new;
end;
$$;

drop trigger if exists raw_job_record_occurrence on ingest.raw_job_records;
create trigger raw_job_record_occurrence
after insert or update on ingest.raw_job_records
for each row execute function security.record_raw_job_occurrence();

create or replace function security.record_direct_job_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source app.job_sources%rowtype;
  v_payload jsonb;
  v_hash text;
begin
  select * into v_source from app.job_sources where id = new.source_id;
  if v_source.source_type not in ('direct_employer', 'manual') then return new; end if;
  if new.status = 'published' and not security.job_source_policy_is_runnable(new.source_id) then
    raise exception using errcode = '42501',
      message = 'published direct job requires current source rights policy';
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'title', new.title,
    'application_url', new.application_url,
    'source_url', new.source_url,
    'work_arrangement', new.work_arrangement,
    'employment_type', new.employment_type,
    'engagement_type', new.engagement_type,
    'salary', jsonb_strip_nulls(jsonb_build_object(
      'minimum', new.salary_min,
      'maximum', new.salary_max,
      'currency', new.currency_code,
      'period', new.pay_period,
      'gross_net', new.gross_net
    )),
    'valid_through', new.valid_through
  ));
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  insert into ingest.job_source_occurrences (
    source_id, external_source_id, observation_key, observed_at, source_url,
    application_url, content_hash, dedup_fingerprint, allowed_payload,
    retention_expires_at
  ) values (
    new.source_id, new.external_source_id,
    'direct:' || extract(epoch from new.updated_at)::numeric::text,
    new.updated_at, new.source_url, new.application_url, v_hash,
    new.dedup_fingerprint, v_payload,
    case when v_source.raw_retention = interval '0 days' then new.updated_at
      else new.updated_at + v_source.raw_retention end
  ) on conflict (source_id, external_source_id, observation_key) do nothing;
  return new;
end;
$$;

drop trigger if exists a_job_direct_occurrence on app.jobs;
drop trigger if exists a_job_direct_occurrence_update on app.jobs;
create trigger a_job_direct_occurrence
after insert on app.jobs
for each row execute function security.record_direct_job_occurrence();
create trigger a_job_direct_occurrence_update
after update of title, application_url, source_url, work_arrangement,
  employment_type, engagement_type, valid_through, last_verified_at,
  manual_reconfirmed_at, salary_min, salary_max, currency_code, pay_period,
  gross_net on app.jobs
for each row execute function security.record_direct_job_occurrence();

create or replace function security.reconcile_exact_job_canonical()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_best_job_id uuid;
  v_best_source_id uuid;
  v_import_run_id uuid;
  v_count integer;
  v_exact_destination text;
begin
  if pg_trigger_depth() > 1 or new.dedup_fingerprint is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.dedup_fingerprint, 0));

  -- An identical HTTPS destination (case-folded host, fragment removed, and
  -- one trailing slash removed) is also exact evidence. Query parameters are
  -- deliberately retained because they may carry the employer posting ID.
  v_exact_destination := lower(regexp_replace(
    regexp_replace(btrim(new.application_url), '#.*$', ''), '/$', ''
  ));

  select job.id, job.source_id, count(*) over ()::integer
    into v_best_job_id, v_best_source_id, v_count
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where (
      job.dedup_fingerprint = new.dedup_fingerprint
      or lower(regexp_replace(
        regexp_replace(btrim(job.application_url), '#.*$', ''), '/$', ''
      )) = v_exact_destination
    )
    and job.status not in ('removed', 'rejected')
  order by case source.authority
      when 'direct_employer' then 400
      when 'employer_ats' then 300
      when 'licensed_partner' then 200
      else 100 end desc,
    job.created_at, job.id
  limit 1;
  if v_best_job_id is null then return new; end if;

  update app.jobs job
  set canonical_job_id = case when job.id = v_best_job_id then null else v_best_job_id end
  where (
      job.dedup_fingerprint = new.dedup_fingerprint
      or lower(regexp_replace(
        regexp_replace(btrim(job.application_url), '#.*$', ''), '/$', ''
      )) = v_exact_destination
    )
    and job.status not in ('removed', 'rejected')
    and job.canonical_job_id is distinct from
      case when job.id = v_best_job_id then null else v_best_job_id end;

  insert into ingest.job_occurrence_links (
    occurrence_id, source_job_id, canonical_job_id, match_kind, authority
  )
  select occurrence.id, job.id, v_best_job_id,
    case when job.id = v_best_job_id then 'source_identity' else 'exact' end,
    source.authority
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  join ingest.job_source_occurrences occurrence
    on occurrence.source_id = job.source_id
   and occurrence.external_source_id = job.external_source_id
  where (
      job.dedup_fingerprint = new.dedup_fingerprint
      or lower(regexp_replace(
        regexp_replace(btrim(job.application_url), '#.*$', ''), '/$', ''
      )) = v_exact_destination
    )
  on conflict (occurrence_id) do update
  set canonical_job_id = excluded.canonical_job_id,
      match_kind = excluded.match_kind,
      authority = excluded.authority,
      linked_at = clock_timestamp();

  select occurrence.import_run_id into v_import_run_id
  from ingest.job_source_occurrences occurrence
  where occurrence.source_id = new.source_id
    and occurrence.external_source_id = new.external_source_id
  order by occurrence.observed_at desc limit 1;

  if v_count = 1 then
    insert into audit.canonical_job_events (
      event_key, event_type, canonical_job_id, source_job_id, source_id,
      import_run_id, evidence
    ) values (
      'canonical_created:' || new.dedup_fingerprint,
      'canonical_created', v_best_job_id, new.id, new.source_id,
      v_import_run_id, jsonb_build_object('fingerprint', new.dedup_fingerprint)
    ) on conflict (event_key) do nothing;
  elsif v_best_job_id = new.id then
    insert into audit.canonical_job_events (
      event_key, event_type, canonical_job_id, source_job_id, source_id,
      import_run_id, evidence
    ) values (
      'authority_changed:' || new.dedup_fingerprint || ':' || new.id::text,
      'authority_changed', v_best_job_id, new.id, new.source_id,
      v_import_run_id, jsonb_build_object('fingerprint', new.dedup_fingerprint)
    ) on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists b_job_exact_canonical on app.jobs;
create trigger b_job_exact_canonical
after insert or update of dedup_fingerprint, source_id, status on app.jobs
for each row execute function security.reconcile_exact_job_canonical();

-- Establish occurrence provenance for direct/manual jobs that predate this
-- ledger. These are baseline observations, not canonical-created events, so
-- they cannot inflate pilot yield or the 200/day dashboard metric.
insert into ingest.job_source_occurrences (
  source_id, external_source_id, observation_key, observed_at, source_url,
  application_url, content_hash, dedup_fingerprint, allowed_payload,
  retention_expires_at
)
select job.source_id, job.external_source_id,
  'baseline:' || job.id::text,
  coalesce(job.last_verified_at, job.last_checked_at, job.created_at),
  job.source_url, job.application_url,
  encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'title', job.title,
    'application_url', job.application_url,
    'source_url', job.source_url,
    'work_arrangement', job.work_arrangement,
    'employment_type', job.employment_type,
    'engagement_type', job.engagement_type,
    'salary', jsonb_strip_nulls(jsonb_build_object(
      'minimum', job.salary_min,
      'maximum', job.salary_max,
      'currency', job.currency_code,
      'period', job.pay_period,
      'gross_net', job.gross_net
    )),
    'valid_through', job.valid_through
  ))::text, 'UTF8'), 'sha256'), 'hex'),
  job.dedup_fingerprint,
  jsonb_strip_nulls(jsonb_build_object(
    'title', job.title,
    'application_url', job.application_url,
    'source_url', job.source_url,
    'work_arrangement', job.work_arrangement,
    'employment_type', job.employment_type,
    'engagement_type', job.engagement_type,
    'salary', jsonb_strip_nulls(jsonb_build_object(
      'minimum', job.salary_min,
      'maximum', job.salary_max,
      'currency', job.currency_code,
      'period', job.pay_period,
      'gross_net', job.gross_net
    )),
    'valid_through', job.valid_through
  )),
  case when source.raw_retention = interval '0 days'
    then coalesce(job.last_verified_at, job.last_checked_at, job.created_at)
    else coalesce(job.last_verified_at, job.last_checked_at, job.created_at)
      + source.raw_retention end
from app.jobs job
join app.job_sources source on source.id = job.source_id
where source.source_type in ('direct_employer', 'manual')
on conflict (source_id, external_source_id, observation_key) do nothing;

insert into ingest.job_occurrence_links (
  occurrence_id, source_job_id, canonical_job_id, match_kind, authority
)
select occurrence.id, job.id, coalesce(job.canonical_job_id, job.id),
  case when job.canonical_job_id is null
    then 'source_identity' else 'exact' end,
  source.authority
from app.jobs job
join app.job_sources source on source.id = job.source_id
join ingest.job_source_occurrences occurrence
  on occurrence.source_id = job.source_id
 and occurrence.external_source_id = job.external_source_id
where source.source_type in ('direct_employer', 'manual')
on conflict (occurrence_id) do nothing;

create or replace function security.track_successful_job_absence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.successful_omission_count = 0 then
    new.first_successful_absence_at := null;
    new.last_successful_absence_at := null;
    update app.jobs set lifecycle_state = 'open', lifecycle_reason = 'source_seen'
    where source_id = new.source_id and external_source_id = new.external_source_id
      and status not in ('expired', 'removed', 'rejected');
  elsif new.successful_omission_count > old.successful_omission_count then
    if old.first_successful_absence_at is null then
      new.successful_omission_count := 1;
      new.first_successful_absence_at := clock_timestamp();
      new.last_successful_absence_at := clock_timestamp();
    elsif clock_timestamp() - old.first_successful_absence_at < interval '30 minutes' then
      new.successful_omission_count := 1;
      new.first_successful_absence_at := old.first_successful_absence_at;
      new.last_successful_absence_at := clock_timestamp();
    else
      new.first_successful_absence_at := old.first_successful_absence_at;
      new.last_successful_absence_at := clock_timestamp();
    end if;
    update app.jobs set lifecycle_state = 'checking',
      lifecycle_reason = 'successful_source_absence'
    where source_id = new.source_id and external_source_id = new.external_source_id
      and status not in ('expired', 'removed', 'rejected');
  end if;
  return new;
end;
$$;

drop trigger if exists raw_job_absence_clock on ingest.raw_job_records;
create trigger raw_job_absence_clock
before update of successful_omission_count on ingest.raw_job_records
for each row execute function security.track_successful_job_absence();

create or replace function security.sync_job_lifecycle_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('expired', 'removed', 'rejected') then
    new.lifecycle_state := 'closed';
    new.lifecycle_reason := coalesce(new.lifecycle_reason, 'job_status_' || new.status::text);
  elsif old.status in ('expired', 'removed', 'rejected') and
        new.status in ('draft', 'pending', 'published') then
    new.lifecycle_state := 'open';
    new.lifecycle_reason := 'source_seen';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_lifecycle_state_sync on app.jobs;
create trigger jobs_lifecycle_state_sync
before update of status on app.jobs
for each row execute function security.sync_job_lifecycle_state();

create table if not exists app.job_salary_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.jobs(id) on delete cascade,
  occurrence_id uuid references ingest.job_source_occurrences(id) on delete set null,
  source_text text not null,
  original_currency text,
  original_minimum numeric(18,2),
  original_maximum numeric(18,2),
  original_period app.pay_period,
  location_scope text,
  gross_net app.gross_net_classification not null default 'unspecified',
  derived_annual_minimum numeric(18,2),
  derived_annual_maximum numeric(18,2),
  derived_monthly_minimum numeric(18,2),
  derived_monthly_maximum numeric(18,2),
  derivation_assumptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, occurrence_id),
  constraint job_salary_evidence_currency check (
    original_currency is null or original_currency ~ '^[A-Z]{3}$'
  ),
  constraint job_salary_evidence_source_text check (
    char_length(source_text) between 1 and 2000
  ),
  constraint job_salary_evidence_amounts check (
    (original_minimum is null or original_minimum >= 0)
    and (original_maximum is null or original_maximum >= original_minimum)
    and (derived_annual_minimum is null or derived_annual_minimum >= 0)
    and (derived_annual_maximum is null or derived_annual_maximum >= derived_annual_minimum)
    and (derived_monthly_minimum is null or derived_monthly_minimum >= 0)
    and (derived_monthly_maximum is null or derived_monthly_maximum >= derived_monthly_minimum)
  ),
  constraint job_salary_evidence_assumptions check (
    jsonb_typeof(derivation_assumptions) = 'array'
    and octet_length(derivation_assumptions::text) <= 4000
  )
);

alter table app.job_salary_evidence enable row level security;
alter table app.job_salary_evidence force row level security;
revoke all on app.job_salary_evidence from public, anon, authenticated;

create or replace function security.record_direct_job_salary_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type app.source_type;
  v_occurrence_id uuid;
  v_factor numeric;
  v_assumptions jsonb := '[]'::jsonb;
begin
  select source.source_type into v_source_type
  from app.job_sources source where source.id = new.source_id;
  if v_source_type not in ('direct_employer', 'manual')
     or (new.salary_min is null and new.salary_max is null) then
    return new;
  end if;

  select occurrence.id into v_occurrence_id
  from ingest.job_source_occurrences occurrence
  where occurrence.source_id = new.source_id
    and occurrence.external_source_id = new.external_source_id
  order by occurrence.observed_at desc, occurrence.created_at desc
  limit 1;

  v_factor := case new.pay_period
    when 'hourly' then 2080
    when 'daily' then 260
    when 'weekly' then 52
    when 'monthly' then 12
    when 'annual' then 1
    else null end;
  if v_factor is not null then
    v_assumptions := jsonb_build_array(case new.pay_period
      when 'hourly' then 'hourly multiplied by 40 hours/week and 52 weeks/year'
      when 'daily' then 'daily multiplied by 5 days/week and 52 weeks/year'
      when 'weekly' then 'weekly multiplied by 52 weeks/year'
      when 'monthly' then 'monthly multiplied by 12 months/year'
      else 'source period is annual' end);
  end if;

  insert into app.job_salary_evidence (
    job_id, occurrence_id, source_text, original_currency,
    original_minimum, original_maximum, original_period, gross_net,
    derived_annual_minimum, derived_annual_maximum,
    derived_monthly_minimum, derived_monthly_maximum,
    derivation_assumptions
  ) values (
    new.id, v_occurrence_id,
    jsonb_strip_nulls(jsonb_build_object(
      'currency', new.currency_code, 'minimum', new.salary_min,
      'maximum', new.salary_max, 'period', new.pay_period,
      'gross_net', new.gross_net
    ))::text,
    new.currency_code, new.salary_min, new.salary_max, new.pay_period,
    new.gross_net,
    case when v_factor is null then null else new.salary_min * v_factor end,
    case when v_factor is null then null else new.salary_max * v_factor end,
    case when v_factor is null then null else new.salary_min * v_factor / 12 end,
    case when v_factor is null then null else new.salary_max * v_factor / 12 end,
    v_assumptions
  )
  on conflict (job_id, occurrence_id) do update
  set source_text = excluded.source_text,
      original_currency = excluded.original_currency,
      original_minimum = excluded.original_minimum,
      original_maximum = excluded.original_maximum,
      original_period = excluded.original_period,
      gross_net = excluded.gross_net,
      derived_annual_minimum = excluded.derived_annual_minimum,
      derived_annual_maximum = excluded.derived_annual_maximum,
      derived_monthly_minimum = excluded.derived_monthly_minimum,
      derived_monthly_maximum = excluded.derived_monthly_maximum,
      derivation_assumptions = excluded.derivation_assumptions;
  return new;
end;
$$;

drop trigger if exists c_job_direct_salary_evidence on app.jobs;
create trigger c_job_direct_salary_evidence
after insert or update of salary_min, salary_max, currency_code, pay_period,
  gross_net on app.jobs
for each row execute function security.record_direct_job_salary_evidence();

create or replace function security.fill_job_salary_location_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.job_salary_evidence evidence
  set location_scope = concat_ws(', ', new.city, new.region, new.country_code)
  where evidence.job_id = new.job_id
    and nullif(concat_ws(', ', new.city, new.region, new.country_code), '') is not null;
  return new;
end;
$$;

drop trigger if exists job_salary_location_scope on app.job_locations;
create trigger job_salary_location_scope
after insert or update of country_code, city, region on app.job_locations
for each row execute function security.fill_job_salary_location_scope();

create or replace function security.record_direct_job_eligibility_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission private.employer_job_submissions%rowtype;
begin
  select submission.* into v_submission
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  join private.employer_job_submissions submission
    on submission.id::text = job.external_source_id
  where job.id = new.job_id
    and source.adapter_key = 'salarypadi_employer_submissions';
  if not found then return new; end if;

  update app.job_eligibility eligibility
  set region_wording = concat_ws('; ',
        case when v_submission.included_countries is not null
          then 'Included: ' || v_submission.included_countries end,
        case when v_submission.excluded_countries is not null
          then 'Excluded: ' || v_submission.excluded_countries end
      ),
      physical_location_requirement = v_submission.location_text,
      arrangement_evidence = v_submission.engagement_type::text
  where eligibility.job_id = new.job_id;

  delete from app.job_eligibility_countries country
  where country.job_id = new.job_id;
  insert into app.job_eligibility_countries (job_id, country_code, rule)
  select distinct new.job_id, market.iso2, input.rule::app.country_rule
  from (
    select trim(parts.token) as token, 'include'::text as rule
    from regexp_split_to_table(
      coalesce(v_submission.included_countries, ''), '[,;]'
    ) as parts(token)
    union all
    select trim(parts.token) as token, 'exclude'::text as rule
    from regexp_split_to_table(
      coalesce(v_submission.excluded_countries, ''), '[,;]'
    ) as parts(token)
  ) input
  join app.market_countries market
    on upper(input.token) = market.iso2
    or lower(input.token) = lower(market.name)
  where input.token <> ''
  on conflict do nothing;

  if new.scope = 'nigeria' then
    insert into app.job_eligibility_countries (job_id, country_code, rule)
    values (new.job_id, 'NG', 'include')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists direct_job_eligibility_evidence on app.job_eligibility;
create trigger direct_job_eligibility_evidence
after insert or update of scope, required_timezone_overlap,
  work_authorization_requirement, visa_sponsorship, evidence_text
on app.job_eligibility
for each row execute function security.record_direct_job_eligibility_evidence();

revoke all on function security.enforce_job_source_supply_policy() from public, anon, authenticated, service_role;
revoke all on function security.sync_job_source_dependencies() from public, anon, authenticated, service_role;
revoke all on function security.protect_job_source_occurrence_mutation() from public, anon, authenticated, service_role;
revoke all on function security.guard_raw_job_source_policy() from public, anon, authenticated, service_role;
revoke all on function security.record_raw_job_occurrence() from public, anon, authenticated, service_role;
revoke all on function security.record_direct_job_occurrence() from public, anon, authenticated, service_role;
revoke all on function security.reconcile_exact_job_canonical() from public, anon, authenticated, service_role;
revoke all on function security.track_successful_job_absence() from public, anon, authenticated, service_role;
revoke all on function security.fill_job_salary_location_scope() from public, anon, authenticated, service_role;
revoke all on function security.record_direct_job_eligibility_evidence() from public, anon, authenticated, service_role;

commit;
