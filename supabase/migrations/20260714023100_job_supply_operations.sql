begin;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label, enabled
) values
  ('job_supply_dispatcher', interval '15 minutes', interval '45 minutes', 'SalaryPadi job supply operations', true),
  ('job_lifecycle', interval '15 minutes', interval '45 minutes', 'SalaryPadi job lifecycle operations', true),
  ('apply_link_check', interval '15 minutes', interval '45 minutes', 'SalaryPadi job quality operations', true),
  ('job_dedupe_review', interval '24 hours', interval '36 hours', 'SalaryPadi job quality operations', true),
  ('source_health_digest', interval '24 hours', interval '36 hours', 'SalaryPadi source operations', true),
  ('source_rights_review', interval '31 days', interval '40 days', 'SalaryPadi source rights owner', true)
on conflict (task_key) do update
set expected_interval = excluded.expected_interval,
    stale_after = excluded.stale_after,
    owner_label = excluded.owner_label,
    enabled = excluded.enabled,
    updated_at = clock_timestamp();

update private.worker_schedules
set expected_interval = interval '2 hours', stale_after = interval '5 hours',
    updated_at = clock_timestamp()
where task_key = 'ats_source_sync';
update private.worker_schedules
set expected_interval = interval '6 hours', stale_after = interval '14 hours',
    updated_at = clock_timestamp()
where task_key = 'job_source_sync';
update private.worker_schedules
set expected_interval = interval '15 minutes', stale_after = interval '45 minutes',
    updated_at = clock_timestamp()
where task_key = 'alert_delivery';

-- A recent safe skip proves the schedule and kill switch are alive. It does
-- not become a source success: last_success_at remains the last succeeded run.
create or replace function security.get_worker_health_internal()
returns table (
  task_key text,
  owner_label text,
  last_status text,
  last_started_at timestamptz,
  last_success_at timestamptz,
  freshness text
)
language sql
stable
security definer
set search_path = ''
as $$
  select schedule.task_key, schedule.owner_label,
    latest.status,
    latest.started_at,
    success.completed_at,
    case
      when not schedule.enabled then 'disabled'
      when latest.completed_at is null then 'never'
      when latest.completed_at < clock_timestamp() - schedule.stale_after
        then 'stale'
      when latest.status = 'failed' then 'degraded'
      else 'healthy'
    end
  from private.worker_schedules schedule
  left join lateral (
    select run.status, run.started_at, run.completed_at
    from private.worker_runs run
    where run.task_key = schedule.task_key
    order by run.started_at desc, run.id desc
    limit 1
  ) latest on true
  left join lateral (
    select run.completed_at
    from private.worker_runs run
    where run.task_key = schedule.task_key and run.status = 'succeeded'
    order by run.completed_at desc, run.id desc
    limit 1
  ) success on true
  order by schedule.task_key
$$;

create or replace function security.complete_job_supply_import_metrics()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_accepted integer := 0;
  v_duplicates integer := 0;
  v_canonical integer := 0;
begin
  if new.status not in (
    'succeeded', 'partially_succeeded', 'failed', 'cancelled'
  ) then return new; end if;
  if tg_op = 'INSERT' then
    new.canonical_created_count := coalesce(new.canonical_created_count, 0);
    return new;
  end if;
  if old.status <> 'running' then return new; end if;

  select count(*)::integer into v_accepted
  from ingest.ats_snapshot_seen_records seen
  where seen.import_run_id = new.id;
  select count(*)::integer into v_duplicates
  from ingest.job_source_occurrences occurrence
  join ingest.job_occurrence_links link on link.occurrence_id = occurrence.id
  where occurrence.import_run_id = new.id
    and link.source_job_id <> link.canonical_job_id;
  select count(*)::integer into v_canonical
  from audit.canonical_job_events event
  where event.import_run_id = new.id and event.event_type = 'canonical_created';

  new.accepted_count := v_accepted;
  new.duplicate_count := v_duplicates;
  new.rejected_count := greatest(new.fetched_count - v_accepted, 0);
  new.canonical_created_count := v_canonical;
  return new;
end;
$$;

drop trigger if exists import_runs_supply_metrics on ingest.import_runs;
create trigger import_runs_supply_metrics
before insert or update of status on ingest.import_runs
for each row execute function security.complete_job_supply_import_metrics();

create or replace function api.worker_dispatch_job_supply()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target integer;
  v_due integer;
  v_capacity integer;
