-- Connect employer-authorized generic feeds to the production ingest path.
--
-- Design decision: this EXTENDS the existing snapshot lifecycle rather than
-- creating a second ingestion system. Generic feeds reuse
-- worker_begin_ats_snapshot / worker_store_ats_snapshot_batch /
-- worker_finalize_ats_snapshot, so they inherit the same idempotency,
-- acknowledgement, absence-handling and audit behaviour as employer ATS
-- boards.
--
-- What it deliberately does NOT do: widen
-- security.authorized_ats_source_config_rows(). Six functions read that
-- helper, including worker_claim_ats_source_fetch and
-- worker_list_authorized_ats_sources — widening it would make the ATS worker
-- start claiming and fetching generic feeds. Instead a sibling helper applies
-- the identical rights discipline to feed rows, and only the snapshot
-- lifecycle reads the union of the two.
--
-- No feed is enabled by this migration. It creates no source row, no config
-- row and no authorization. The registry remains empty and both global source
-- policies remain disabled.

begin;

/* ---------------------------------------------------------------------------
 * 1. Authorized generic-feed source configs.
 *
 * Identical rights discipline to the ATS helper: active source, public
 * listing allowed, reviewed terms, a recognised authorization basis with an
 * evidence reference and grantor, an unrevoked and unexpired authorization,
 * an enabled config whose fetch interval matches the source refresh interval,
 * and a company that is neither removed nor suspended.
 * ------------------------------------------------------------------------ */
create or replace function security.authorized_feed_source_config_rows()
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  source_name text,
  employer_name text,
  provider text,
  tenant_identifier text,
  allowed_destination_hosts text[],
  allowed_destination_path_prefixes text[],
  fetch_interval_seconds integer,
  daily_request_budget smallint,
  minimum_request_spacing_seconds integer,
  publication_mode text,
  terms_url text,
  terms_version text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  required_destination_kind text,
  authorization_basis text,
  authorization_evidence_ref text,
  authorization_grantor text,
  authorization_reviewed_at timestamptz,
  authorization_expires_at timestamptz,
  raw_retention interval
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    cfg.company_id,
    s.adapter_key,
    s.name,
    c.display_name,
    cfg.provider,
    cfg.tenant_identifier,
    cfg.allowed_destination_hosts,
    cfg.allowed_destination_path_prefixes,
    extract(epoch from cfg.fetch_interval)::integer,
    cfg.daily_request_budget,
    extract(epoch from cfg.minimum_request_spacing)::integer,
    cfg.publication_mode,
    s.terms_url,
    s.terms_version,
    s.attribution_required,
    s.attribution_text,
    s.may_store_full_description,
    s.may_index_jobs,
    s.may_emit_jobposting_schema,
    s.required_destination_kind,
    s.authorization_basis,
    s.authorization_evidence_ref,
    s.authorization_grantor,
    s.authorization_reviewed_at,
    s.authorization_expires_at,
    coalesce(s.raw_retention, interval '30 days')
  from app.job_sources s
  join private.ats_source_configs cfg on cfg.source_id = s.id
  join app.companies c on c.id = cfg.company_id
  where s.source_type = 'direct_employer'
    and cfg.provider in (
      'employer_xml_feed', 'employer_json_feed', 'employer_csv_import'
    )
    and s.status = 'active'
    and s.allow_public_listing
    and s.terms_reviewed_at is not null
    and s.authorization_basis is not null
    -- A generic feed is republished on the employer's own written say-so.
    -- A "documented public API" basis does not authorize one.
    and s.authorization_basis in ('written_permission', 'commercial_contract')
    and s.authorization_evidence_ref is not null
    and s.authorization_grantor is not null
    and s.authorization_reviewed_at is not null
    and s.authorization_reviewed_at <=
      statement_timestamp() + interval '5 minutes'
    and s.authorization_revoked_at is null
    and (
      s.authorization_expires_at is null
      or s.authorization_expires_at > statement_timestamp()
    )
    and cfg.enabled
    and cfg.fetch_interval = s.refresh_interval
    and c.record_status <> 'removed'
    and c.verification_status <> 'suspended'
    and (
      cfg.publication_mode = 'review'
      or (
        c.record_status = 'published'
        and c.verification_status in (
          'domain_verified', 'organization_verified'
        )
      )
    )
