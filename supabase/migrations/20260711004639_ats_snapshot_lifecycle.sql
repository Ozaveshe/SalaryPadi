begin;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values (
  'ats_source_sync', interval '6 hours', interval '14 hours',
  'Oza - founder and interim ATS source owner'
)
on conflict (task_key) do update
set expected_interval = excluded.expected_interval,
    stale_after = excluded.stale_after,
    owner_label = excluded.owner_label,
    enabled = true,
    updated_at = clock_timestamp();

-- Durable state for complete ATS snapshots. A missing job is not evidence of
-- closure until two independently successful, complete snapshots omit it.
alter table ingest.raw_job_records
  add column if not exists successful_omission_count smallint not null default 0;

alter table ingest.raw_job_records
  drop constraint if exists raw_job_records_omission_count_range;
alter table ingest.raw_job_records
  add constraint raw_job_records_omission_count_range check (
    successful_omission_count between 0 and 32767
  );

create table if not exists ingest.ats_snapshot_runs (
  import_run_id uuid primary key
    references ingest.import_runs(id) on delete restrict,
  source_id uuid not null
    references app.job_sources(id) on delete restrict,
  company_id uuid not null
    references app.companies(id) on delete restrict,
  run_key text not null,
  provider_checked_at timestamptz not null,
  provider_record_count integer not null,
  expected_record_count integer not null,
  publication_mode text not null,
  authorization_evidence_ref text not null,
  authorization_grantor text not null,
  terms_version text not null,
  policy_fingerprint text not null,
  started_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  outcome text,
  unique (source_id, run_key),
  constraint ats_snapshot_runs_key check (
    char_length(run_key) between 1 and 160
    and run_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$'
  ),
  constraint ats_snapshot_runs_publication_mode check (
    publication_mode in ('review', 'automatic')
  ),
  constraint ats_snapshot_runs_provider_count check (
    provider_record_count between 0 and 2000
    and expected_record_count between 0 and provider_record_count
  ),
  constraint ats_snapshot_runs_outcome check (
    outcome is null or outcome in (
      'complete', 'partial', 'failed', 'quarantined'
    )
  ),
  constraint ats_snapshot_runs_policy_hash check (
    policy_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint ats_snapshot_runs_finalization_pair check (
    (finalized_at is null and outcome is null)
    or (finalized_at is not null and outcome is not null)
  )
);

create unique index if not exists ats_snapshot_one_running_per_source
  on ingest.ats_snapshot_runs (source_id)
  where finalized_at is null;
create index if not exists ats_snapshot_complete_order
  on ingest.ats_snapshot_runs (
    source_id, provider_checked_at desc, finalized_at desc
  )
  where outcome = 'complete';

create table if not exists ingest.ats_snapshot_seen_records (
  import_run_id uuid not null
    references ingest.ats_snapshot_runs(import_run_id) on delete restrict,
  source_id uuid not null
    references app.job_sources(id) on delete restrict,
  external_source_id text not null,
  raw_record_id uuid not null
    references ingest.raw_job_records(id) on delete restrict,
  job_id uuid not null
    references app.jobs(id) on delete restrict,
  content_hash text not null,
  seen_at timestamptz not null default clock_timestamp(),
  primary key (import_run_id, external_source_id),
  constraint ats_snapshot_seen_external_id check (
    char_length(external_source_id) between 1 and 300
  ),
  constraint ats_snapshot_seen_hash check (
    content_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists ats_snapshot_seen_source_record
  on ingest.ats_snapshot_seen_records (source_id, external_source_id);

create table if not exists audit.ats_import_evidence (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null unique
    references ingest.import_runs(id) on delete restrict,
  source_id uuid not null
    references app.job_sources(id) on delete restrict,
  company_id uuid not null
    references app.companies(id) on delete restrict,
  outcome text not null,
  snapshot_complete boolean not null,
  publication_mode text not null,
  authorization_evidence_ref text not null,
  authorization_grantor text not null,
  terms_version text not null,
  policy_fingerprint text not null,
  fetched_count integer not null,
  expected_record_count integer not null,
  filtered_count integer not null,
  created_count integer not null,
  updated_count integer not null,
  unchanged_count integer not null,
  expired_count integer not null,
  error_count integer not null,
  error_summary jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint ats_import_evidence_outcome check (
    outcome in ('complete', 'partial', 'failed', 'quarantined')
  ),
  constraint ats_import_evidence_complete_pair check (
    snapshot_complete = (outcome = 'complete')
  ),
  constraint ats_import_evidence_publication_mode check (
    publication_mode in ('review', 'automatic')
  ),
  constraint ats_import_evidence_policy_hash check (
    policy_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint ats_import_evidence_counts check (
    fetched_count >= 0 and created_count >= 0 and updated_count >= 0
    and unchanged_count >= 0 and expired_count >= 0
    and error_count >= 0 and expected_record_count >= 0
    and filtered_count >= 0
    and fetched_count = expected_record_count + filtered_count
  ),
  constraint ats_import_evidence_error_object check (
    jsonb_typeof(error_summary) = 'object'
    and octet_length(error_summary::text) <= 16384
  )
);

drop trigger if exists ats_import_evidence_append_only
  on audit.ats_import_evidence;
create trigger ats_import_evidence_append_only
before update or delete on audit.ats_import_evidence
for each row execute function security.reject_mutation();

alter table ingest.ats_snapshot_runs enable row level security;
alter table ingest.ats_snapshot_runs force row level security;
alter table ingest.ats_snapshot_seen_records enable row level security;
alter table ingest.ats_snapshot_seen_records force row level security;
alter table audit.ats_import_evidence enable row level security;
alter table audit.ats_import_evidence force row level security;

revoke all on ingest.ats_snapshot_runs,
  ingest.ats_snapshot_seen_records,
  audit.ats_import_evidence
from public, anon, authenticated, service_role;

comment on table audit.ats_import_evidence is
  'Append-only ATS snapshot outcome and count evidence. It contains no provider descriptions.';
comment on column ingest.raw_job_records.successful_omission_count is
  'Consecutive successful complete ATS snapshots that omitted this source record; partial, failed, and quarantined runs never increment it.';

create or replace function security.protect_running_ats_import_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.triggered_by = 'ats_source_sync'
     and old.status = 'running'
     and new.status <> 'running'
     and exists (
       select 1
       from ingest.ats_snapshot_runs snapshot
       where snapshot.import_run_id = old.id
         and snapshot.finalized_at is null
     )
     and coalesce(new.error_summary ->> 'ats_lifecycle_outcome', '')
       not in ('complete', 'partial', 'failed', 'quarantined') then
    raise exception using errcode = '23514',
      message = 'running ATS import must be sealed by its lifecycle finalizer';
  end if;
  return new;
end;
$$;

revoke all on function security.protect_running_ats_import_state()
from public, anon, authenticated, service_role;

drop trigger if exists import_runs_protect_ats_lifecycle
  on ingest.import_runs;
create trigger import_runs_protect_ats_lifecycle
before update of status on ingest.import_runs
for each row execute function security.protect_running_ats_import_state();

create or replace function security.ats_destination_is_allowed(
  p_url text,
  p_hosts text[],
  p_path_prefixes text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_url is not null
    and p_url ~ '^https://[^/?#@:]+(?::443)?(?:/[^?#]*)?(?:[?#].*)?$'
    and exists (
      select 1
      from unnest(p_hosts, p_path_prefixes)
        as destination(host, path_prefix)
      where lower(substring(p_url from '^https://([^/:?#]+)')) =
              destination.host
        and (
          coalesce(substring(p_url from '^https://[^/]+(/[^?#]*)'), '/') =
            rtrim(destination.path_prefix, '/')
          or coalesce(substring(p_url from '^https://[^/]+(/[^?#]*)'), '/')
            like rtrim(destination.path_prefix, '/') || '/%'
          or destination.path_prefix = '/'
        )
    )
$$;

revoke all on function security.ats_destination_is_allowed(text,text[],text[])
from public, anon, authenticated, service_role;

create or replace function security.ats_source_policy_fingerprint(
  p_source_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'source_id', source.id,
    'company_id', config.company_id,
    'source_type', source.source_type,
    'status', source.status,
    'terms_url', source.terms_url,
    'terms_version', source.terms_version,
    'attribution_required', source.attribution_required,
    'attribution_text', source.attribution_text,
    'may_store_full_description', source.may_store_full_description,
    'may_index_jobs', source.may_index_jobs,
    'may_emit_jobposting_schema', source.may_emit_jobposting_schema,
    'may_email_jobs', source.may_email_jobs,
    'allow_public_listing', source.allow_public_listing,
    'required_destination_kind', source.required_destination_kind,
    'refresh_interval', source.refresh_interval,
    'authorization_basis', source.authorization_basis,
    'authorization_evidence_ref', source.authorization_evidence_ref,
    'authorization_grantor', source.authorization_grantor,
    'authorization_reviewed_at', source.authorization_reviewed_at,
    'authorization_expires_at', source.authorization_expires_at,
    'provider', config.provider,
    'provider_region', config.provider_region,
    'tenant_identifier', config.tenant_identifier,
    'allowed_destination_hosts', config.allowed_destination_hosts,
    'allowed_destination_path_prefixes',
      config.allowed_destination_path_prefixes,
    'fetch_interval', config.fetch_interval,
    'daily_request_budget', config.daily_request_budget,
    'minimum_request_spacing', config.minimum_request_spacing,
    'publication_mode', config.publication_mode,
    'enabled', config.enabled
  )::text, 'UTF8'), 'sha256'), 'hex')
  from app.job_sources source
  join private.ats_source_configs config on config.source_id = source.id
  where source.id = p_source_id
$$;

revoke all on function security.ats_source_policy_fingerprint(uuid)
from public, anon, authenticated, service_role;

-- The shared authorization predicate from the preceding migration is checked
-- for every lifecycle operation, not only at begin time. A pause, revocation,
-- expiry, or configuration change therefore fails closed mid-run.
create or replace function security.authorized_ats_snapshot_context(
  p_import_run_id uuid
)
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  publication_mode text,
  allowed_destination_hosts text[],
  allowed_destination_path_prefixes text[],
  may_store_full_description boolean,
  authorization_evidence_ref text,
  authorization_grantor text,
  terms_version text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();

  return query
  select
    authorized.source_id,
    authorized.company_id,
    authorized.adapter_key,
    authorized.publication_mode,
    authorized.allowed_destination_hosts,
    authorized.allowed_destination_path_prefixes,
    authorized.may_store_full_description,
    authorized.authorization_evidence_ref,
    authorized.authorization_grantor,
    authorized.terms_version
  from ingest.ats_snapshot_runs snapshot
  join security.authorized_ats_source_config_rows() authorized
    on authorized.source_id = snapshot.source_id
   and authorized.company_id = snapshot.company_id
   and authorized.publication_mode = snapshot.publication_mode
   and authorized.authorization_evidence_ref =
       snapshot.authorization_evidence_ref
   and authorized.authorization_grantor = snapshot.authorization_grantor
   and authorized.terms_version = snapshot.terms_version
   and security.ats_source_policy_fingerprint(authorized.source_id) =
       snapshot.policy_fingerprint
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null;
end;
$$;

revoke all on function security.authorized_ats_snapshot_context(uuid)
from public, anon, authenticated, service_role;

create or replace function api.worker_begin_ats_snapshot(
  p_adapter_key text,
  p_checked_at timestamptz,
  p_provider_count integer,
  p_expected_record_count integer
)
returns table (import_run_id uuid, should_run boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized record;
  v_import_run_id uuid;
  v_run_key text;
  v_policy_fingerprint text;
  v_stale_snapshot record;
  v_stale_import record;
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or p_adapter_key !~ '^[a-z0-9_]{1,120}$'
     or p_checked_at is null
     or p_checked_at > clock_timestamp() + interval '5 minutes'
     or p_checked_at < clock_timestamp() - interval '7 days'
     or p_provider_count is null
     or p_expected_record_count is null
     or p_provider_count not between 0 and 2000
     or p_expected_record_count not between 0 and p_provider_count then
    raise exception using errcode = '22023',
      message = 'invalid ATS snapshot start';
  end if;

  v_run_key := to_char(
    p_checked_at at time zone 'UTC',
    'YYYYMMDDHH24MISSUS'
  ) || ':' || p_provider_count::text || ':' ||
    p_expected_record_count::text;

  select * into v_authorized
  from security.authorized_ats_source_config_rows() authorized
  where authorized.adapter_key = p_adapter_key;
  if not found then
    raise exception using errcode = '42501',
      message = 'authorized active ATS source required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'salarypadi:ats-snapshot:' || v_authorized.source_id::text,
      0
    )
  );

  select snapshot.import_run_id into v_import_run_id
  from ingest.ats_snapshot_runs snapshot
  where snapshot.source_id = v_authorized.source_id
    and snapshot.finalized_at is not null
    and snapshot.provider_checked_at >= p_checked_at
  order by snapshot.provider_checked_at desc, snapshot.finalized_at desc
  limit 1;
  if found then
    return query select v_import_run_id, false;
    return;
  end if;

  select snapshot.import_run_id into v_import_run_id
  from ingest.ats_snapshot_runs snapshot
  where snapshot.source_id = v_authorized.source_id
    and snapshot.run_key = v_run_key;
  if found then
    return query select v_import_run_id, false;
    return;
  end if;

  select snapshot.* into v_stale_snapshot
  from ingest.ats_snapshot_runs snapshot
  where snapshot.source_id = v_authorized.source_id
    and snapshot.finalized_at is null
  for update;
  if found then
    if v_stale_snapshot.started_at >
       clock_timestamp() - interval '1 hour' then
      raise exception using errcode = '55000',
        message = 'ATS source already has a running snapshot';
    end if;

    update ingest.import_runs
    set status = 'failed',
        completed_at = clock_timestamp(),
        error_count = 1,
        error_summary = jsonb_build_object(
          'codes', jsonb_build_array('stale_snapshot_recovered'),
          'quarantined_count', 0,
          'ats_lifecycle_outcome', 'failed'
        )
    where id = v_stale_snapshot.import_run_id
      and status = 'running'
    returning * into v_stale_import;
    if found then
      update ingest.ats_snapshot_runs
      set finalized_at = clock_timestamp(), outcome = 'failed'
      where import_run_id = v_stale_snapshot.import_run_id;

      insert into audit.ats_import_evidence (
        import_run_id, source_id, company_id, outcome,
        snapshot_complete, publication_mode,
        authorization_evidence_ref, authorization_grantor,
        terms_version, policy_fingerprint, fetched_count,
        expected_record_count, filtered_count, created_count,
        updated_count, unchanged_count, expired_count, error_count,
        error_summary
      ) values (
        v_stale_snapshot.import_run_id, v_stale_snapshot.source_id,
        v_stale_snapshot.company_id, 'failed', false,
        v_stale_snapshot.publication_mode,
        v_stale_snapshot.authorization_evidence_ref,
        v_stale_snapshot.authorization_grantor,
        v_stale_snapshot.terms_version,
        v_stale_snapshot.policy_fingerprint,
        v_stale_import.fetched_count,
        v_stale_snapshot.expected_record_count,
        v_stale_snapshot.provider_record_count -
          v_stale_snapshot.expected_record_count,
        v_stale_import.created_count, v_stale_import.updated_count,
        v_stale_import.unchanged_count, 0, 1,
        jsonb_build_object(
          'codes', jsonb_build_array('stale_snapshot_recovered'),
          'quarantined_count', 0,
          'ats_lifecycle_outcome', 'failed'
        )
      );
    end if;
  end if;

  -- Stale recovery itself can finalize a snapshot newer than this request.
  -- Re-run the monotonic guard so recovery cannot open an older import in the
  -- same transaction and roll source content backward.
  select snapshot.import_run_id into v_import_run_id
  from ingest.ats_snapshot_runs snapshot
  where snapshot.source_id = v_authorized.source_id
    and snapshot.finalized_at is not null
    and snapshot.provider_checked_at >= p_checked_at
  order by snapshot.provider_checked_at desc, snapshot.finalized_at desc
  limit 1;
  if found then
    return query select v_import_run_id, false;
    return;
  end if;

  v_policy_fingerprint :=
    security.ats_source_policy_fingerprint(v_authorized.source_id);
  if v_policy_fingerprint is null then
    raise exception using errcode = '42501',
      message = 'trusted ATS source policy required';
  end if;

  insert into ingest.import_runs (
    source_id, status, triggered_by, started_at, fetched_count
  ) values (
    v_authorized.source_id, 'running', 'ats_source_sync',
    clock_timestamp(), p_provider_count
  ) returning id into v_import_run_id;

  insert into ingest.ats_snapshot_runs (
    import_run_id, source_id, company_id, run_key,
    provider_checked_at, provider_record_count, expected_record_count,
    publication_mode,
    authorization_evidence_ref, authorization_grantor, terms_version,
    policy_fingerprint
  ) values (
    v_import_run_id, v_authorized.source_id, v_authorized.company_id,
    v_run_key, p_checked_at, p_provider_count, p_expected_record_count,
    v_authorized.publication_mode,
    v_authorized.authorization_evidence_ref,
    v_authorized.authorization_grantor, v_authorized.terms_version,
    v_policy_fingerprint
  );

  return query select v_import_run_id, true;
end;
$$;

create or replace function api.worker_store_ats_snapshot_batch(
  p_import_run_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_snapshot record;
  v_record jsonb;
  v_location jsonb;
  v_country jsonb;
  v_record_count integer;
  v_seen_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_external_id text;
  v_title text;
  v_source_url text;
  v_application_url text;
  v_original_employer_url text;
  v_description text;
  v_stored_payload jsonb;
  v_content_hash text;
  v_dedup_fingerprint text;
  v_previous_hash text;
  v_raw_record_id uuid;
  v_job_id uuid;
  v_job_exists boolean;
  v_slug_base text;
  v_slug text;
  v_primary_locations integer;
  v_placeholder constant text :=
    'This listing is available as source metadata only. SalaryPadi does not store the provider''s full job description; use the application link to review the original posting.';
begin
  perform security.require_service_role();
  if p_import_run_id is null
     or p_records is null
     or jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode = '22023',
      message = 'ATS batch must contain 1 to 200 records and at most 4 MiB';
  end if;
  v_record_count := jsonb_array_length(p_records);
  if v_record_count not between 1 and 200
     or octet_length(p_records::text) > 4194304 then
    raise exception using errcode = '22023',
      message = 'ATS batch must contain 1 to 200 records and at most 4 MiB';
  end if;

  -- Serialize batches for one run and reject duplicate external IDs both
  -- within this request and across earlier batches in the same snapshot.
  -- Lock every mutable policy row before reading the authorization context;
  -- otherwise a concurrent revocation/config edit could commit after the
  -- check while this batch persists data under cached old permissions.
  select snapshot.* into v_snapshot
  from ingest.ats_snapshot_runs snapshot
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS snapshot is not running';
  end if;

  perform 1 from private.ats_source_configs config
  where config.source_id = v_snapshot.source_id for share;
  perform 1 from app.job_sources source
  where source.id = v_snapshot.source_id for share;
  perform 1 from app.companies company
  where company.id = v_snapshot.company_id for share;

  select * into v_context
  from security.authorized_ats_snapshot_context(p_import_run_id);
  if not found then
    raise exception using errcode = '42501',
      message = 'running authorized ATS snapshot required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) item
    group by item ->> 'external_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_records) item
    join ingest.ats_snapshot_seen_records seen
      on seen.import_run_id = p_import_run_id
     and seen.external_source_id = item ->> 'external_id'
  ) then
    raise exception using errcode = '22023',
      message = 'duplicate ATS external ID in snapshot';
  end if;

  for v_record in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_record) <> 'object' then
      raise exception using errcode = '22023',
        message = 'ATS record must be an object';
    end if;

    v_external_id := nullif(btrim(v_record ->> 'external_id'), '');
    v_title := nullif(btrim(v_record ->> 'title'), '');
    v_source_url := nullif(btrim(v_record ->> 'source_url'), '');
    v_application_url := nullif(btrim(v_record ->> 'application_url'), '');
    v_original_employer_url :=
      nullif(btrim(v_record ->> 'original_employer_url'), '');
    v_description := nullif(btrim(v_record ->> 'description_text'), '');
    v_content_hash := nullif(btrim(v_record ->> 'content_hash'), '');
    v_dedup_fingerprint :=
      nullif(btrim(v_record ->> 'dedup_fingerprint'), '');

    if v_external_id is null
       or char_length(v_external_id) > 300
       or v_title is null
       or char_length(v_title) not between 2 and 300
       or coalesce(v_content_hash, '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_dedup_fingerprint, '') !~ '^[0-9a-f]{64}$'
       or not (v_record ? 'eligibility')
       or (v_description is not null
         and char_length(v_description) not between 20 and 100000)
       or not security.ats_destination_is_allowed(
         v_source_url,
         v_context.allowed_destination_hosts,
         v_context.allowed_destination_path_prefixes
       )
       or not security.ats_destination_is_allowed(
         v_application_url,
         v_context.allowed_destination_hosts,
         v_context.allowed_destination_path_prefixes
       )
       or (
         v_original_employer_url is not null
         and not security.ats_destination_is_allowed(
           v_original_employer_url,
           v_context.allowed_destination_hosts,
           v_context.allowed_destination_path_prefixes
         )
       )
       or coalesce(v_record ->> 'work_arrangement', 'unspecified') not in (
         'remote', 'hybrid', 'onsite', 'unspecified'
       )
       or coalesce(v_record ->> 'employment_type', 'other') not in (
         'full_time', 'part_time', 'contract', 'freelance', 'temporary',
         'internship', 'graduate_trainee', 'other'
       )
       or coalesce(v_record ->> 'engagement_type', 'unspecified') not in (
         'employee', 'contractor', 'freelance', 'unspecified'
       )
       or coalesce(v_record ->> 'experience_level', 'unspecified') not in (
         'entry', 'junior', 'mid', 'senior', 'lead', 'executive',
         'unspecified'
       ) then
      raise exception using errcode = '22023',
        message = 'invalid normalized ATS job metadata';
    end if;

    if v_record ? 'locations' then
      if jsonb_typeof(v_record -> 'locations') <> 'array'
         or jsonb_array_length(v_record -> 'locations') > 20 then
        raise exception using errcode = '22023',
          message = 'invalid ATS locations';
      end if;
      v_primary_locations := 0;
      for v_location in
        select value from jsonb_array_elements(v_record -> 'locations')
      loop
        if jsonb_typeof(v_location) <> 'object'
           or (
             v_location ? 'country_code'
             and v_location ->> 'country_code' is not null
             and v_location ->> 'country_code' !~ '^[A-Z]{2}$'
           )
           or char_length(coalesce(v_location ->> 'city', '')) > 160
           or char_length(coalesce(v_location ->> 'region', '')) > 160
           or (
             v_location ? 'is_primary'
             and jsonb_typeof(v_location -> 'is_primary') <> 'boolean'
           ) then
          raise exception using errcode = '22023',
            message = 'invalid ATS location evidence';
        end if;
        if coalesce((v_location ->> 'is_primary')::boolean, false) then
          v_primary_locations := v_primary_locations + 1;
        end if;
      end loop;
      if v_primary_locations > 1 then
        raise exception using errcode = '22023',
          message = 'ATS locations may contain one primary location';
      end if;
    end if;

    if v_record ? 'eligibility' then
      if jsonb_typeof(v_record -> 'eligibility') <> 'object'
         or coalesce(v_record #>> '{eligibility,scope}', '') not in (
           'worldwide', 'africa', 'emea', 'nigeria', 'named_countries',
           'restricted_region', 'unclear'
         )
         or coalesce(
           v_record #>> '{eligibility,provenance}',
           'source_provided'
         ) <> 'source_provided'
         or char_length(coalesce(
           v_record #>> '{eligibility,evidence_text}', ''
         )) > 2000
         or (
           (v_record -> 'eligibility') ? 'confidence'
           and not case
             when jsonb_typeof(
               v_record #> '{eligibility,confidence}'
             ) = 'number'
             then (v_record #>> '{eligibility,confidence}')::numeric
               between 0 and 1
             else false
           end
         )
         or (
           (v_record -> 'eligibility') ? 'visa_sponsorship'
           and jsonb_typeof(
             v_record #> '{eligibility,visa_sponsorship}'
           ) <> 'boolean'
         )
         or (
           (v_record -> 'eligibility') ? 'relocation_support'
           and jsonb_typeof(
             v_record #> '{eligibility,relocation_support}'
           ) <> 'boolean'
         )
         or (
           (v_record -> 'eligibility') ? 'countries'
           and (
             jsonb_typeof(v_record #> '{eligibility,countries}') <> 'array'
             or jsonb_array_length(
               v_record #> '{eligibility,countries}'
             ) > 250
           )
         ) then
        raise exception using errcode = '22023',
          message = 'invalid ATS eligibility evidence';
      end if;
      for v_country in
        select value
        from jsonb_array_elements(coalesce(
          v_record #> '{eligibility,countries}', '[]'::jsonb
        ))
      loop
        if jsonb_typeof(v_country) <> 'object'
           or coalesce(v_country ->> 'country_code', '')
             !~ '^[A-Z]{2}$'
           or coalesce(v_country ->> 'rule', '')
             not in ('include', 'exclude') then
          raise exception using errcode = '22023',
            message = 'invalid ATS eligibility country evidence';
        end if;
      end loop;
    end if;

    -- Persist only a normalized allowlist. Description-like provider content
    -- is included solely when the reviewed source policy permits it.
    v_stored_payload := jsonb_strip_nulls(jsonb_build_object(
      'external_id', v_external_id,
      'title', v_title,
      'source_url', v_source_url,
      'application_url', v_application_url,
      'original_employer_url', v_original_employer_url,
      'work_arrangement', coalesce(
        v_record ->> 'work_arrangement', 'unspecified'
      ),
      'employment_type', coalesce(
        v_record ->> 'employment_type', 'other'
      ),
      'engagement_type', coalesce(
        v_record ->> 'engagement_type', 'unspecified'
      ),
      'experience_level', coalesce(
        v_record ->> 'experience_level', 'unspecified'
      ),
      'posted_at', v_record -> 'posted_at',
      'valid_through', v_record -> 'valid_through',
      'locations', v_record -> 'locations',
      'eligibility', v_record -> 'eligibility'
    ));
    if v_context.may_store_full_description then
      v_stored_payload := v_stored_payload || jsonb_strip_nulls(
        jsonb_build_object(
          'description_text', v_description,
          'requirements_text', nullif(btrim(
            v_record ->> 'requirements_text'
          ), ''),
          'benefits_text', nullif(btrim(
            v_record ->> 'benefits_text'
          ), '')
        )
      );
    end if;

    if octet_length(v_stored_payload::text) > 1048576 then
      raise exception using errcode = '22023',
        message = 'normalized ATS record exceeds 1 MiB';
    end if;

    select raw.content_hash into v_previous_hash
    from ingest.raw_job_records raw
    where raw.source_id = v_context.source_id
      and raw.external_source_id = v_external_id;

    select exists (
      select 1 from app.jobs job
      where job.source_id = v_context.source_id
        and job.external_source_id = v_external_id
    ) into v_job_exists;

    insert into ingest.raw_job_records as existing (
      source_id, import_run_id, external_source_id, source_url,
      original_employer_url, raw_payload, content_hash,
      dedup_fingerprint, full_description_stored, last_seen_at
    ) values (
      v_context.source_id, p_import_run_id, v_external_id,
      v_source_url, v_original_employer_url, v_stored_payload,
      v_content_hash, v_dedup_fingerprint,
      v_context.may_store_full_description and v_description is not null,
      clock_timestamp()
    )
    on conflict (source_id, external_source_id) do update
    set import_run_id = excluded.import_run_id,
        source_url = excluded.source_url,
        original_employer_url = excluded.original_employer_url,
        raw_payload = excluded.raw_payload,
        content_hash = excluded.content_hash,
        dedup_fingerprint = excluded.dedup_fingerprint,
        full_description_stored = excluded.full_description_stored,
        last_seen_at = excluded.last_seen_at
    returning id into v_raw_record_id;

    v_slug_base := trim(both '-' from regexp_replace(
      lower(v_title), '[^a-z0-9]+', '-', 'g'
    ));
    if v_slug_base = '' then v_slug_base := 'job'; end if;
    v_slug := left(v_slug_base, 120) || '-' || left(encode(
      extensions.digest(convert_to(
        v_context.source_id::text || ':' || v_external_id,
        'UTF8'
      ), 'sha256'), 'hex'
    ), 16);

    insert into app.jobs as existing (
      company_id, source_id, external_source_id, slug, status, title,
      description_text, requirements_text, benefits_text,
      work_arrangement, employment_type, engagement_type,
      experience_level, application_url, source_url,
      original_employer_url, posted_at, valid_through, last_seen_at,
      last_checked_at, content_sanitized_at, dedup_fingerprint
    ) values (
      v_context.company_id, v_context.source_id, v_external_id, v_slug,
      case when v_context.publication_mode = 'automatic'
        then 'published'::app.job_status
        else 'pending'::app.job_status end,
      v_title,
      case when v_context.may_store_full_description
        then case when char_length(coalesce(v_description, '')) >= 20
          then v_description else v_placeholder end
        else v_placeholder end,
      case when v_context.may_store_full_description then
        nullif(btrim(v_record ->> 'requirements_text'), '') end,
      case when v_context.may_store_full_description then
        nullif(btrim(v_record ->> 'benefits_text'), '') end,
      coalesce(v_record ->> 'work_arrangement', 'unspecified')
        ::app.work_arrangement,
      coalesce(v_record ->> 'employment_type', 'other')
        ::app.employment_type,
      coalesce(v_record ->> 'engagement_type', 'unspecified')
        ::app.engagement_type,
      coalesce(v_record ->> 'experience_level', 'unspecified')
        ::app.experience_level,
      v_application_url, v_source_url, v_original_employer_url,
      case when v_record ->> 'posted_at' is null then null
        else (v_record ->> 'posted_at')::timestamptz end,
      case when v_record ->> 'valid_through' is null then null
        else (v_record ->> 'valid_through')::timestamptz end,
      clock_timestamp(), clock_timestamp(), clock_timestamp(),
      v_dedup_fingerprint
    )
    on conflict (source_id, external_source_id) do update
    set company_id = excluded.company_id,
        title = excluded.title,
        status = case
          when existing.status in ('removed', 'rejected') then existing.status
          when v_context.publication_mode = 'automatic'
            then 'published'::app.job_status
          when v_previous_hash is distinct from v_content_hash
            then 'pending'::app.job_status
          when existing.status = 'expired' then 'pending'::app.job_status
          else existing.status
        end,
        description_text = excluded.description_text,
        description_html = null,
        requirements_text = excluded.requirements_text,
        benefits_text = excluded.benefits_text,
        work_arrangement = excluded.work_arrangement,
        employment_type = excluded.employment_type,
        engagement_type = excluded.engagement_type,
        experience_level = excluded.experience_level,
        application_url = excluded.application_url,
        source_url = excluded.source_url,
        original_employer_url = excluded.original_employer_url,
        posted_at = excluded.posted_at,
        valid_through = excluded.valid_through,
        last_seen_at = excluded.last_seen_at,
        last_checked_at = excluded.last_checked_at,
        content_sanitized_at = excluded.content_sanitized_at,
        dedup_fingerprint = excluded.dedup_fingerprint
    returning id into v_job_id;

    if v_record ? 'locations' then
      delete from app.job_locations where job_id = v_job_id;
      insert into app.job_locations (
        job_id, country_code, city, region, is_primary
      )
      select
        v_job_id,
        nullif(location.value ->> 'country_code', ''),
        nullif(btrim(location.value ->> 'city'), ''),
        nullif(btrim(location.value ->> 'region'), ''),
        coalesce((location.value ->> 'is_primary')::boolean, false)
      from jsonb_array_elements(v_record -> 'locations') location;
    end if;

    if v_record ? 'eligibility' then
      insert into app.job_eligibility as existing (
        job_id, scope, required_timezone_overlap,
        work_authorization_requirement, visa_sponsorship,
        relocation_support, evidence_text, provenance, confidence,
        last_verified_at
      ) values (
        v_job_id,
        (v_record #>> '{eligibility,scope}')::app.eligibility_scope,
        nullif(btrim(v_record #>>
          '{eligibility,required_timezone_overlap}'), ''),
        nullif(btrim(v_record #>>
          '{eligibility,work_authorization_requirement}'), ''),
        case when jsonb_typeof(v_record #> '{eligibility,visa_sponsorship}')
          = 'boolean' then (v_record #>>
          '{eligibility,visa_sponsorship}')::boolean end,
        case when jsonb_typeof(v_record #> '{eligibility,relocation_support}')
          = 'boolean' then (v_record #>>
          '{eligibility,relocation_support}')::boolean end,
        nullif(btrim(v_record #>> '{eligibility,evidence_text}'), ''),
        'source_provided',
        case when v_record #>> '{eligibility,confidence}' is null then null
          else (v_record #>> '{eligibility,confidence}')::numeric end,
        clock_timestamp()
      )
      on conflict (job_id) do update
      set scope = excluded.scope,
          required_timezone_overlap = excluded.required_timezone_overlap,
          work_authorization_requirement =
            excluded.work_authorization_requirement,
          visa_sponsorship = excluded.visa_sponsorship,
          relocation_support = excluded.relocation_support,
          evidence_text = excluded.evidence_text,
          provenance = 'source_provided',
          confidence = excluded.confidence,
          last_verified_at = excluded.last_verified_at,
          verified_by = null;

      delete from app.job_eligibility_countries where job_id = v_job_id;
      insert into app.job_eligibility_countries (
        job_id, country_code, rule
      )
      select distinct
        v_job_id,
        country.value ->> 'country_code',
        (country.value ->> 'rule')::app.country_rule
      from jsonb_array_elements(coalesce(
        v_record #> '{eligibility,countries}', '[]'::jsonb
      )) country;
    end if;

    insert into ingest.ats_snapshot_seen_records (
      import_run_id, source_id, external_source_id, raw_record_id,
      job_id, content_hash
    ) values (
      p_import_run_id, v_context.source_id, v_external_id,
      v_raw_record_id, v_job_id, v_content_hash
    );

    if not v_job_exists then
      v_created := v_created + 1;
    elsif v_previous_hash is distinct from v_content_hash then
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  select count(*)::integer into v_seen_count
  from ingest.ats_snapshot_seen_records seen
  where seen.import_run_id = p_import_run_id;
  if v_seen_count > (
    select snapshot.expected_record_count
    from ingest.ats_snapshot_runs snapshot
    where snapshot.import_run_id = p_import_run_id
  ) then
    raise exception using errcode = '22023',
      message = 'ATS batches exceed expected normalized record count';
  end if;

  update ingest.import_runs
  set created_count = created_count + v_created,
      updated_count = updated_count + v_updated,
      unchanged_count = unchanged_count + v_unchanged
  where id = p_import_run_id and status = 'running';
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS import run is not running';
  end if;

  return jsonb_build_object(
    'accepted_count', v_record_count,
    'created_count', v_created,
    'updated_count', v_updated,
    'unchanged_count', v_unchanged
  );
end;
$$;

create or replace function api.worker_finalize_ats_snapshot(
  p_import_run_id uuid,
  p_complete boolean,
  p_quarantined_count integer default 0,
  p_error_codes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_snapshot record;
  v_import record;
  v_expired integer := 0;
  v_status ingest.import_status;
  v_outcome text;
  v_error_count integer;
  v_error_summary jsonb;
begin
  perform security.require_service_role();
  if p_import_run_id is null
     or p_complete is null
     or p_quarantined_count is null
     or p_quarantined_count not between 0 and 2000
     or p_error_codes is null
     or jsonb_typeof(p_error_codes) <> 'array' then
    raise exception using errcode = '22023',
      message = 'invalid ATS snapshot outcome';
  end if;
  if jsonb_array_length(p_error_codes) > 100
     or octet_length(p_error_codes::text) > 8000
     or exists (
       select 1
       from jsonb_array_elements(p_error_codes) code
       where jsonb_typeof(code) <> 'string'
         or trim(both '"' from code::text) !~ '^[a-z0-9_]{2,80}$'
     ) then
    raise exception using errcode = '22023',
      message = 'invalid ATS snapshot outcome';
  end if;

  select * into v_snapshot
  from ingest.ats_snapshot_runs snapshot
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS snapshot is not running';
  end if;

  select * into v_import
  from ingest.import_runs
  where id = p_import_run_id and status = 'running'
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS import run is not running';
  end if;

  if p_quarantined_count > v_snapshot.provider_record_count then
    raise exception using errcode = '22023',
      message = 'ATS quarantine count exceeds provider record count';
  end if;

  if p_complete and (
    p_quarantined_count <> 0
    or jsonb_array_length(coalesce(p_error_codes, '[]'::jsonb)) <> 0
    or (
      select count(*)
      from ingest.ats_snapshot_seen_records seen
      where seen.import_run_id = p_import_run_id
    ) <> v_snapshot.expected_record_count
  ) then
    raise exception using errcode = '22023',
      message = 'complete ATS snapshot must account for every provider record without errors';
  end if;

  if p_complete and exists (
    select 1
    from ingest.ats_snapshot_runs newer
    where newer.source_id = v_snapshot.source_id
      and newer.import_run_id <> p_import_run_id
      and newer.finalized_at is not null
      and newer.provider_checked_at >= v_snapshot.provider_checked_at
  ) then
    raise exception using errcode = '55000',
      message = 'stale ATS snapshot cannot reconcile omissions';
  end if;

  v_error_count := p_quarantined_count
    + jsonb_array_length(coalesce(p_error_codes, '[]'::jsonb));
  v_error_summary := jsonb_build_object(
    'codes', coalesce(p_error_codes, '[]'::jsonb),
    'quarantined_count', p_quarantined_count
  );
  v_outcome := case
    when p_complete then 'complete'
    when p_quarantined_count > 0
      and v_snapshot.expected_record_count = 0 then 'quarantined'
    when v_import.fetched_count > 0 then 'partial'
    else 'failed'
  end;
  v_error_summary := v_error_summary || jsonb_build_object(
    'ats_lifecycle_outcome', v_outcome
  );

  -- Failure/partial finalization is always allowed to seal an owned running
  -- import after a mid-run pause, revocation, or policy edit. Only a complete
  -- snapshot may reconcile omissions. Lock mutable policy rows in the same
  -- config/source/company order as claim and batch, then recheck the exact
  -- current authorization and policy fingerprint before reconciliation.
  if p_complete then
    perform 1 from private.ats_source_configs config
    where config.source_id = v_snapshot.source_id for share;
    perform 1 from app.job_sources source
    where source.id = v_snapshot.source_id for share;
    perform 1 from app.companies company
    where company.id = v_snapshot.company_id for share;

    select * into v_context
    from security.authorized_ats_snapshot_context(p_import_run_id);
    if not found then
      raise exception using errcode = '42501',
        message = 'current authorized ATS policy required for complete finalization';
    end if;
  end if;

  if v_outcome = 'complete' then
    update ingest.raw_job_records raw
    set successful_omission_count = 0
    where raw.source_id = v_context.source_id
      and exists (
        select 1
        from ingest.ats_snapshot_seen_records seen
        where seen.import_run_id = p_import_run_id
          and seen.raw_record_id = raw.id
      );

    update ingest.raw_job_records raw
    set successful_omission_count = least(
      raw.successful_omission_count + 1,
      32767
    )
    where raw.source_id = v_context.source_id
      and not exists (
        select 1
        from ingest.ats_snapshot_seen_records seen
        where seen.import_run_id = p_import_run_id
          and seen.raw_record_id = raw.id
      );

    update app.jobs job
    set status = 'expired',
        last_checked_at = clock_timestamp(),
        updated_at = clock_timestamp()
    from ingest.raw_job_records raw
    where raw.source_id = v_context.source_id
      and raw.external_source_id = job.external_source_id
      and job.source_id = raw.source_id
      and raw.successful_omission_count >= 2
      and job.status in ('published', 'pending', 'draft');
    get diagnostics v_expired = row_count;

    update app.job_sources
    set last_successful_import_at = clock_timestamp()
    where id = v_context.source_id;
    v_status := 'succeeded';
  elsif v_outcome = 'partial' then
    v_status := 'partially_succeeded';
  elsif v_outcome = 'failed' then
    v_status := 'failed';
  elsif v_outcome = 'quarantined' then
    v_status := 'failed';
  else
    raise exception using errcode = '55000',
      message = 'unknown ATS snapshot outcome';
  end if;

  update ingest.import_runs
  set status = v_status,
      completed_at = clock_timestamp(),
      expired_count = v_expired,
      error_count = v_error_count,
      error_summary = v_error_summary
  where id = p_import_run_id and status = 'running'
  returning * into v_import;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS import run is not running';
  end if;

  update ingest.ats_snapshot_runs
  set finalized_at = clock_timestamp(), outcome = v_outcome
  where import_run_id = p_import_run_id;

  insert into audit.ats_import_evidence (
    import_run_id, source_id, company_id, outcome, snapshot_complete,
    publication_mode, authorization_evidence_ref,
    authorization_grantor, terms_version, policy_fingerprint,
    fetched_count, expected_record_count, filtered_count,
    created_count, updated_count, unchanged_count,
    expired_count, error_count, error_summary
  ) values (
    p_import_run_id, v_snapshot.source_id, v_snapshot.company_id,
    v_outcome, v_outcome = 'complete', v_snapshot.publication_mode,
    v_snapshot.authorization_evidence_ref,
    v_snapshot.authorization_grantor, v_snapshot.terms_version,
    v_snapshot.policy_fingerprint,
    v_import.fetched_count, v_snapshot.expected_record_count,
    v_snapshot.provider_record_count - v_snapshot.expected_record_count,
    v_import.created_count,
    v_import.updated_count, v_import.unchanged_count,
    v_expired, v_error_count, v_error_summary
  );

  return jsonb_build_object(
    'outcome', v_outcome,
    'fetched_count', v_import.fetched_count,
    'expected_record_count', v_snapshot.expected_record_count,
    'filtered_count',
      v_snapshot.provider_record_count - v_snapshot.expected_record_count,
    'created_count', v_import.created_count,
    'updated_count', v_import.updated_count,
    'unchanged_count', v_import.unchanged_count,
    'expired_count', v_expired,
    'error_count', v_error_count
  );
end;
$$;

revoke all on function api.worker_begin_ats_snapshot(text,timestamptz,integer,integer)
from public, anon, authenticated;
revoke all on function api.worker_store_ats_snapshot_batch(uuid,jsonb)
from public, anon, authenticated;
revoke all on function api.worker_finalize_ats_snapshot(uuid,boolean,integer,jsonb)
from public, anon, authenticated;

grant execute on function api.worker_begin_ats_snapshot(text,timestamptz,integer,integer)
to service_role;
grant execute on function api.worker_store_ats_snapshot_batch(uuid,jsonb)
to service_role;
grant execute on function api.worker_finalize_ats_snapshot(uuid,boolean,integer,jsonb)
to service_role;

commit;
