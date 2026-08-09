-- Close jobs their source stopped showing, and stop publishing broken
-- apply links.
--
-- Two production defects found by the 9 August completion audit:
--
-- 1. The unconfirmed-window closure in api.worker_run_job_lifecycle covered
--    only direct_employer/manual sources. ATS and feed jobs relied on
--    snapshot-absence counting — which lives on ingest.raw_job_records rows
--    that the retention purge deletes. 78 published jobs whose boards last
--    showed them around 30 July were still published+open on 9 August:
--    receipts purged, absence counters gone, publicly invisible (provenance
--    NULL) yet internally alive forever. The lifecycle pass now closes a
--    non-direct job its source has not shown for seven days — but only when
--    the source itself has kept importing successfully well past the job's
--    last sighting, so a paused or failing source can never close anything
--    (one outage must not expire an estate).
--
-- 2. apply_link_state = 'broken' raised an operational alert and nothing
--    else: the RLS policy never referenced it, so a job whose apply link
--    404s stayed published — the "broken apply link remains verified"
--    prohibited regression. Publication now requires the link not be in the
--    broken state, and the state itself becomes broken only after two
--    consecutive definitive failures (404/410/451), so one transient
--    mis-served response cannot unpublish a job.
--
-- Apply timing: standalone and code-independent — the workers call the same
-- function names with the same signatures. Safe to apply before or after
-- the accompanying deploy.

begin;

-- Two-strike state for the apply-link checker. The audit trail
-- (audit.job_apply_link_checks) still records every raw result.
alter table app.jobs
  add column if not exists apply_link_consecutive_failures integer not null default 0;

comment on column app.jobs.apply_link_consecutive_failures is
  'Consecutive definitive apply-link failures (404/410/451). The operative broken state requires two, so one transient mis-served response cannot unpublish a job. Reset by a healthy check; indeterminate checks leave it unchanged.';

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
  v_failures integer;
  v_state app.apply_link_state;
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

  -- The stored state is the OPERATIVE state, not the raw last result: one
  -- definitive failure records as indeterminate and arms the counter; the
  -- second consecutive failure makes the state broken (which unpublishes,
  -- via the read policy below); any healthy check resets both.
  v_failures := case
    when p_result = 'broken' then v_job.apply_link_consecutive_failures + 1
    when p_result = 'healthy' then 0
    else v_job.apply_link_consecutive_failures
  end;
  v_state := case
    when p_result = 'broken' and v_failures < 2 then 'indeterminate'
    else p_result::app.apply_link_state
  end;

  update app.jobs
  set apply_link_state = v_state,
      apply_link_consecutive_failures = v_failures,
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
      jsonb_build_object(
        'job_id', p_job_id, 'http_status', p_http_status,
        'consecutive_failures', v_failures
      )
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

-- A confirmed-broken destination is not a publishable job: "where does
-- Apply lead" is part of the product's promise. This extends the CURRENT
-- lean policy from 20260722070000 (provenance is cached on the row after
-- the 57014 timeout incident) — it must not reintroduce the per-row
-- function calls that policy removed.
drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and apply_link_state <> 'broken'
  and public_provenance is not null
  and (public_ready_until is null
    or public_ready_until > clock_timestamp())
);

create or replace function api.worker_run_job_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deadline integer := 0;
  v_manual integer := 0;
  v_absence integer := 0;
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

  -- Sourced jobs the provider stopped showing. Snapshot-absence counting is
  -- the fast path, but its substrate (raw records and their counters) is
  -- retention-purged, so a job that fell out of its board near a purge kept
  -- its published state forever. Close after seven unseen days — and only
  -- when the source has demonstrably kept importing since well after the
  -- job's last sighting: a paused, failing or newly-quiet source proves
  -- nothing about the job and must not close it.
  update app.jobs job
  set status = 'expired', lifecycle_state = 'closed',
      lifecycle_reason = 'source_absence_window_elapsed',
      last_checked_at = clock_timestamp(), updated_at = clock_timestamp()
  from app.job_sources source
  where source.id = job.source_id
    and source.source_type not in ('direct_employer', 'manual')
    and job.status in ('published', 'pending', 'draft')
    and job.valid_through is null
    and job.last_seen_at is not null
    and job.last_seen_at <= clock_timestamp() - interval '7 days'
    and source.last_successful_import_at is not null
    and source.last_successful_import_at
      >= clock_timestamp() - interval '48 hours'
    and source.last_successful_import_at
      >= job.last_seen_at + interval '5 days';
  get diagnostics v_absence = row_count;

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
    'source_absence_closed', v_absence,
    'closed_total', v_deadline + v_manual + v_absence,
    'retention_occurrences_purged', v_retention_purged,
    'retention_raw_records_purged', v_raw_retention_purged
  );
end;
$$;

commit;