begin
  perform security.require_service_role();
  select target_daily_new_canonical into v_target
  from private.job_supply_targets where id;
  select count(*)::integer, coalesce(sum(expected_daily_new_canonical), 0)::integer
    into v_due, v_capacity
  from app.job_sources source
  where security.job_source_policy_is_runnable(source.id)
    and source.expected_capacity_evidence_ref is not null
    and (source.last_successful_import_at is null
      or source.last_successful_import_at + source.refresh_interval <= clock_timestamp());
  return jsonb_build_object(
    'target_daily_new_canonical', v_target,
    'authorized_daily_capacity', v_capacity,
    'due_authorized_sources', v_due,
    'source_activation_performed', false
  );
end;
$$;

create or replace function api.worker_run_job_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deadline integer := 0;
  v_manual integer := 0;
  v_retention_purged integer := 0;
  v_raw_retention_purged integer := 0;
begin
  perform security.require_service_role();

  update app.jobs job
  set status = 'expired', lifecycle_state = 'closed',
      lifecycle_reason = 'deadline_elapsed', last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where job.status in ('published', 'pending', 'draft')
    and job.valid_through is not null
    and job.valid_through <= clock_timestamp();
  get diagnostics v_deadline = row_count;

  update app.jobs job
  set status = 'expired', lifecycle_state = 'closed',
      lifecycle_reason = 'manual_reconfirmation_overdue',
      last_checked_at = clock_timestamp(), updated_at = clock_timestamp()
  from app.job_sources source
  where source.id = job.source_id
    and source.source_type in ('direct_employer', 'manual')
    and job.status in ('published', 'pending', 'draft')
    and job.valid_through is null
    and coalesce(job.manual_reconfirmed_at, job.last_verified_at, job.created_at)
      <= clock_timestamp() - interval '30 days';
  get diagnostics v_manual = row_count;

  insert into audit.canonical_job_events (
    event_key, event_type, canonical_job_id, source_job_id, source_id, evidence
  )
  select 'closed:' || job.id::text || ':' || coalesce(job.lifecycle_reason, 'unknown'),
    'closed', coalesce(job.canonical_job_id, job.id), job.id, job.source_id,
    jsonb_build_object('reason', job.lifecycle_reason)
  from app.jobs job
  where job.lifecycle_state = 'closed'
    and job.updated_at >= transaction_timestamp()
  on conflict (event_key) do nothing;

  perform set_config('salarypadi.retention_purge', 'on', true);
  delete from ingest.job_occurrence_links link
  using ingest.job_source_occurrences occurrence
  where occurrence.id = link.occurrence_id
    and occurrence.retention_expires_at is not null
    and occurrence.retention_expires_at <= clock_timestamp()
    and not exists (
      select 1 from ingest.import_runs run
      where run.id = occurrence.import_run_id
        and run.status in ('queued', 'running')
    );
  delete from ingest.job_source_occurrences occurrence
  where occurrence.retention_expires_at is not null
    and occurrence.retention_expires_at <= clock_timestamp()
    and not exists (
      select 1 from ingest.import_runs run
      where run.id = occurrence.import_run_id
        and run.status in ('queued', 'running')
    );
  get diagnostics v_retention_purged = row_count;
  delete from ingest.ats_snapshot_seen_records seen
  using ingest.raw_job_records raw
  where raw.id = seen.raw_record_id
    and raw.retention_expires_at is not null
    and raw.retention_expires_at <= clock_timestamp()
    and not exists (
      select 1 from ingest.import_runs run
      where run.id = raw.import_run_id and run.status in ('queued', 'running')
    );
  delete from ingest.raw_job_records raw
  where raw.retention_expires_at is not null
    and raw.retention_expires_at <= clock_timestamp()
    and not exists (
      select 1 from ingest.import_runs run
      where run.id = raw.import_run_id and run.status in ('queued', 'running')
    );
  get diagnostics v_raw_retention_purged = row_count;
  perform set_config('salarypadi.retention_purge', 'off', true);

  return jsonb_build_object(
    'deadline_closed', v_deadline,
    'manual_closed', v_manual,
    'closed_total', v_deadline + v_manual,
    'retention_occurrences_purged', v_retention_purged,
    'retention_raw_records_purged', v_raw_retention_purged
  );
end;
$$;

