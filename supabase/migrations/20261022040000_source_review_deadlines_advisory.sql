-- Internal source-review deadlines are reminders, not licence expiry.
-- Explicit authorization expiry/revocation, source disablement, dependencies,
-- attribution, country eligibility and job freshness remain enforced.
begin;

CREATE OR REPLACE FUNCTION api.worker_run_source_rights_review()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_overdue integer := 0;
  v_enabled integer := 0;
  v_runnable integer := 0;
begin
  perform security.require_service_role();
  with overdue as (
    select source.id, source.adapter_key from app.job_sources source
    where source.policy_state = 'enabled'
      and source.policy_review_due_at <= clock_timestamp()
  ), alerts as (
    insert into editorial.operational_alerts (
      task_key, run_key, severity, error_code, summary
    )
    select 'source_rights_review', 'source:' || overdue.id::text,
      'warning', 'source_policy_review_overdue',
      jsonb_build_object('adapter_key', overdue.adapter_key)
    from overdue
    on conflict (task_key, run_key, error_code) do update
    set summary = excluded.summary
    returning 1
  )
  select count(*)::integer into v_overdue from alerts;

  select count(*)::integer into v_enabled
  from app.job_sources source
  where source.policy_state = 'enabled';

  select count(*)::integer into v_runnable
  from app.job_sources source
  where security.job_source_policy_is_runnable(source.id);

  return jsonb_build_object(
    'expired_sources', 0,
    'overdue_reviews', v_overdue,
    'enabled_sources', v_enabled,
    'runnable_sources', v_runnable
  );
end;
$function$;


CREATE OR REPLACE FUNCTION security.enforce_job_source_supply_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'active' then
    if new.policy_state <> 'enabled'
       or new.terms_reviewed_at is null
       or new.authorization_basis is null
       or new.authorization_evidence_ref is null
       or new.authorization_reviewed_at is null
       or new.authorization_revoked_at is not null
       or new.allowed_fields = '{}'::text[]
       or new.policy_review_due_at is null

       or new.missing_dependencies <> '{}'::text[]
       or (new.attribution_required and nullif(btrim(new.attribution_text), '') is null)
       or (new.may_store_full_description and not ('description' = any(new.allowed_fields)))
       or (new.minimum_poll_interval is not null
         and new.refresh_interval < new.minimum_poll_interval)
       or (new.may_emit_jobposting_schema and not new.may_index_jobs) then
      raise exception using errcode = '23514',
        message = 'enabled source requires complete current rights policy';
    end if;
  end if;

  if new.adapter_key in ('remotive', 'jobicy') and (
    new.may_index_jobs or new.may_emit_jobposting_schema
  ) then
    raise exception using errcode = '23514',
      message = 'secondary feed may not be submitted to search job platforms';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION security.enqueue_google_indexing_source_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_eligible boolean;
  v_new_eligible boolean;
  v_kind text;
