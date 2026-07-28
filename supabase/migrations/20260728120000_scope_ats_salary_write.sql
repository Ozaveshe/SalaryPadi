-- Confine the ATS salary write to sources whose reviewed policy covers salary.
--
-- 20260728100000 applied its `update app.jobs` to every record in the batch,
-- not only the records carrying salary. Where a record has no salary the CASE
-- expressions all resolve to null, so salary_min, salary_max, currency_code and
-- pay_period were cleared and gross_net reset to 'unspecified'. For a source
-- whose allowed_fields excludes salary no record can carry salary at all — the
-- validation loop raises 42501 first — so every sync from such a source wiped
-- the compensation held for its rows.
--
-- Clearing is the correct provenance answer only where the source is permitted
-- to state pay and has stopped stating it. Where the reviewed policy does not
-- cover salary the source is not an authority on compensation, so a batch from
-- it must leave the stored values untouched rather than assert they are absent.
-- The guard therefore sits on the policy, not on the presence of a value.

begin;

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
  v_result jsonb;
  v_record jsonb;
  v_salary jsonb;
  v_source_id uuid;
  v_allowed_fields text[];
  v_salary_permitted boolean;
  v_minimum numeric;
  v_maximum numeric;
begin
  perform security.require_service_role();

  if p_import_run_id is null
     or p_records is null
     or jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode = '22023',
      message = 'ATS batch must contain 1 to 200 records and at most 4 MiB';
  end if;

  select snapshot.source_id, source.allowed_fields
  into v_source_id, v_allowed_fields
  from ingest.ats_snapshot_runs snapshot
  join app.job_sources source on source.id = snapshot.source_id
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null
  for share of snapshot, source;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS snapshot is not running';
  end if;

  v_salary_permitted :=
    'salary' = any(coalesce(v_allowed_fields, '{}'::text[]));

  for v_record in select value from jsonb_array_elements(p_records) loop
    if v_record ? 'salary'
       and jsonb_typeof(v_record -> 'salary') <> 'null' then
      v_salary := v_record -> 'salary';
      if not v_salary_permitted then
        raise exception using errcode = '42501',
          message = 'salary is not permitted by the reviewed source policy';
      end if;
      if jsonb_typeof(v_salary) <> 'object'
         or jsonb_typeof(v_salary -> 'source_text') <> 'string'
         or char_length(btrim(v_salary ->> 'source_text'))
           not between 1 and 2000
         or (
           v_salary ? 'currency'
           and jsonb_typeof(v_salary -> 'currency')
             not in ('string', 'null')
         )
         or (
           jsonb_typeof(v_salary -> 'currency') = 'string'
           and (v_salary ->> 'currency') !~ '^[A-Z]{3}$'
         )
         or (
           v_salary ? 'period'
           and jsonb_typeof(v_salary -> 'period') not in ('string', 'null')
         )
         or (
           jsonb_typeof(v_salary -> 'period') = 'string'
           and (v_salary ->> 'period') not in (
             'hourly', 'daily', 'weekly', 'monthly', 'annual'
           )
         )
         or (
           v_salary ? 'gross_net'
           and jsonb_typeof(v_salary -> 'gross_net') <> 'string'
         )
         or coalesce(v_salary ->> 'gross_net', 'unspecified')
           not in ('gross', 'net', 'unspecified')
         or (
           v_salary ? 'minimum'
           and jsonb_typeof(v_salary -> 'minimum') not in ('number', 'null')
         )
         or (
           v_salary ? 'maximum'
           and jsonb_typeof(v_salary -> 'maximum') not in ('number', 'null')
         ) then
        raise exception using errcode = '22023',
          message = 'invalid normalized ATS salary evidence';
      end if;

      v_minimum := case
        when jsonb_typeof(v_salary -> 'minimum') = 'number'
          then (v_salary ->> 'minimum')::numeric
        else null
      end;
      v_maximum := case
        when jsonb_typeof(v_salary -> 'maximum') = 'number'
          then (v_salary ->> 'maximum')::numeric
        else null
      end;
      if (v_minimum is not null and (
            v_minimum < 0 or v_minimum > 9999999999999999.99
          ))
         or (v_maximum is not null and (
            v_maximum < 0 or v_maximum > 9999999999999999.99
          ))
         or (
           v_minimum is not null
           and v_maximum is not null
           and v_maximum < v_minimum
         )
         or (
           (v_minimum is not null or v_maximum is not null)
           and (
             nullif(v_salary ->> 'currency', '') is null
             or nullif(v_salary ->> 'period', '') is null
           )
         )
         or (
           v_minimum is null
           and v_maximum is null
           and (
             jsonb_typeof(v_salary -> 'currency') = 'string'
             or jsonb_typeof(v_salary -> 'period') = 'string'
           )
         ) then
        raise exception using errcode = '22023',
          message = 'invalid normalized ATS salary evidence';
      end if;
    end if;
  end loop;

  v_result := api.worker_store_ats_snapshot_batch_without_salary(
    p_import_run_id,
    p_records
  );

  -- Only a source reviewed for salary may state — or withdraw — compensation.
  if v_salary_permitted then
    for v_record in select value from jsonb_array_elements(p_records) loop
      v_salary := case
        when v_record ? 'salary'
          and jsonb_typeof(v_record -> 'salary') <> 'null'
          then v_record -> 'salary'
        else null
      end;

      if v_salary is not null then
        update ingest.raw_job_records
        set raw_payload = raw_payload || jsonb_build_object('salary', v_salary)
        where source_id = v_source_id
          and external_source_id = v_record ->> 'external_id';
      end if;

      update app.jobs
      set salary_min = case
            when jsonb_typeof(v_salary -> 'minimum') = 'number'
              then (v_salary ->> 'minimum')::numeric
            else null
          end,
          salary_max = case
            when jsonb_typeof(v_salary -> 'maximum') = 'number'
              then (v_salary ->> 'maximum')::numeric
            else null
          end,
          currency_code = nullif(v_salary ->> 'currency', ''),
          pay_period = case
            when nullif(v_salary ->> 'period', '') is null then null
            else (v_salary ->> 'period')::app.pay_period
          end,
          gross_net = coalesce(
            nullif(v_salary ->> 'gross_net', ''),
            'unspecified'
          )::app.gross_net_classification
      where source_id = v_source_id
        and external_source_id = v_record ->> 'external_id';
    end loop;
  end if;

  return v_result;
end;
$$;

revoke all on function api.worker_store_ats_snapshot_batch(uuid, jsonb)
from public, anon, authenticated;
grant execute on function api.worker_store_ats_snapshot_batch(uuid, jsonb)
to service_role;

commit;
