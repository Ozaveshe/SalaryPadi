begin;

-- worker_begin_ats_snapshot returns an import_run_id column, so PL/pgSQL also
-- exposes that name as an output variable. Qualify the stale-run UPDATE target
-- column to keep the recovery path unambiguous at runtime.
do $migration$
declare
  v_source text;
  v_old constant text :=
    'where import_run_id = v_stale_snapshot.import_run_id;';
  v_new constant text :=
    'where ats_snapshot_runs.import_run_id = v_stale_snapshot.import_run_id;';
begin
  select procedure.prosrc into strict v_source
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'api'
    and procedure.proname = 'worker_begin_ats_snapshot'
    and procedure.proargtypes = '25 1184 23 23'::oidvector;

  if (
    char_length(v_source) - char_length(replace(v_source, v_old, ''))
  ) / char_length(v_old) <> 1 then
    raise exception using errcode = '55000',
      message = 'unexpected ATS snapshot begin source';
  end if;

  v_source := replace(v_source, v_old, v_new);
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