begin
  if row(
    old.status, old.policy_state, old.may_index_jobs,
    old.may_emit_jobposting_schema, old.policy_review_due_at,
    old.authorization_expires_at, old.authorization_revoked_at,
    old.missing_dependencies
  ) is not distinct from row(
    new.status, new.policy_state, new.may_index_jobs,
    new.may_emit_jobposting_schema, new.policy_review_due_at,
    new.authorization_expires_at, new.authorization_revoked_at,
    new.missing_dependencies
  ) then
    return new;
  end if;
  v_old_eligible := old.may_index_jobs
    and old.may_emit_jobposting_schema
    and old.status = 'active'
    and old.policy_state = 'enabled'
    and old.terms_url is not null
    and old.terms_reviewed_at is not null
    and old.authorization_basis is not null
    and old.authorization_evidence_ref is not null
    and old.authorization_reviewed_at is not null
    and old.authorization_revoked_at is null
    and old.allowed_fields <> '{}'::text[]

    and (old.authorization_expires_at is null
      or old.authorization_expires_at > statement_timestamp())
    and old.missing_dependencies = '{}'::text[]
    and not exists (
      select 1
      from unnest(old.required_dependencies) required(dependency_key)
      left join private.job_source_dependencies dependency
        on dependency.source_id = old.id
       and dependency.dependency_key = required.dependency_key
      where dependency.state is distinct from 'verified'
        or dependency.evidence_reference is null
        or dependency.reviewed_at is null
    );
  v_new_eligible := security.google_indexing_source_is_eligible(new.id);
  if v_new_eligible then
    v_kind := 'URL_UPDATED';
  elsif v_old_eligible then
    v_kind := 'URL_DELETED';
  else
    return new;
  end if;
  insert into private.google_indexing_outbox (
    job_id, job_slug, notification_kind, idempotency_key
  )
  select job.id, job.slug, v_kind,
    job.id::text || ':' || v_kind || ':source:' || encode(extensions.digest(new.updated_at::text, 'sha256'), 'hex')
  from app.jobs job
  join app.companies company on company.id = job.company_id
  where job.source_id = new.id
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and company.record_status = 'published'
    and security.public_job_provenance(job.id) is not null
  on conflict (idempotency_key) do nothing;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION security.job_source_country_policy_is_runnable(p_source_id uuid, p_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select security.job_source_policy_is_runnable(p_source_id)
    and exists (
      select 1
      from app.source_country_rights rights
      where rights.source_id = p_source_id
        and rights.country_code = upper(p_country_code)
        and rights.policy_state = 'enabled'
        and rights.permission_basis is not null
        and rights.evidence_reference is not null
        and rights.terms_url is not null
        and rights.reviewed_at is not null

        and rights.allowed_fields <> '{}'::text[]
        and rights.revoked_at is null
        and rights.missing_dependencies = '{}'::text[]
    );
$function$;


CREATE OR REPLACE FUNCTION security.job_source_policy_is_runnable(p_source_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from app.job_sources source
    where source.id = p_source_id
      and source.status = 'active'
      and source.policy_state = 'enabled'
      and source.terms_url is not null
      and source.terms_reviewed_at is not null
      and source.authorization_basis is not null
      and source.authorization_evidence_ref is not null
      and source.authorization_reviewed_at is not null
      and source.authorization_revoked_at is null
      and source.allowed_fields <> '{}'::text[]

      and (source.authorization_expires_at is null
        or source.authorization_expires_at > statement_timestamp())
      and source.missing_dependencies = '{}'::text[]
      and not exists (
        select 1
        from unnest(source.required_dependencies) required(dependency_key)
        left join private.job_source_dependencies dependency
          on dependency.source_id = source.id
         and dependency.dependency_key = required.dependency_key
        where dependency.state is distinct from 'verified'
          or dependency.evidence_reference is null
          or dependency.reviewed_at is null
      )
  );
$function$;


CREATE OR REPLACE FUNCTION security.refresh_job_public_provenance(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_provenance jsonb;
  v_ready_until timestamptz;
  v_guard text;
begin
  if p_job_id is null then return; end if;
  v_guard := 'salarypadi.provenance_' || replace(p_job_id::text, '-', '');
  if current_setting(v_guard, true) = '1' then return; end if;
  perform set_config(v_guard, '1', true);
  v_provenance := security.public_job_provenance(p_job_id);
  if v_provenance is null then
    update app.jobs
    set public_provenance = null, public_ready_until = null
    where id = p_job_id
      and (public_provenance is not null or public_ready_until is not null);
    return;
  end if;

  select least(
    source.authorization_expires_at,
    (
      select eligibility.last_verified_at + interval '30 days'
      from app.job_eligibility eligibility
      where eligibility.job_id = job.id
    )
  ) into v_ready_until
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where job.id = p_job_id;

  update app.jobs
  set public_provenance = v_provenance, public_ready_until = v_ready_until
  where id = p_job_id;
end;
$function$;


alter policy job_sources_public_read on app.job_sources using (
  status = 'active' and policy_state = 'enabled' and allow_public_listing
  and authorization_revoked_at is null
  and (authorization_expires_at is null or authorization_expires_at > clock_timestamp())
  and missing_dependencies = '{}'::text[]
);

-- Replacing existing functions preserves their existing restricted ACLs.
-- Refresh cached publication horizons so a past internal review date is no
-- longer an independent reason to suppress otherwise current job evidence.
do $$
declare job_id uuid;
begin
  for job_id in select id from app.jobs where status = 'published'
  loop
    perform security.refresh_job_public_provenance(job_id);
  end loop;
end;
$$;

commit;