create or replace function api.worker_confirm_job_closed(
  p_source_id uuid,
  p_external_source_id text,
  p_evidence_reference text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job app.jobs%rowtype;
begin
  perform security.require_service_role();
  if p_source_id is null
     or p_external_source_id is null
     or char_length(p_external_source_id) not between 1 and 300
     or p_evidence_reference is null
     or char_length(p_evidence_reference) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'invalid confirmed closure';
  end if;
  update app.jobs
  set status = 'expired', lifecycle_state = 'closed',
      lifecycle_reason = 'confirmed_source_closure',
      last_checked_at = clock_timestamp(), updated_at = clock_timestamp()
  where source_id = p_source_id and external_source_id = p_external_source_id
    and status in ('published', 'pending', 'draft')
  returning * into v_job;
  if not found then return false; end if;
  insert into audit.canonical_job_events (
    event_key, event_type, canonical_job_id, source_job_id, source_id, evidence
  ) values (
    'closed:' || v_job.id::text || ':confirmed_source_closure',
    'closed', coalesce(v_job.canonical_job_id, v_job.id), v_job.id,
    v_job.source_id, jsonb_build_object('evidence_reference', p_evidence_reference)
  ) on conflict (event_key) do nothing;
  return true;
end;
$$;

create table if not exists audit.job_apply_link_checks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.jobs(id) on delete restrict,
  checked_at timestamptz not null,
  result app.apply_link_state not null,
  http_status integer,
  error_code text,
  response_ms integer,
  destination_host text not null,
  created_at timestamptz not null default now(),
  constraint job_apply_link_checks_http_status check (
    http_status is null or http_status between 100 and 599
  ),
  constraint job_apply_link_checks_error check (
    error_code is null or error_code ~ '^[a-z0-9_]{2,80}$'
  ),
  constraint job_apply_link_checks_response check (
    response_ms is null or response_ms between 0 and 30000
  )
);

create index if not exists job_apply_link_checks_job_checked
  on audit.job_apply_link_checks (job_id, checked_at desc);
alter table audit.job_apply_link_checks enable row level security;
alter table audit.job_apply_link_checks force row level security;
revoke all on audit.job_apply_link_checks from public, anon, authenticated;
drop trigger if exists job_apply_link_checks_append_only on audit.job_apply_link_checks;
create trigger job_apply_link_checks_append_only
before update or delete on audit.job_apply_link_checks
for each row execute function security.reject_mutation();

