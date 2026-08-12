-- Keep the stored workflow status aligned with the public publication gate.
-- Country rights alone are not enough: a board can leave an old vacancy open
-- forever, so automatic ATS rows beyond SalaryPadi's 365-day withdrawal bound
-- must remain pending even when their location is distributable.

begin;

create or replace function api.worker_store_ats_snapshot_batch_without_salary(
  p_import_run_id uuid,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_source_id uuid;
  v_publication_mode text;
begin
  perform security.require_service_role();

  select snapshot.source_id, config.publication_mode
  into v_source_id, v_publication_mode
  from ingest.ats_snapshot_runs snapshot
  join private.ats_source_configs config
    on config.source_id = snapshot.source_id
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null
  for share of snapshot, config;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS snapshot is not running';
  end if;

  v_result :=
    api.worker_store_ats_snapshot_batch_without_country_publication(
      p_import_run_id,
      p_records
    );

  if v_publication_mode = 'automatic' then
    update app.jobs job
    set status = case
      when security.job_country_distribution_allowed(job.id, 'public')
        and job.lifecycle_state <> 'closed'
        and job.canonical_job_id is null
        and not job.is_fixture
        and job.posted_at >= statement_timestamp() - interval '365 days'
        and (
          job.valid_through is null
          or job.valid_through > statement_timestamp()
        )
        then 'published'::app.job_status
      else 'pending'::app.job_status
    end
    from jsonb_array_elements(p_records) record
    where job.source_id = v_source_id
      and job.external_source_id = record ->> 'external_id'
      and job.status not in ('removed', 'rejected');
  end if;

  return v_result;
end;
$$;

revoke all on function api.worker_store_ats_snapshot_batch_without_salary(
  uuid, jsonb
) from public, anon, authenticated, service_role;

commit;