$$;

/* ---------------------------------------------------------------------------
 * 2. The union the snapshot lifecycle reads.
 *
 * Only the columns worker_begin_ats_snapshot actually consumes are projected,
 * so ATS-only fields cannot be read by accident on a feed row.
 * ------------------------------------------------------------------------ */
create or replace function security.authorized_snapshot_source_config_rows()
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  publication_mode text,
  terms_version text,
  authorization_evidence_ref text,
  authorization_grantor text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.source_id, a.company_id, a.adapter_key, a.publication_mode,
         a.terms_version, a.authorization_evidence_ref, a.authorization_grantor
  from security.authorized_ats_source_config_rows() a
  union all
  select f.source_id, f.company_id, f.adapter_key, f.publication_mode,
         f.terms_version, f.authorization_evidence_ref, f.authorization_grantor
  from security.authorized_feed_source_config_rows() f
$$;

revoke all on function security.authorized_feed_source_config_rows()
  from public, anon, authenticated;
revoke all on function security.authorized_snapshot_source_config_rows()
  from public, anon, authenticated;

/* ---------------------------------------------------------------------------
 * 3. Durable feed-run metrics.
 *
 * Every run attempt records a terminal outcome here, including the attempts
 * that never reach a snapshot (policy blocked, authorization expired, fetch
 * failed). Metrics that live only in a function return value disappear at
 * process exit, which is why the previous runtime could report nothing.
 * ------------------------------------------------------------------------ */
