begin;

/*
 * The job supply canary re-derived the whole provenance policy stack per row.
 *
 * `20260722070000_cached_job_public_provenance` moved that decision onto
 * `app.jobs.public_provenance` precisely because deriving it per row cost about
 * 2.1s for ~210 jobs against a ~3s role statement timeout. The public view and
 * the RLS policy were both switched to the cached column; this canary was
 * missed and kept calling `security.public_job_provenance(job.id)` from its
 * WHERE clause.
 *
 * That survived while the table was small. Once the ATS registry walk finished
 * and `app.jobs` went from ~336 to ~1,005 published rows the function took
 * 5.44s, exceeded the statement timeout, and `/api/health` reported
 * `job_supply: {state: "unavailable"}` -- not because supply was unavailable
 * but because the question could no longer be answered in time. A failed read
 * and an empty answer are the same shape there, which is why it looked benign.
 *
 * Only the visible-job predicate changes. It is the same one the public view
 * and the RLS policy already use, and both were counted against production
 * before this was written: 211 either way. The two per-row policy calls are
 * dropped rather than kept beside the cache, because `public_provenance` is
 * only non-null when both already held, and re-checking them per row restores
 * the cost this removes. Policy changes still land: refreshing provenance is
 * what a policy change triggers, and `public_ready_until` bounds how long a
 * cached answer is honoured.
 *
 * The `last_canonical_created_at` lookup is left alone. It measures ~1.08s,
 * which is inside budget once the count is cached, and touching it would mean
 * changing what the canary counts as evidence of supply.
 *
 * NOTE on the capacity expression below: it reads
 * `expected_new_canonical_per_30d`, not the `expected_daily_new_canonical`
 * column the original 20260714102000 definition used.
 * `20260726190000_capacity_per_30_days` replaced that column and rewrote this
 * function in place with a `do` block, so the newest text of this function does
 * not live in any single migration file. Rebuilding it from the original file
 * alone silently reintroduces a dropped column.
 */
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
  where job.status = 'published'
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