create or replace function api.worker_claim_apply_link_checks(p_limit integer default 20)
returns table (job_id uuid, application_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid apply link claim limit';
  end if;
  return query
  with due as (
    select job.id
    from app.jobs job
    where job.status in ('published', 'pending')
      and job.lifecycle_state <> 'closed'
      and job.canonical_job_id is null
      and (job.apply_link_checked_at is null
        or job.apply_link_checked_at <= clock_timestamp() - interval '24 hours')
      and (job.apply_check_claimed_at is null
        or job.apply_check_claimed_at <= clock_timestamp() - interval '10 minutes')
    order by job.apply_link_checked_at nulls first, job.created_at
    limit p_limit
    for update skip locked
  )
  update app.jobs job
  set apply_check_claimed_at = clock_timestamp()
  from due
  where job.id = due.id
  returning job.id, job.application_url;
end;
$$;

create or replace function api.worker_record_apply_link_check(
  p_job_id uuid,
  p_checked_at timestamptz,
  p_result text,
  p_http_status integer default null,
  p_error_code text default null,
  p_response_ms integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job app.jobs%rowtype;
  v_host text;
begin
  perform security.require_service_role();
  if p_result not in ('healthy', 'broken', 'indeterminate')
     or p_checked_at is null
     or p_checked_at > clock_timestamp() + interval '5 minutes'
     or (p_http_status is not null and p_http_status not between 100 and 599)
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$')
     or (p_response_ms is not null and p_response_ms not between 0 and 30000) then
    raise exception using errcode = '22023', message = 'invalid apply link result';
  end if;
  select * into v_job from app.jobs where id = p_job_id for update;
  if not found then return false; end if;
  v_host := lower(substring(v_job.application_url from '^https://([^/:?#]+)'));
  insert into audit.job_apply_link_checks (
    job_id, checked_at, result, http_status, error_code, response_ms,
    destination_host
  ) values (
    p_job_id, p_checked_at, p_result::app.apply_link_state,
    p_http_status, p_error_code, p_response_ms, v_host
  );
  update app.jobs
  set apply_link_state = p_result::app.apply_link_state,
      apply_link_checked_at = p_checked_at,
      apply_check_claimed_at = null,
      updated_at = clock_timestamp()
  where id = p_job_id;

  if p_result = 'broken' then
    insert into editorial.operational_alerts (
      task_key, run_key, severity, error_code, summary
    ) values (
      'apply_link_check', 'job:' || p_job_id::text, 'warning',
      coalesce(p_error_code, 'apply_link_broken'),
      jsonb_build_object('job_id', p_job_id, 'http_status', p_http_status)
    ) on conflict (task_key, run_key, error_code) do update
    set summary = excluded.summary;
  elsif p_result = 'healthy' then
    update editorial.operational_alerts
    set status = 'resolved', acknowledged_at = clock_timestamp()
    where task_key = 'apply_link_check'
      and run_key = 'job:' || p_job_id::text and status = 'open';
  end if;
  return true;
end;
$$;

create table if not exists audit.job_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  left_job_id uuid not null references app.jobs(id) on delete restrict,
  right_job_id uuid not null references app.jobs(id) on delete restrict,
  title_similarity numeric(5,4) not null,
  evidence jsonb not null,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (left_job_id, right_job_id),
  constraint job_duplicate_candidate_order check (left_job_id < right_job_id),
  constraint job_duplicate_candidate_similarity check (title_similarity between 0.9 and 1),
  constraint job_duplicate_candidate_status check (
    status in ('pending', 'confirmed', 'dismissed')
  ),
  constraint job_duplicate_candidate_evidence check (
    jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 8192
  )
);

create index if not exists job_duplicate_candidates_pending
  on audit.job_duplicate_candidates (created_at)
  where status = 'pending';
alter table audit.job_duplicate_candidates enable row level security;
alter table audit.job_duplicate_candidates force row level security;
revoke all on audit.job_duplicate_candidates from public, anon, authenticated;

create or replace function api.worker_queue_fuzzy_job_duplicates(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
begin
  perform security.require_service_role();
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid duplicate candidate limit';
  end if;
  insert into audit.job_duplicate_candidates (
    left_job_id, right_job_id, title_similarity, evidence
  )
  select left_job.id, right_job.id,
    extensions.similarity(lower(left_job.title), lower(right_job.title)),
    jsonb_build_object(
      'same_company_id', true,
      'left_fingerprint', left_job.dedup_fingerprint,
      'right_fingerprint', right_job.dedup_fingerprint,
      'left_application_host', lower(substring(left_job.application_url from '^https://([^/:?#]+)')),
      'right_application_host', lower(substring(right_job.application_url from '^https://([^/:?#]+)')),
      'automatic_merge', false
    )
  from app.jobs left_job
  join app.jobs right_job
    on left_job.id < right_job.id
   and left_job.company_id = right_job.company_id
   and left_job.dedup_fingerprint is distinct from right_job.dedup_fingerprint
   and (left_job.work_arrangement = right_job.work_arrangement
     or left_job.work_arrangement = 'unspecified'
     or right_job.work_arrangement = 'unspecified')
   and lower(substring(left_job.application_url from '^https://([^/:?#]+)')) =
     lower(substring(right_job.application_url from '^https://([^/:?#]+)'))
   and left_job.application_url <> right_job.application_url
  where left_job.status in ('published', 'pending')
    and right_job.status in ('published', 'pending')
    and left_job.canonical_job_id is null
    and right_job.canonical_job_id is null
    and extensions.similarity(lower(left_job.title), lower(right_job.title)) >= 0.9
  order by extensions.similarity(lower(left_job.title), lower(right_job.title)) desc
  limit p_limit
  on conflict (left_job_id, right_job_id) do nothing;
  get diagnostics v_created = row_count;
  return jsonb_build_object('queued_for_review', v_created, 'automatically_merged', 0);
end;
$$;

create or replace function api.worker_run_source_rights_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
begin
  perform security.require_service_role();
  with expired as (
    update app.job_sources source
    set policy_state = 'expired', status = 'paused', updated_at = clock_timestamp()
    where source.policy_state = 'enabled'
      and source.policy_review_due_at <= clock_timestamp()
    returning source.id, source.adapter_key
  ), alerts as (
    insert into editorial.operational_alerts (
      task_key, run_key, severity, error_code, summary
    )
    select 'source_rights_review', 'source:' || expired.id::text,
      'critical', 'source_policy_expired',
      jsonb_build_object('adapter_key', expired.adapter_key)
    from expired
    on conflict (task_key, run_key, error_code) do update
    set summary = excluded.summary
    returning 1
  )
  select count(*)::integer into v_expired from alerts;
  return jsonb_build_object('expired_sources', v_expired, 'enabled_sources', 0);
end;
$$;

create or replace function api.worker_build_source_health_digest()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  return jsonb_build_object(
    'window_days', 7,
    'new_canonical_jobs', (
      select count(*) from audit.canonical_job_events event
      where event.event_type = 'canonical_created'
        and event.created_at >= clock_timestamp() - interval '7 days'
    ),
    'raw_occurrences', (
      select count(*) from ingest.job_source_occurrences occurrence
      where occurrence.observed_at >= clock_timestamp() - interval '7 days'
    ),
    'open_source_alerts', (
      select count(*) from editorial.operational_alerts alert
      where alert.status = 'open'
        and alert.task_key in (
          'job_source_sync', 'ats_source_sync', 'job_supply_dispatcher',
          'apply_link_check', 'source_rights_review'
        )
    ),
    'external_delivery_performed', false
  );
end;
$$;

revoke all on function api.worker_dispatch_job_supply()
from public, anon, authenticated;
revoke all on function api.worker_run_job_lifecycle()
from public, anon, authenticated;
revoke all on function api.worker_confirm_job_closed(uuid,text,text)
from public, anon, authenticated;
revoke all on function api.worker_claim_apply_link_checks(integer)
from public, anon, authenticated;
revoke all on function api.worker_record_apply_link_check(uuid,timestamptz,text,integer,text,integer)
from public, anon, authenticated;
revoke all on function api.worker_queue_fuzzy_job_duplicates(integer)
from public, anon, authenticated;
revoke all on function api.worker_run_source_rights_review()
from public, anon, authenticated;
revoke all on function api.worker_build_source_health_digest()
from public, anon, authenticated;

grant execute on function api.worker_dispatch_job_supply() to service_role;
grant execute on function api.worker_run_job_lifecycle() to service_role;
grant execute on function api.worker_confirm_job_closed(uuid,text,text) to service_role;
grant execute on function api.worker_claim_apply_link_checks(integer) to service_role;
grant execute on function api.worker_record_apply_link_check(uuid,timestamptz,text,integer,text,integer) to service_role;
grant execute on function api.worker_queue_fuzzy_job_duplicates(integer) to service_role;
grant execute on function api.worker_run_source_rights_review() to service_role;
grant execute on function api.worker_build_source_health_digest() to service_role;

create or replace function security.authorized_ats_source_config_rows()
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  source_name text,
  employer_name text,
  provider text,
  provider_region text,
  tenant_identifier text,
  allowed_destination_hosts text[],
  allowed_destination_path_prefixes text[],
  fetch_interval_seconds integer,
  daily_request_budget smallint,
  minimum_request_spacing_seconds integer,
  publication_mode text,
  homepage_url text,
  terms_url text,
  terms_version text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  may_email_jobs boolean,
  required_destination_kind text,
  authorization_basis text,
  authorization_evidence_ref text,
  authorization_grantor text,
  authorization_reviewed_at timestamptz,
  authorization_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    source.id,
    config.company_id,
    source.adapter_key,
    source.name,
    company.display_name,
    config.provider,
    config.provider_region,
    config.tenant_identifier,
    config.allowed_destination_hosts,
    config.allowed_destination_path_prefixes,
    extract(epoch from config.fetch_interval)::integer,
    config.daily_request_budget,
    extract(epoch from config.minimum_request_spacing)::integer,
    config.publication_mode,
    source.homepage_url,
    source.terms_url,
    source.terms_version,
    source.attribution_required,
    source.attribution_text,
    source.may_store_full_description,
    source.may_index_jobs,
    source.may_emit_jobposting_schema,
    source.may_email_jobs,
    source.required_destination_kind,
    source.authorization_basis,
    source.authorization_evidence_ref,
    source.authorization_grantor,
    source.authorization_reviewed_at,
    source.authorization_expires_at
  from app.job_sources source
  join private.ats_source_configs config on config.source_id = source.id
  join app.companies company on company.id = config.company_id
  where security.job_source_policy_is_runnable(source.id)
    and source.source_type = 'employer_ats'
    and source.allow_public_listing
    and source.authorization_basis in ('written_permission', 'commercial_contract')
    and source.authorization_grantor is not null
    and config.enabled
    and config.fetch_interval = source.refresh_interval
    and company.record_status <> 'removed'
    and company.verification_status <> 'suspended'
    and (
      config.publication_mode = 'review'
      or (
        company.record_status = 'published'
        and company.verification_status in ('domain_verified', 'organization_verified')
      )
    );
$$;

revoke all on function security.authorized_ats_source_config_rows()
from public, anon, authenticated, service_role;

create or replace function api.worker_get_job_source_policy(p_adapter_key text)
returns table (
  source_id uuid,
  adapter_key text,
  source_name text,
  source_type text,
  status text,
  homepage_url text,
  terms_url text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  allow_public_listing boolean,
  required_destination_kind text,
  refresh_interval_seconds integer,
  terms_reviewed_at timestamptz,
  terms_reviewed_by uuid,
  terms_version text,
  review_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or char_length(p_adapter_key) not between 1 and 120
     or p_adapter_key !~ '^[a-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'invalid source adapter key';
  end if;
  return query
  select source.id, source.adapter_key, source.name, source.source_type::text,
    case when security.job_source_policy_is_runnable(source.id)
      then source.status::text else 'paused'::text end,
    source.homepage_url, source.terms_url, source.attribution_required,
    source.attribution_text, source.may_store_full_description,
    source.may_index_jobs, source.may_emit_jobposting_schema,
    source.allow_public_listing, source.required_destination_kind,
    extract(epoch from source.refresh_interval)::integer,
    source.terms_reviewed_at, source.terms_reviewed_by,
    source.terms_version, source.review_requested_at
  from app.job_sources source where source.adapter_key = p_adapter_key;
end;
$$;

revoke all on function api.worker_get_job_source_policy(text)
from public, anon, authenticated;
grant execute on function api.worker_get_job_source_policy(text) to service_role;

create or replace function api.worker_claim_remotive_fetch(
  p_request_key uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_minimum_poll interval;
  v_daily_limit integer;
  v_recent_count integer;
begin
  perform security.require_service_role();
  if p_request_key is null or p_purpose is null
     or p_purpose !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023', message = 'invalid source fetch claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('salarypadi:source-fetch:remotive', 0)
  );
  select source.id, source.minimum_poll_interval,
    source.maximum_requests_per_day
  into v_source_id, v_minimum_poll, v_daily_limit
  from app.job_sources source
  where source.adapter_key = 'remotive'
    and security.job_source_policy_is_runnable(source.id)
    and source.allow_public_listing
    and source.attribution_required
    and not source.may_store_full_description
    and not source.may_index_jobs
    and not source.may_emit_jobposting_schema
    and not source.may_email_jobs
    and source.minimum_poll_interval is not null
    and source.maximum_requests_per_day is not null
  for key share;
  if v_source_id is null then return false; end if;

  if exists (
    select 1 from private.source_fetch_claims claim
    where claim.request_key = p_request_key
  ) then return false; end if;
  if exists (
    select 1 from private.source_fetch_claims claim
    where claim.source_id = v_source_id
      and claim.claimed_at > clock_timestamp() - v_minimum_poll
  ) then return false; end if;

  delete from private.source_fetch_claims
  where claimed_at < clock_timestamp() - interval '30 days';
  select count(*)::integer into v_recent_count
  from private.source_fetch_claims claim
  where claim.source_id = v_source_id
    and claim.claimed_at > clock_timestamp() - interval '24 hours';
  if v_recent_count >= v_daily_limit then return false; end if;

  insert into private.source_fetch_claims (
    request_key, source_id, purpose
  ) values (p_request_key, v_source_id, p_purpose);
  return true;
end;
$$;

revoke all on function api.worker_claim_remotive_fetch(uuid,text)
from public, anon, authenticated;
grant execute on function api.worker_claim_remotive_fetch(uuid,text)
to service_role;

create or replace function security.is_public_job_source(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.job_source_policy_is_runnable(p_source_id)
    and exists (
      select 1 from app.job_sources source
      where source.id = p_source_id and source.allow_public_listing
    );
$$;

revoke all on function security.is_public_job_source(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.is_public_job_source(uuid) to anon, authenticated;

create or replace function security.public_job_provenance(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'source_adapter_key', source.adapter_key,
    'external_source_id', job.external_source_id,
    'canonical_job_id', job.id,
    'lifecycle_state', job.lifecycle_state,
    'lifecycle_reason', coalesce(job.lifecycle_reason, 'source_observed_open'),
    'why_still_open', case when job.valid_through is null
      then 'current source occurrence and no authoritative closure evidence'
      else 'source deadline has not elapsed' end,
    'last_seen_at', job.last_seen_at,
    'last_checked_at', job.last_checked_at,
    'last_verified_at', coalesce(job.last_verified_at, job.last_seen_at),
    'verification_basis', case when job.last_verified_at is null
      then 'source_occurrence_seen' else 'source_verified' end,
    'source_policy_review_due_at', source.policy_review_due_at,
    'public_display_permitted', source.allow_public_listing,
    'search_index_permitted', source.may_index_jobs,
    'google_jobposting_permitted', source.may_emit_jobposting_schema,
    'occurrence_count', (
      select count(*)
      from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    ),
    'latest_occurrence_at', (
      select max(occurrence.observed_at)
      from ingest.job_occurrence_links link
      join ingest.job_source_occurrences occurrence
        on occurrence.id = link.occurrence_id
      where link.canonical_job_id = job.id
    )
  )
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where job.id = p_job_id
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and security.is_public_job_source(job.source_id)
    and exists (
      select 1 from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    );
$$;

revoke all on function security.public_job_provenance(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.public_job_provenance(uuid)
to anon, authenticated;

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and (select security.is_public_job_source(source_id))
  and (select security.public_job_provenance(id)) is not null
);

drop policy if exists job_sources_public_read on app.job_sources;
create policy job_sources_public_read on app.job_sources
for select to anon, authenticated using (
  status = 'active'
  and policy_state = 'enabled'
  and allow_public_listing
  and policy_review_due_at > clock_timestamp()
  and authorization_revoked_at is null
  and (authorization_expires_at is null
    or authorization_expires_at > clock_timestamp())
  and missing_dependencies = '{}'::text[]
);

create or replace view api.jobs
with (security_invoker = true, security_barrier = true)
as
select
  job.id, job.slug, job.title, job.description_text, job.description_html,
  job.requirements_text, job.benefits_text, job.work_arrangement,
  job.employment_type, job.engagement_type, job.experience_level,
  job.role_family_id, job.salary_min, job.salary_max, job.currency_code,
  job.pay_period, job.gross_net, job.bonus_text, job.application_url,
  job.source_url, job.posted_at, job.valid_through, job.last_checked_at,
  coalesce(job.last_verified_at, job.last_seen_at) as last_verified_at,
  company.id as company_id, company.slug as company_slug,
  company.display_name as company_name,
  company.verification_status as company_verification_status,
  source.name as source_name, source.attribution_text, source.may_index_jobs,
  source.may_emit_jobposting_schema,
  eligibility.scope as eligibility_scope,
  eligibility.required_timezone_overlap,
  eligibility.work_authorization_requirement, eligibility.visa_sponsorship,
  eligibility.relocation_support,
  eligibility.evidence_text as eligibility_evidence,
  eligibility.provenance as eligibility_provenance,
  eligibility.last_verified_at as eligibility_verified_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', location.country_code, 'city', location.city,
      'region', location.region, 'is_primary', location.is_primary
    ) order by location.is_primary desc, location.country_code, location.city)
    from app.job_locations location where location.job_id = job.id
  ), '[]'::jsonb) as locations,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', country.country_code, 'rule', country.rule
    ) order by country.rule, country.country_code)
    from app.job_eligibility_countries country where country.job_id = job.id
  ), '[]'::jsonb) as eligibility_countries,
  job.external_source_id,
  job.dedup_fingerprint,
  role.slug as role_slug,
  role.name as role_family,
  source.id as source_id,
  source.adapter_key as source_adapter_key,
  source.source_type,
  source.homepage_url as source_homepage_url,
  source.terms_url as source_terms_url,
  source.attribution_required,
  source.may_store_full_description,
  source.required_destination_kind,
  extract(epoch from source.refresh_interval)::integer as refresh_interval_seconds,
  source.terms_reviewed_at,
  coalesce((
    select jsonb_agg(skill.name order by skill.name)
    from app.job_skills job_skill
    join app.skills skill on skill.id = job_skill.skill_id
    where job_skill.job_id = job.id
  ), '[]'::jsonb) as skills,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', risk.code, 'severity', risk.severity,
      'evidence_text', risk.evidence_text
    ) order by risk.severity desc, risk.code)
    from app.job_risk_indicators risk
    where risk.job_id = job.id and risk.is_public
  ), '[]'::jsonb) as risk_indicators,
  source.may_email_jobs,
  security.public_job_provenance(job.id) as provenance
