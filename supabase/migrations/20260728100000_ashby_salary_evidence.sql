-- Preserve employer-published Ashby compensation without widening the ATS
-- publication boundary. The public Ashby feed exposes compensation only when
-- explicitly requested; canonical values are accepted only when the source's
-- reviewed allowed-fields policy includes salary.

begin;

alter function api.worker_store_ats_snapshot_batch(uuid, jsonb)
  rename to worker_store_ats_snapshot_batch_without_salary;

revoke all on function api.worker_store_ats_snapshot_batch_without_salary(
  uuid, jsonb
) from public, anon, authenticated, service_role;

create function api.worker_store_ats_snapshot_batch(
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

  for v_record in select value from jsonb_array_elements(p_records) loop
    if v_record ? 'salary'
       and jsonb_typeof(v_record -> 'salary') <> 'null' then
      v_salary := v_record -> 'salary';
      if not ('salary' = any(v_allowed_fields)) then
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

  return v_result;
end;
$$;

revoke all on function api.worker_store_ats_snapshot_batch(uuid, jsonb)
from public, anon, authenticated;
grant execute on function api.worker_store_ats_snapshot_batch(uuid, jsonb)
to service_role;

-- The existing evidence trigger covered direct submissions and manual rows.
-- Employer ATS postings are also direct employer evidence, and the normalized
-- raw record now carries the exact source salary summary.
create or replace function security.record_direct_job_salary_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type app.source_type;
  v_occurrence_id uuid;
  v_source_text text;
  v_factor numeric;
  v_assumptions jsonb := '[]'::jsonb;
begin
  select source.source_type into v_source_type
  from app.job_sources source where source.id = new.source_id;
  if v_source_type not in ('direct_employer', 'employer_ats', 'manual')
     or (new.salary_min is null and new.salary_max is null) then
    return new;
  end if;

  select occurrence.id into v_occurrence_id
  from ingest.job_source_occurrences occurrence
  where occurrence.source_id = new.source_id
    and occurrence.external_source_id = new.external_source_id
  order by occurrence.observed_at desc, occurrence.created_at desc
  limit 1;

  select raw.raw_payload #>> '{salary,source_text}' into v_source_text
  from ingest.raw_job_records raw
  where raw.source_id = new.source_id
    and raw.external_source_id = new.external_source_id
  order by raw.last_seen_at desc
  limit 1;

  v_factor := case new.pay_period
    when 'hourly' then 2080
    when 'daily' then 260
    when 'weekly' then 52
    when 'monthly' then 12
    when 'annual' then 1
    else null end;
  if v_factor is not null then
    v_assumptions := jsonb_build_array(case new.pay_period
      when 'hourly' then 'hourly multiplied by 40 hours/week and 52 weeks/year'
      when 'daily' then 'daily multiplied by 5 days/week and 52 weeks/year'
      when 'weekly' then 'weekly multiplied by 52 weeks/year'
      when 'monthly' then 'monthly multiplied by 12 months/year'
      else 'source period is annual' end);
  end if;

  insert into app.job_salary_evidence (
    job_id, occurrence_id, source_text, original_currency,
    original_minimum, original_maximum, original_period, gross_net,
    derived_annual_minimum, derived_annual_maximum,
    derived_monthly_minimum, derived_monthly_maximum,
    derivation_assumptions
  ) values (
    new.id, v_occurrence_id,
    coalesce(
      nullif(btrim(v_source_text), ''),
      jsonb_strip_nulls(jsonb_build_object(
        'currency', new.currency_code, 'minimum', new.salary_min,
        'maximum', new.salary_max, 'period', new.pay_period,
        'gross_net', new.gross_net
      ))::text
    ),
    new.currency_code, new.salary_min, new.salary_max, new.pay_period,
    new.gross_net,
    case when v_factor is null then null else new.salary_min * v_factor end,
    case when v_factor is null then null else new.salary_max * v_factor end,
    case when v_factor is null then null else new.salary_min * v_factor / 12 end,
    case when v_factor is null then null else new.salary_max * v_factor / 12 end,
    v_assumptions
  )
  on conflict (job_id, occurrence_id) do update
  set source_text = excluded.source_text,
      original_currency = excluded.original_currency,
      original_minimum = excluded.original_minimum,
      original_maximum = excluded.original_maximum,
      original_period = excluded.original_period,
      gross_net = excluded.gross_net,
      derived_annual_minimum = excluded.derived_annual_minimum,
      derived_annual_maximum = excluded.derived_annual_maximum,
      derived_monthly_minimum = excluded.derived_monthly_minimum,
      derived_monthly_maximum = excluded.derived_monthly_maximum,
      derivation_assumptions = excluded.derivation_assumptions;
  return new;
end;
$$;

revoke all on function security.record_direct_job_salary_evidence()
from public, anon, authenticated, service_role;

commit;
