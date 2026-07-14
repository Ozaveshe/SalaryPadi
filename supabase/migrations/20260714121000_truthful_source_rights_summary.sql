create or replace function api.worker_run_source_rights_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
  v_enabled integer := 0;
  v_runnable integer := 0;
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

  select count(*)::integer into v_enabled
  from app.job_sources source
  where source.policy_state = 'enabled';

  select count(*)::integer into v_runnable
  from app.job_sources source
  where security.job_source_policy_is_runnable(source.id);

  return jsonb_build_object(
    'expired_sources', v_expired,
    'enabled_sources', v_enabled,
    'runnable_sources', v_runnable
  );
end;
$$;
