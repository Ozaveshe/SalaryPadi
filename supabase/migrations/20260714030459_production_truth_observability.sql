begin;

-- Preserve unknown historical values as NULL. These columns describe source
-- processing evidence; they do not change publication or source policy.
alter table ingest.import_runs
  add column if not exists source_checked_at timestamptz,
  add column if not exists accepted_count integer,
  add column if not exists duplicate_count integer,
  add column if not exists rejected_count integer,
  add column if not exists nigeria_local_count integer,
  add column if not exists explicit_eligible_count integer,
  add column if not exists unclear_eligibility_count integer;

alter table ingest.import_runs
  drop constraint if exists import_runs_observability_counts_nonnegative;
alter table ingest.import_runs
  add constraint import_runs_observability_counts_nonnegative check (
    (accepted_count is null or accepted_count >= 0)
    and (duplicate_count is null or duplicate_count >= 0)
    and (rejected_count is null or rejected_count >= 0)
    and (nigeria_local_count is null or nigeria_local_count >= 0)
    and (explicit_eligible_count is null or explicit_eligible_count >= 0)
    and (unclear_eligibility_count is null or unclear_eligibility_count >= 0)
  );

comment on column ingest.import_runs.source_checked_at is
  'Provider snapshot time. NULL means the historical run did not record this evidence.';
comment on column ingest.import_runs.accepted_count is
  'Records accepted into the source canonicalization set after fingerprint deduplication; NULL means not measured.';
comment on column ingest.import_runs.duplicate_count is
  'Fetched records removed by source canonicalization deduplication; NULL means not measured.';
comment on column ingest.import_runs.rejected_count is
  'Fetched records rejected before canonicalization; NULL means not measured.';
comment on column ingest.import_runs.explicit_eligible_count is
  'Accepted records explicitly eligible for Nigeria or another African country/region; NULL means not measured.';

