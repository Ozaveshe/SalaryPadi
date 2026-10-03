begin;

-- Count only explicitly remote public roles. Preserve cached provenance checks
-- and the existing response shape for callers during a rolling deployment.
create or replace function api.get_job_supply_canary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visible integer;
  v_target integer;
  v_capacity integer;
  v_last_created timestamptz;
  v_state text;
begin
  select count(*)::integer
  into v_visible
  from app.jobs job
  join app.companies company on company.id = job.company_id
  where job.work_arrangement = 'remote'
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > clock_timestamp())
    and company.record_status = 'published'
    and job.public_provenance is not null
    and (
      job.public_ready_until is null
      or job.public_ready_until > clock_timestamp()
    );

  select target_daily_new_canonical
  into v_target
  from private.job_supply_targets
  where id;

  select floor(coalesce(sum(source.expected_new_canonical_per_30d), 0) / 30.0)::integer
  into v_capacity
  from app.job_sources source
  where security.job_source_policy_is_runnable(source.id)
    and source.expected_capacity_evidence_ref is not null;

  select max(event.created_at)
  into v_last_created
  from audit.canonical_job_events event
  join app.jobs job on job.id = event.canonical_job_id
  where event.event_type = 'canonical_created'
    and security.job_is_public_remote_eligible(job.id);

  v_state := case
    when v_visible = 0 then 'unavailable'
    when v_capacity < v_target then 'capacity_unproven'
    when v_last_created is null
      or v_last_created < clock_timestamp() - interval '36 hours' then 'stale'
    else 'ready'
  end;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'visible_remote_jobs', v_visible,
    'target_daily_new_canonical', v_target,
    'authorized_daily_capacity', v_capacity,
    'last_canonical_created_at', v_last_created,
    'state', v_state
  );
end;
$$;


revoke all on function api.get_job_supply_canary()
from public, anon, authenticated, service_role;
grant execute on function api.get_job_supply_canary() to anon, authenticated;


commit;