create table if not exists private.feed_run_metrics (
  id uuid primary key default gen_random_uuid(),
  feed_key text not null check (feed_key ~ '^[a-z0-9_]{1,80}$'),
  source_id uuid references app.job_sources (id) on delete set null,
  import_run_id uuid,
  run_at timestamptz not null,
  outcome text not null check (outcome in (
    'complete', 'partial', 'policy_blocked', 'authorization_expired',
    'authorization_not_yet_valid', 'review_overdue', 'disabled',
    'fetch_failed', 'parse_failed', 'payload_too_large', 'database_failed',
    'timeout', 'no_payload', 'skipped'
  )),
  snapshot_complete boolean not null default false,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  filtered_count integer not null default 0 check (filtered_count >= 0),
  quarantined_count integer not null default 0 check (quarantined_count >= 0),
  destination_dropped_count integer not null default 0
    check (destination_dropped_count >= 0),
  invalid_record_count integer not null default 0
    check (invalid_record_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  closed_count integer not null default 0 check (closed_count >= 0),
  truncated boolean not null default false,
  incompleteness_reasons text[] not null default '{}',
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists feed_run_metrics_feed_key_run_at_idx
  on private.feed_run_metrics (feed_key, run_at desc);

alter table private.feed_run_metrics enable row level security;
alter table private.feed_run_metrics force row level security;

/* ---------------------------------------------------------------------------
 * 4. Rights-compliant source evidence, captured BEFORE normalization.
 *
 * The previous runtime derived its "raw" record from normalized output and
 * usually retained only an external id — a normalized derivative described as
 * raw evidence. This table stores what the employer actually sent, bounded and
 * policy-gated: the full permitted payload only when the source policy allows
 * full-description storage, otherwise a cryptographic hash plus permitted
 * metadata and the outcome/reason codes.
 * ------------------------------------------------------------------------ */
create table if not exists ingest.feed_source_evidence (
  id uuid primary key default gen_random_uuid(),
  feed_key text not null check (feed_key ~ '^[a-z0-9_]{1,80}$'),
  source_id uuid references app.job_sources (id) on delete set null,
  import_run_id uuid,
  run_at timestamptz not null,
  external_id text check (external_id is null or char_length(external_id) <= 300),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_bytes integer not null check (payload_bytes >= 0),
  source_url text,
  application_url text,
  fetched_at timestamptz not null,
  parser_version text not null,
  field_map_version text not null,
  extraction_outcome text not null check (extraction_outcome in (
    'mapped', 'required_field_missing', 'malformed_record_url',
    'destination_not_authorized', 'record_limit_exceeded'
  )),
  normalization_outcome text check (normalization_outcome in (
    'accepted', 'filtered', 'quarantined'
  )),
  reason_code text,
  -- Full payload only where the policy permits it; null otherwise.
  permitted_payload jsonb,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists feed_source_evidence_feed_run_idx
  on ingest.feed_source_evidence (feed_key, run_at desc);
create index if not exists feed_source_evidence_retention_idx
  on ingest.feed_source_evidence (retention_expires_at);

alter table ingest.feed_source_evidence enable row level security;
alter table ingest.feed_source_evidence force row level security;

/* ---------------------------------------------------------------------------
 * 5. Worker RPCs.
 * ------------------------------------------------------------------------ */
create or replace function api.worker_record_feed_run_metrics(p_metrics jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_feed_key text := p_metrics ->> 'feed_key';
begin
  perform security.require_service_role();
  if v_feed_key is null or v_feed_key !~ '^[a-z0-9_]{1,80}$'
     or p_metrics ->> 'outcome' is null
     or p_metrics ->> 'run_at' is null then
    raise exception using errcode = '22023',
      message = 'invalid feed run metrics';
  end if;

  select f.source_id into v_source_id
  from security.authorized_feed_source_config_rows() f
  where f.adapter_key = v_feed_key;

  insert into private.feed_run_metrics (
    feed_key, source_id, import_run_id, run_at, outcome, snapshot_complete,
    fetched_count, accepted_count, filtered_count, quarantined_count,
    destination_dropped_count, invalid_record_count, inserted_count,
    updated_count, unchanged_count, closed_count, truncated,
    incompleteness_reasons, error_code
  ) values (
    v_feed_key,
    v_source_id,
    nullif(p_metrics ->> 'import_run_id', '')::uuid,
    (p_metrics ->> 'run_at')::timestamptz,
    p_metrics ->> 'outcome',
    coalesce((p_metrics ->> 'snapshot_complete')::boolean, false),
    coalesce((p_metrics ->> 'fetched_count')::integer, 0),
    coalesce((p_metrics ->> 'accepted_count')::integer, 0),
    coalesce((p_metrics ->> 'filtered_count')::integer, 0),
    coalesce((p_metrics ->> 'quarantined_count')::integer, 0),
    coalesce((p_metrics ->> 'destination_dropped_count')::integer, 0),
    coalesce((p_metrics ->> 'invalid_record_count')::integer, 0),
    coalesce((p_metrics ->> 'inserted_count')::integer, 0),
    coalesce((p_metrics ->> 'updated_count')::integer, 0),
    coalesce((p_metrics ->> 'unchanged_count')::integer, 0),
    coalesce((p_metrics ->> 'closed_count')::integer, 0),
    coalesce((p_metrics ->> 'truncated')::boolean, false),
    coalesce(
      array(select jsonb_array_elements_text(
        coalesce(p_metrics -> 'incompleteness_reasons', '[]'::jsonb)
      )),
      '{}'
    ),
    nullif(p_metrics ->> 'error_code', '')
  );
  return true;
end;
$$;

create or replace function api.worker_store_feed_evidence(
  p_feed_key text,
  p_records jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized record;
  v_stored integer := 0;
begin
  perform security.require_service_role();
  if p_feed_key is null or p_feed_key !~ '^[a-z0-9_]{1,80}$'
     or p_records is null or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) > 1000 then
    raise exception using errcode = '22023',
      message = 'invalid feed evidence batch';
  end if;

  select * into v_authorized
  from security.authorized_feed_source_config_rows() f
  where f.adapter_key = p_feed_key;
  if not found then
    raise exception using errcode = '42501',
      message = 'authorized active employer feed required';
  end if;

  insert into ingest.feed_source_evidence (
    feed_key, source_id, import_run_id, run_at, external_id, payload_sha256,
    payload_bytes, source_url, application_url, fetched_at, parser_version,
    field_map_version, extraction_outcome, normalization_outcome, reason_code,
    permitted_payload, retention_expires_at
  )
  select
    p_feed_key,
    v_authorized.source_id,
    nullif(record ->> 'import_run_id', '')::uuid,
    (record ->> 'run_at')::timestamptz,
    nullif(record ->> 'external_id', ''),
    record ->> 'payload_sha256',
    (record ->> 'payload_bytes')::integer,
    nullif(record ->> 'source_url', ''),
    nullif(record ->> 'application_url', ''),
    (record ->> 'fetched_at')::timestamptz,
    record ->> 'parser_version',
    record ->> 'field_map_version',
    record ->> 'extraction_outcome',
    nullif(record ->> 'normalization_outcome', ''),
    nullif(record ->> 'reason_code', ''),
    -- Fail closed: the payload is retained only where the source policy
    -- permits full-description storage, regardless of what the caller sent.
    case
      when v_authorized.may_store_full_description then record -> 'permitted_payload'
      else null
    end,
    clock_timestamp() + v_authorized.raw_retention
  from jsonb_array_elements(p_records) as record;

  get diagnostics v_stored = row_count;
  return v_stored;
end;
$$;

revoke all on function api.worker_record_feed_run_metrics(jsonb)
  from public, anon, authenticated;
revoke all on function api.worker_store_feed_evidence(text, jsonb)
  from public, anon, authenticated;

/* ---------------------------------------------------------------------------
 * 6. Admit generic feeds to the snapshot lifecycle.
 *
 * Patched in place using the pattern established by
 * 20260711010402_fix_ats_stale_recovery_ambiguity.sql: read the live source,
 * assert each substitution matches exactly once, then re-create. Failing
 * closed on an unexpected body prevents this migration from silently
 * rewriting a function that has moved on.
 * ------------------------------------------------------------------------ */
do $migration$
declare
  v_source text;
  v_old_lookup constant text :=
    'from security.authorized_ats_source_config_rows() authorized';
  v_new_lookup constant text :=
    'from security.authorized_snapshot_source_config_rows() authorized';
  v_old_bound constant text := 'p_provider_count not between 0 and 2000';
  -- MAX_FEED_RECORDS is 5000; an employer feed larger than the ATS bound must
  -- be representable so the runtime can report truncation honestly rather than
  -- failing at the database boundary.
  v_new_bound constant text := 'p_provider_count not between 0 and 5000';
begin
  select procedure.prosrc into strict v_source
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'api'
    and procedure.proname = 'worker_begin_ats_snapshot'
    and procedure.proargtypes = '25 1184 23 23'::oidvector;

  if (char_length(v_source) - char_length(replace(v_source, v_old_lookup, '')))
       / char_length(v_old_lookup) <> 1
     or (char_length(v_source) - char_length(replace(v_source, v_old_bound, '')))
       / char_length(v_old_bound) <> 1 then
    raise exception using errcode = '55000',
      message = 'unexpected ATS snapshot begin source';
  end if;

  v_source := replace(v_source, v_old_lookup, v_new_lookup);
  v_source := replace(v_source, v_old_bound, v_new_bound);

  execute format(
    $definition$
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
as $ats_snapshot_begin_body$
%s
$ats_snapshot_begin_body$;
$definition$,
    v_source
  );
end;
$migration$;

commit;