create or replace function api.worker_record_source_import_v2(
  p_adapter_key text,
  p_started_at timestamptz,
  p_source_checked_at timestamptz,
  p_fetched_count integer,
  p_accepted_count integer,
  p_duplicate_count integer,
  p_rejected_count integer,
  p_nigeria_local_count integer,
  p_explicit_eligible_count integer,
  p_unclear_eligibility_count integer,
  p_status text,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_import_id uuid;
begin
  perform security.require_service_role();
  if p_status not in ('succeeded', 'failed')
     or p_started_at is null
     or p_started_at > clock_timestamp() + interval '5 minutes'
     or (p_source_checked_at is not null
       and p_source_checked_at > clock_timestamp() + interval '5 minutes')
     or p_fetched_count < 0
     or p_accepted_count < 0
     or p_duplicate_count < 0
     or p_rejected_count < 0
     or p_nigeria_local_count < 0
     or p_explicit_eligible_count < 0
     or p_unclear_eligibility_count < 0
     or p_accepted_count + p_duplicate_count + p_rejected_count <> p_fetched_count
     or p_nigeria_local_count > p_accepted_count
     or p_explicit_eligible_count > p_accepted_count
     or p_unclear_eligibility_count > p_accepted_count
     or (p_status = 'succeeded' and p_source_checked_at is null)
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$') then
    raise exception using errcode = '22023', message = 'invalid source result';
  end if;

  select id into strict v_source_id
  from app.job_sources
  where adapter_key = p_adapter_key and status = 'active';

  insert into ingest.import_runs (
    source_id, status, triggered_by, started_at, completed_at,
    source_checked_at, fetched_count, accepted_count, duplicate_count,
    rejected_count, nigeria_local_count, explicit_eligible_count,
    unclear_eligibility_count, created_count, updated_count,
    unchanged_count, expired_count, error_count, error_summary
  ) values (
    v_source_id, p_status::ingest.import_status, 'netlify_schedule',
    p_started_at, clock_timestamp(), p_source_checked_at, p_fetched_count,
    p_accepted_count, p_duplicate_count, p_rejected_count,
    p_nigeria_local_count, p_explicit_eligible_count,
    p_unclear_eligibility_count, 0, 0, 0, 0,
    case when p_status = 'failed' then 1 else 0 end,
    case when p_error_code is null then '{}'::jsonb
         else jsonb_build_object('code', p_error_code) end
  ) returning id into v_import_id;

  if p_status = 'succeeded' then
    update app.job_sources
    set last_successful_import_at = clock_timestamp()
    where id = v_source_id;
  end if;
  return v_import_id;
end;
$$;

revoke all on function api.worker_record_source_import_v2(
  text,timestamptz,timestamptz,integer,integer,integer,integer,
  integer,integer,integer,text,text
) from public, anon, authenticated;
grant execute on function api.worker_record_source_import_v2(
  text,timestamptz,timestamptz,integer,integer,integer,integer,
  integer,integer,integer,text,text
) to service_role;

-- The editorial automation already writes its own alerts. Extend the tracked
-- worker transaction to create and resolve durable alerts for every other
-- worker without sending external messages.
create or replace function api.worker_finish(
  p_run_id uuid,
  p_status text,
  p_summary jsonb default '{}'::jsonb,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
  v_task_key text;
  v_run_key text;
begin
  perform security.require_service_role();
  if p_status not in ('succeeded', 'failed', 'skipped')
     or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 16384
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$') then
    raise exception using errcode = '22023', message = 'invalid worker result';
  end if;

  update private.worker_runs
  set status = p_status,
      completed_at = clock_timestamp(),
      summary = coalesce(p_summary, '{}'::jsonb),
      error_code = p_error_code
  where id = p_run_id and status = 'running'
  returning task_key, run_key into v_task_key, v_run_key;
  get diagnostics v_changed = row_count;

  if v_changed = 1 and left(v_task_key, 10) <> 'editorial_' then
    if p_status = 'failed' then
      insert into editorial.operational_alerts (
        task_key, run_key, severity, error_code, summary
      ) values (
        v_task_key, v_run_key,
        case when v_task_key in ('job_source_sync', 'ats_source_sync')
          then 'critical' else 'warning' end,
        coalesce(p_error_code, 'worker_failed'),
        coalesce(p_summary, '{}'::jsonb)
      )
      on conflict (task_key, run_key, error_code) do update
      set summary = excluded.summary;
    elsif p_status = 'succeeded' then
      update editorial.operational_alerts
      set status = 'resolved', acknowledged_at = clock_timestamp()
      where task_key = v_task_key and status = 'open';
    end if;
  end if;

  return v_changed = 1;
end;
$$;

revoke all on function api.worker_finish(uuid,text,jsonb,text)
from public, anon, authenticated;
grant execute on function api.worker_finish(uuid,text,jsonb,text)
to service_role;

create or replace function api.admin_get_production_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.has_staff_role('admin'))
     or not (select security.is_aal2()) then
    raise exception using errcode = '42501',
      message = 'admin role and AAL2 required';
  end if;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'window_start', clock_timestamp() - interval '14 days',
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_key', health.task_key,
        'enabled', health.freshness <> 'disabled',
        'expected_interval_seconds', extract(epoch from schedule.expected_interval)::integer,
        'stale_after_seconds', extract(epoch from schedule.stale_after)::integer,
        'last_status', health.last_status,
        'last_started_at', health.last_started_at,
        'last_success_at', health.last_success_at,
        'freshness', health.freshness
      ) order by health.task_key)
      from security.get_worker_health_internal() health
      join private.worker_schedules schedule using (task_key)
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'adapter_key', source.adapter_key,
        'name', source.name,
        'status', source.status,
        'allow_public_listing', source.allow_public_listing,
        'may_store_full_description', source.may_store_full_description,
        'may_index_jobs', source.may_index_jobs,
        'may_emit_jobposting_schema', source.may_emit_jobposting_schema,
        'may_email_jobs', source.may_email_jobs,
        'required_destination_kind', source.required_destination_kind,
        'refresh_interval_seconds', extract(epoch from source.refresh_interval)::integer,
        'last_successful_import_at', source.last_successful_import_at,
        'runs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'started_at', run.started_at,
            'completed_at', run.completed_at,
            'source_checked_at', run.source_checked_at,
            'status', run.status,
            'duration_ms', case when run.completed_at is null or run.started_at is null
              then null else round(extract(epoch from (run.completed_at - run.started_at)) * 1000)::bigint end,
            'fetched', run.fetched_count,
            'accepted', run.accepted_count,
            'new_canonical_jobs', run.created_count,
            'updated', run.updated_count,
            'duplicates', run.duplicate_count,
            'rejected', run.rejected_count,
            'closed', run.expired_count,
            'nigeria_local', run.nigeria_local_count,
            'explicit_nigeria_africa_eligible', run.explicit_eligible_count,
            'unclear_eligibility', run.unclear_eligibility_count,
            'errors', run.error_count,
            'error_code', nullif(run.error_summary ->> 'code', '')
          ) order by run.started_at desc)
          from ingest.import_runs run
          where run.source_id = source.id
            and run.started_at >= clock_timestamp() - interval '14 days'
        ), '[]'::jsonb)
      ) order by source.adapter_key)
      from app.job_sources source
      where source.status = 'active'
    ), '[]'::jsonb),
    'open_alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_key', alert.task_key,
        'severity', alert.severity,
        'error_code', alert.error_code,
        'created_at', alert.created_at
      ) order by alert.created_at desc)
      from editorial.operational_alerts alert
      where alert.status = 'open'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.admin_get_production_health()
from public, anon, service_role;
grant execute on function api.admin_get_production_health()
to authenticated;

commit;
