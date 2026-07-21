-- Hold ATS jobs for non-activated country packs as pending instead of
-- letting the publication guard abort the whole batch. A record that
-- names a market country whose pack is not activated for public jobs
-- (or where the source lacks runnable public-display rights for that
-- country) is still stored, but its canonical job stays 'pending' until
-- the pack launches. Without this, one Nairobi-located role rejected
-- all 107 Moniepoint records at publish time.

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
  v_context record;
  v_snapshot record;
  v_record jsonb;
  v_location jsonb;
  v_country jsonb;
  v_record_count integer;
  v_seen_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_external_id text;
  v_title text;
  v_source_url text;
  v_application_url text;
  v_original_employer_url text;
  v_description text;
  v_stored_payload jsonb;
  v_content_hash text;
  v_dedup_fingerprint text;
  v_previous_hash text;
  v_raw_record_id uuid;
  v_job_id uuid;
  v_job_exists boolean;
  v_slug_base text;
  v_slug text;
  v_primary_locations integer;
  v_publishable boolean;
  v_placeholder constant text :=
    'This listing is available as source metadata only. SalaryPadi does not store the provider''s full job description; use the application link to review the original posting.';
begin
  perform security.require_service_role();
  if p_import_run_id is null
     or p_records is null
     or jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode = '22023',
      message = 'ATS batch must contain 1 to 200 records and at most 4 MiB';
  end if;
  v_record_count := jsonb_array_length(p_records);
  if v_record_count not between 1 and 200
     or octet_length(p_records::text) > 4194304 then
    raise exception using errcode = '22023',
      message = 'ATS batch must contain 1 to 200 records and at most 4 MiB';
  end if;

  -- Serialize batches for one run and reject duplicate external IDs both
  -- within this request and across earlier batches in the same snapshot.
  -- Lock every mutable policy row before reading the authorization context;
  -- otherwise a concurrent revocation/config edit could commit after the
  -- check while this batch persists data under cached old permissions.
  select snapshot.* into v_snapshot
  from ingest.ats_snapshot_runs snapshot
  where snapshot.import_run_id = p_import_run_id
    and snapshot.finalized_at is null
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS snapshot is not running';
  end if;

  perform 1 from private.ats_source_configs config
  where config.source_id = v_snapshot.source_id for share;
  perform 1 from app.job_sources source
  where source.id = v_snapshot.source_id for share;
  perform 1 from app.companies company
  where company.id = v_snapshot.company_id for share;

  select * into v_context
  from security.authorized_ats_snapshot_context(p_import_run_id);
  if not found then
    raise exception using errcode = '42501',
      message = 'running authorized ATS snapshot required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) item
    group by item ->> 'external_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_records) item
    join ingest.ats_snapshot_seen_records seen
      on seen.import_run_id = p_import_run_id
     and seen.external_source_id = item ->> 'external_id'
  ) then
    raise exception using errcode = '22023',
      message = 'duplicate ATS external ID in snapshot';
  end if;

  for v_record in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_record) <> 'object' then
      raise exception using errcode = '22023',
        message = 'ATS record must be an object';
    end if;

    v_external_id := nullif(btrim(v_record ->> 'external_id'), '');
    v_title := nullif(btrim(v_record ->> 'title'), '');
    v_source_url := nullif(btrim(v_record ->> 'source_url'), '');
    v_application_url := nullif(btrim(v_record ->> 'application_url'), '');
    v_original_employer_url :=
      nullif(btrim(v_record ->> 'original_employer_url'), '');
    v_description := nullif(btrim(v_record ->> 'description_text'), '');
    v_content_hash := nullif(btrim(v_record ->> 'content_hash'), '');
    v_dedup_fingerprint :=
      nullif(btrim(v_record ->> 'dedup_fingerprint'), '');

    if v_external_id is null
       or char_length(v_external_id) > 300
       or v_title is null
       or char_length(v_title) not between 2 and 300
       or coalesce(v_content_hash, '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_dedup_fingerprint, '') !~ '^[0-9a-f]{64}$'
       or not (v_record ? 'eligibility')
       or (v_description is not null
         and char_length(v_description) not between 20 and 100000)
       or not security.ats_destination_is_allowed(
         v_source_url,
         v_context.allowed_destination_hosts,
         v_context.allowed_destination_path_prefixes
       )
       or not security.ats_destination_is_allowed(
         v_application_url,
         v_context.allowed_destination_hosts,
         v_context.allowed_destination_path_prefixes
       )
       or (
         v_original_employer_url is not null
         and not security.ats_destination_is_allowed(
           v_original_employer_url,
           v_context.allowed_destination_hosts,
           v_context.allowed_destination_path_prefixes
         )
       )
       or coalesce(v_record ->> 'work_arrangement', 'unspecified') not in (
         'remote', 'hybrid', 'onsite', 'unspecified'
       )
       or coalesce(v_record ->> 'employment_type', 'other') not in (
         'full_time', 'part_time', 'contract', 'freelance', 'temporary',
         'internship', 'graduate_trainee', 'other'
       )
       or coalesce(v_record ->> 'engagement_type', 'unspecified') not in (
         'employee', 'contractor', 'freelance', 'unspecified'
       )
       or coalesce(v_record ->> 'experience_level', 'unspecified') not in (
         'entry', 'junior', 'mid', 'senior', 'lead', 'executive',
         'unspecified'
       ) then
      raise exception using errcode = '22023',
        message = 'invalid normalized ATS job metadata';
    end if;

    if v_record ? 'locations' then
      if jsonb_typeof(v_record -> 'locations') <> 'array'
         or jsonb_array_length(v_record -> 'locations') > 20 then
        raise exception using errcode = '22023',
          message = 'invalid ATS locations';
      end if;
      v_primary_locations := 0;
      for v_location in
        select value from jsonb_array_elements(v_record -> 'locations')
      loop
        if jsonb_typeof(v_location) <> 'object'
           or (
             v_location ? 'country_code'
             and v_location ->> 'country_code' is not null
             and v_location ->> 'country_code' !~ '^[A-Z]{2}$'
           )
           or char_length(coalesce(v_location ->> 'city', '')) > 160
           or char_length(coalesce(v_location ->> 'region', '')) > 160
           or (
             v_location ? 'is_primary'
             and jsonb_typeof(v_location -> 'is_primary') <> 'boolean'
           ) then
          raise exception using errcode = '22023',
            message = 'invalid ATS location evidence';
        end if;
        if coalesce((v_location ->> 'is_primary')::boolean, false) then
          v_primary_locations := v_primary_locations + 1;
        end if;
      end loop;
      if v_primary_locations > 1 then
        raise exception using errcode = '22023',
          message = 'ATS locations may contain one primary location';
      end if;
    end if;

    if v_record ? 'eligibility' then
      if jsonb_typeof(v_record -> 'eligibility') <> 'object'
         or coalesce(v_record #>> '{eligibility,scope}', '') not in (
           'worldwide', 'africa', 'emea', 'nigeria', 'named_countries',
           'restricted_region', 'unclear'
         )
         or coalesce(
           v_record #>> '{eligibility,provenance}',
           'source_provided'
         ) <> 'source_provided'
         or char_length(coalesce(
           v_record #>> '{eligibility,evidence_text}', ''
         )) > 2000
         or (
           (v_record -> 'eligibility') ? 'confidence'
           and not case
             when jsonb_typeof(
               v_record #> '{eligibility,confidence}'
             ) = 'number'
             then (v_record #>> '{eligibility,confidence}')::numeric
               between 0 and 1
             else false
           end
         )
         or (
           (v_record -> 'eligibility') ? 'visa_sponsorship'
           and jsonb_typeof(
             v_record #> '{eligibility,visa_sponsorship}'
           ) <> 'boolean'
         )
         or (
           (v_record -> 'eligibility') ? 'relocation_support'
           and jsonb_typeof(
             v_record #> '{eligibility,relocation_support}'
           ) <> 'boolean'
         )
         or (
           (v_record -> 'eligibility') ? 'countries'
           and (
             jsonb_typeof(v_record #> '{eligibility,countries}') <> 'array'
             or jsonb_array_length(
               v_record #> '{eligibility,countries}'
             ) > 250
           )
         ) then
        raise exception using errcode = '22023',
          message = 'invalid ATS eligibility evidence';
      end if;
      for v_country in
        select value
        from jsonb_array_elements(coalesce(
          v_record #> '{eligibility,countries}', '[]'::jsonb
        ))
      loop
        if jsonb_typeof(v_country) <> 'object'
           or coalesce(v_country ->> 'country_code', '')
             !~ '^[A-Z]{2}$'
           or coalesce(v_country ->> 'rule', '')
             not in ('include', 'exclude') then
          raise exception using errcode = '22023',
            message = 'invalid ATS eligibility country evidence';
        end if;
      end loop;
    end if;

    -- Persist only a normalized allowlist. Description-like provider content
    -- is included solely when the reviewed source policy permits it.
    v_stored_payload := jsonb_strip_nulls(jsonb_build_object(
      'external_id', v_external_id,
      'title', v_title,
      'source_url', v_source_url,
      'application_url', v_application_url,
      'original_employer_url', v_original_employer_url,
      'work_arrangement', coalesce(
        v_record ->> 'work_arrangement', 'unspecified'
      ),
      'employment_type', coalesce(
        v_record ->> 'employment_type', 'other'
      ),
      'engagement_type', coalesce(
        v_record ->> 'engagement_type', 'unspecified'
      ),
      'experience_level', coalesce(
        v_record ->> 'experience_level', 'unspecified'
      ),
      'posted_at', v_record -> 'posted_at',
      'valid_through', v_record -> 'valid_through',
      'locations', v_record -> 'locations',
      'eligibility', v_record -> 'eligibility'
    ));
    if v_context.may_store_full_description then
      v_stored_payload := v_stored_payload || jsonb_strip_nulls(
        jsonb_build_object(
          'description_text', v_description,
          'requirements_text', nullif(btrim(
            v_record ->> 'requirements_text'
          ), ''),
          'benefits_text', nullif(btrim(
            v_record ->> 'benefits_text'
          ), '')
        )
      );
    end if;

    if octet_length(v_stored_payload::text) > 1048576 then
      raise exception using errcode = '22023',
        message = 'normalized ATS record exceeds 1 MiB';
    end if;

    select raw.content_hash into v_previous_hash
    from ingest.raw_job_records raw
    where raw.source_id = v_context.source_id
      and raw.external_source_id = v_external_id;

    select exists (
      select 1 from app.jobs job
      where job.source_id = v_context.source_id
        and job.external_source_id = v_external_id
    ) into v_job_exists;

    insert into ingest.raw_job_records as existing (
      source_id, import_run_id, external_source_id, source_url,
      original_employer_url, raw_payload, content_hash,
      dedup_fingerprint, full_description_stored, last_seen_at
    ) values (
      v_context.source_id, p_import_run_id, v_external_id,
      v_source_url, v_original_employer_url, v_stored_payload,
      v_content_hash, v_dedup_fingerprint,
      v_context.may_store_full_description and v_description is not null,
      clock_timestamp()
    )
    on conflict (source_id, external_source_id) do update
    set import_run_id = excluded.import_run_id,
        source_url = excluded.source_url,
        original_employer_url = excluded.original_employer_url,
        raw_payload = excluded.raw_payload,
        content_hash = excluded.content_hash,
        dedup_fingerprint = excluded.dedup_fingerprint,
        full_description_stored = excluded.full_description_stored,
        last_seen_at = excluded.last_seen_at
    returning id into v_raw_record_id;

    -- Publication readiness per record: a market country named by the
    -- record (location or eligibility include) whose pack is not activated
    -- for public jobs, or where this source lacks runnable public-display
    -- rights, holds the job as pending rather than failing the batch.
    v_publishable := not exists (
      select 1
      from (
        select upper(named_location.value ->> 'country_code') as country_code
        from jsonb_array_elements(
          coalesce(v_record -> 'locations', '[]'::jsonb)
        ) named_location
        union
        select upper(named_country.value ->> 'country_code')
        from jsonb_array_elements(coalesce(
          v_record #> '{eligibility,countries}', '[]'::jsonb
        )) named_country
        where named_country.value ->> 'rule' = 'include'
      ) named
      join app.market_countries market on market.iso2 = named.country_code
      where not (
        security.country_pack_accepts_public_jobs(market.iso2)
        and exists (
          select 1 from app.source_country_rights rights
          where rights.source_id = v_context.source_id
            and rights.country_code = market.iso2
            and rights.allow_public_display
            and security.job_source_country_policy_is_runnable(
              rights.source_id, rights.country_code
            )
        )
      )
    );

    v_slug_base := trim(both '-' from regexp_replace(
      lower(v_title), '[^a-z0-9]+', '-', 'g'
    ));
    if v_slug_base = '' then v_slug_base := 'job'; end if;
    v_slug := left(v_slug_base, 120) || '-' || left(encode(
      extensions.digest(convert_to(
        v_context.source_id::text || ':' || v_external_id,
        'UTF8'
      ), 'sha256'), 'hex'
    ), 16);

    insert into app.jobs as existing (
      company_id, source_id, external_source_id, slug, status, title,
      description_text, requirements_text, benefits_text,
      work_arrangement, employment_type, engagement_type,
      experience_level, application_url, source_url,
      original_employer_url, posted_at, valid_through, last_seen_at,
      last_checked_at, content_sanitized_at, dedup_fingerprint
    ) values (
      v_context.company_id, v_context.source_id, v_external_id, v_slug,
      case when v_context.publication_mode = 'automatic' and v_publishable
        then 'published'::app.job_status
        else 'pending'::app.job_status end,
      v_title,
      case when v_context.may_store_full_description
        then case when char_length(coalesce(v_description, '')) >= 20
          then v_description else v_placeholder end
        else v_placeholder end,
      case when v_context.may_store_full_description then
        nullif(btrim(v_record ->> 'requirements_text'), '') end,
      case when v_context.may_store_full_description then
        nullif(btrim(v_record ->> 'benefits_text'), '') end,
      coalesce(v_record ->> 'work_arrangement', 'unspecified')
        ::app.work_arrangement,
      coalesce(v_record ->> 'employment_type', 'other')
        ::app.employment_type,
      coalesce(v_record ->> 'engagement_type', 'unspecified')
        ::app.engagement_type,
      coalesce(v_record ->> 'experience_level', 'unspecified')
        ::app.experience_level,
      v_application_url, v_source_url, v_original_employer_url,
      case when v_record ->> 'posted_at' is null then null
        else (v_record ->> 'posted_at')::timestamptz end,
      case when v_record ->> 'valid_through' is null then null
        else (v_record ->> 'valid_through')::timestamptz end,
      clock_timestamp(), clock_timestamp(), clock_timestamp(),
      v_dedup_fingerprint
    )
    on conflict (source_id, external_source_id) do update
    set company_id = excluded.company_id,
        title = excluded.title,
        status = case
          when existing.status in ('removed', 'rejected') then existing.status
          when v_context.publication_mode = 'automatic'
            then case when v_publishable
              then 'published'::app.job_status
              else 'pending'::app.job_status end
          when v_previous_hash is distinct from v_content_hash
            then 'pending'::app.job_status
          when existing.status = 'expired' then 'pending'::app.job_status
          else existing.status
        end,
        description_text = excluded.description_text,
        description_html = null,
        requirements_text = excluded.requirements_text,
        benefits_text = excluded.benefits_text,
        work_arrangement = excluded.work_arrangement,
        employment_type = excluded.employment_type,
        engagement_type = excluded.engagement_type,
        experience_level = excluded.experience_level,
        application_url = excluded.application_url,
        source_url = excluded.source_url,
        original_employer_url = excluded.original_employer_url,
        posted_at = excluded.posted_at,
        valid_through = excluded.valid_through,
        last_seen_at = excluded.last_seen_at,
        last_checked_at = excluded.last_checked_at,
        content_sanitized_at = excluded.content_sanitized_at,
        dedup_fingerprint = excluded.dedup_fingerprint
    returning id into v_job_id;

    if v_record ? 'locations' then
      delete from app.job_locations where job_id = v_job_id;
      insert into app.job_locations (
        job_id, country_code, city, region, is_primary
      )
      select
        v_job_id,
        nullif(location.value ->> 'country_code', ''),
        nullif(btrim(location.value ->> 'city'), ''),
        nullif(btrim(location.value ->> 'region'), ''),
        coalesce((location.value ->> 'is_primary')::boolean, false)
      from jsonb_array_elements(v_record -> 'locations') location;
    end if;

    if v_record ? 'eligibility' then
      insert into app.job_eligibility as existing (
        job_id, scope, required_timezone_overlap,
        work_authorization_requirement, visa_sponsorship,
        relocation_support, evidence_text, provenance, confidence,
        last_verified_at
      ) values (
        v_job_id,
        (v_record #>> '{eligibility,scope}')::app.eligibility_scope,
        nullif(btrim(v_record #>>
          '{eligibility,required_timezone_overlap}'), ''),
        nullif(btrim(v_record #>>
          '{eligibility,work_authorization_requirement}'), ''),
        case when jsonb_typeof(v_record #> '{eligibility,visa_sponsorship}')
          = 'boolean' then (v_record #>>
          '{eligibility,visa_sponsorship}')::boolean end,
        case when jsonb_typeof(v_record #> '{eligibility,relocation_support}')
          = 'boolean' then (v_record #>>
          '{eligibility,relocation_support}')::boolean end,
        nullif(btrim(v_record #>> '{eligibility,evidence_text}'), ''),
        'source_provided',
        case when v_record #>> '{eligibility,confidence}' is null then null
          else (v_record #>> '{eligibility,confidence}')::numeric end,
        clock_timestamp()
      )
      on conflict (job_id) do update
      set scope = excluded.scope,
          required_timezone_overlap = excluded.required_timezone_overlap,
          work_authorization_requirement =
            excluded.work_authorization_requirement,
          visa_sponsorship = excluded.visa_sponsorship,
          relocation_support = excluded.relocation_support,
          evidence_text = excluded.evidence_text,
          provenance = 'source_provided',
          confidence = excluded.confidence,
          last_verified_at = excluded.last_verified_at,
          verified_by = null;

      delete from app.job_eligibility_countries where job_id = v_job_id;
      insert into app.job_eligibility_countries (
        job_id, country_code, rule
      )
      select distinct
        v_job_id,
        country.value ->> 'country_code',
        (country.value ->> 'rule')::app.country_rule
      from jsonb_array_elements(coalesce(
        v_record #> '{eligibility,countries}', '[]'::jsonb
      )) country;
    end if;

    insert into ingest.ats_snapshot_seen_records (
      import_run_id, source_id, external_source_id, raw_record_id,
      job_id, content_hash
    ) values (
      p_import_run_id, v_context.source_id, v_external_id,
      v_raw_record_id, v_job_id, v_content_hash
    );

    if not v_job_exists then
      v_created := v_created + 1;
    elsif v_previous_hash is distinct from v_content_hash then
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  select count(*)::integer into v_seen_count
  from ingest.ats_snapshot_seen_records seen
  where seen.import_run_id = p_import_run_id;
  if v_seen_count > (
    select snapshot.expected_record_count
    from ingest.ats_snapshot_runs snapshot
    where snapshot.import_run_id = p_import_run_id
  ) then
    raise exception using errcode = '22023',
      message = 'ATS batches exceed expected normalized record count';
  end if;

  update ingest.import_runs
  set created_count = created_count + v_created,
      updated_count = updated_count + v_updated,
      unchanged_count = unchanged_count + v_unchanged
  where id = p_import_run_id and status = 'running';
  if not found then
    raise exception using errcode = '55000',
      message = 'ATS import run is not running';
  end if;

  return jsonb_build_object(
    'accepted_count', v_record_count,
    'created_count', v_created,
    'updated_count', v_updated,
    'unchanged_count', v_unchanged
  );
end;
$$;

commit;