from app.jobs job
join app.companies company on company.id = job.company_id
join app.job_sources source on source.id = job.source_id
left join app.job_eligibility eligibility on eligibility.job_id = job.id
left join app.role_families role on role.id = job.role_family_id
where job.status = 'published'
  and job.lifecycle_state <> 'closed'
  and job.canonical_job_id is null
  and not job.is_fixture
  and (job.valid_through is null or job.valid_through > clock_timestamp())
  and company.record_status = 'published'
  and security.is_public_job_source(source.id)
  and security.public_job_provenance(job.id) is not null;

create or replace function api.admin_get_job_supply_health()
returns jsonb
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
  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'window_start', clock_timestamp() - interval '7 days',
    'target_daily_new_canonical', (
      select target_daily_new_canonical from private.job_supply_targets where id
    ),
    'authorized_daily_capacity', (
      select coalesce(sum(source.expected_daily_new_canonical), 0)
      from app.job_sources source
      where security.job_source_policy_is_runnable(source.id)
        and source.expected_capacity_evidence_ref is not null
    ),
    'seven_day_new_canonical', (
      select count(*) from audit.canonical_job_events event
      where event.event_type = 'canonical_created'
        and event.created_at >= clock_timestamp() - interval '7 days'
    ),
    'seven_day_raw_occurrences', (
      select count(*) from ingest.job_source_occurrences occurrence
      where occurrence.observed_at >= clock_timestamp() - interval '7 days'
    ),
    'pending_fuzzy_reviews', (
      select count(*) from audit.job_duplicate_candidates candidate
      where candidate.status = 'pending'
    ),
    'broken_apply_links', (
      select count(*) from app.jobs job where job.apply_link_state = 'broken'
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day.day,
        'new_canonical_jobs', (
          select count(*) from audit.canonical_job_events event
          where event.event_type = 'canonical_created'
            and event.created_at >= day.day
            and event.created_at < day.day + interval '1 day'
        ),
        'raw_occurrences', (
          select count(*) from ingest.job_source_occurrences occurrence
          where occurrence.observed_at >= day.day
            and occurrence.observed_at < day.day + interval '1 day'
        )
      ) order by day.day)
      from generate_series(
        date_trunc('day', clock_timestamp()) - interval '6 days',
        date_trunc('day', clock_timestamp()), interval '1 day'
      ) day(day)
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'adapter_key', source.adapter_key,
        'name', source.name,
        'authority', source.authority,
        'policy_state', source.policy_state,
        'runnable', security.job_source_policy_is_runnable(source.id),
        'review_due_at', source.policy_review_due_at,
        'missing_dependencies', source.missing_dependencies,
        'new_canonical_jobs', (
          select count(*) from audit.canonical_job_events event
          where event.source_id = source.id
            and event.event_type = 'canonical_created'
            and event.created_at >= clock_timestamp() - interval '7 days'
        ),
        'raw_occurrences', (
          select count(*) from ingest.job_source_occurrences occurrence
          where occurrence.source_id = source.id
            and occurrence.observed_at >= clock_timestamp() - interval '7 days'
        ),
        'run_count', (
          select count(*) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'last_run_status', (
          select run.status::text from ingest.import_runs run
          where run.source_id = source.id
          order by run.created_at desc limit 1
        ),
        'fetched', (
          select coalesce(sum(run.fetched_count), 0) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'accepted', (
          select sum(run.accepted_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'updated', (
          select coalesce(sum(run.updated_count), 0) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'duplicates', (
          select sum(run.duplicate_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'rejected', (
          select sum(run.rejected_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'closed', (
          select coalesce(sum(run.expired_count), 0) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'nigeria_local', (
          select sum(run.nigeria_local_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'explicit_nigeria_africa_eligible', (
          select sum(run.explicit_eligible_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'unclear_eligibility', (
          select sum(run.unclear_eligibility_count) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'errors', (
          select coalesce(sum(run.error_count), 0) from ingest.import_runs run
          where run.source_id = source.id
            and run.created_at >= clock_timestamp() - interval '7 days'
        ),
        'last_successful_import_at', source.last_successful_import_at
      ) order by source.adapter_key)
      from app.job_sources source
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.admin_get_job_supply_health()
from public, anon, service_role;
grant execute on function api.admin_get_job_supply_health() to authenticated;

revoke all on function security.get_worker_health_internal() from public, anon, authenticated, service_role;
revoke all on function security.complete_job_supply_import_metrics() from public, anon, authenticated, service_role;

commit;
