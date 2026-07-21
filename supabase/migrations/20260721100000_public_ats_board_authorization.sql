-- Admit an employer's own publicly documented ATS board as a reviewed
-- authorization basis. Employers publish Greenhouse and Lever boards through
-- public APIs precisely so their vacancies can be displayed; listing bounded
-- metadata with attribution and the employer's own application URL as the
-- only destination matches how the wider ecosystem treats these boards.
-- Guardrails preserved: full descriptions are only stored when the source
-- row permits it, email distribution still requires explicit permission,
-- automatic publication still requires a published verified company, and a
-- named grantor plus reviewed evidence remain mandatory. Takedown remains
-- immediate via authorization revocation.

begin;

create or replace function security.enforce_job_source_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_enabled_config boolean;
  v_automatic_company_ok boolean;
begin
  if tg_op = 'UPDATE'
     and (
       old.authorization_reviewed_at is not null
       or old.status = 'active'
     )
     and (
       new.source_type is distinct from old.source_type
       or new.homepage_url is distinct from old.homepage_url
       or new.terms_url is distinct from old.terms_url
       or new.terms_version is distinct from old.terms_version
       or new.attribution_required is distinct from old.attribution_required
       or new.attribution_text is distinct from old.attribution_text
       or new.may_store_full_description is distinct from old.may_store_full_description
       or new.may_index_jobs is distinct from old.may_index_jobs
       or new.may_emit_jobposting_schema is distinct from old.may_emit_jobposting_schema
       or new.may_email_jobs is distinct from old.may_email_jobs
       or new.allow_public_listing is distinct from old.allow_public_listing
       or new.required_destination_kind is distinct from old.required_destination_kind
       or new.refresh_interval is distinct from old.refresh_interval
       or new.authorization_basis is distinct from old.authorization_basis
       or new.authorization_evidence_ref is distinct from old.authorization_evidence_ref
       or new.authorization_grantor is distinct from old.authorization_grantor
       or new.authorization_expires_at is distinct from old.authorization_expires_at
     ) then
    new.status := 'paused';
    new.authorization_reviewed_at := null;
    new.authorization_reviewed_by := null;
    new.authorization_revoked_at := clock_timestamp();
    new.authorization_revoked_by := null;
    new.authorization_revocation_reason := 'source_policy_changed';

    if new.terms_url is distinct from old.terms_url
       or new.terms_version is distinct from old.terms_version then
      new.terms_reviewed_at := null;
      new.terms_reviewed_by := null;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.authorization_revoked_at is not null
     and new.authorization_revoked_at is distinct from old.authorization_revoked_at then
    new.status := 'paused';
    new.authorization_reviewed_at := null;
    new.authorization_reviewed_by := null;
    new.authorization_revocation_reason := coalesce(
      nullif(btrim(new.authorization_revocation_reason), ''),
      'authorization_revoked'
    );
  end if;

  if new.status = 'active' then
    if new.terms_reviewed_at is null
       or nullif(btrim(coalesce(new.terms_version, '')), '') is null then
      raise exception using errcode = '23514',
        message = 'active source requires a current terms review';
    end if;
    if new.authorization_basis is null
       or nullif(btrim(coalesce(new.authorization_evidence_ref, '')), '') is null
       or new.authorization_reviewed_at is null then
      raise exception using errcode = '23514',
        message = 'active source requires reviewed authorization evidence';
    end if;
    if new.authorization_revoked_at is not null then
      raise exception using errcode = '23514',
        message = 'revoked source authorization cannot be active';
    end if;
    if new.authorization_expires_at is not null
       and new.authorization_expires_at <= clock_timestamp() then
      raise exception using errcode = '23514',
        message = 'expired source authorization cannot be active';
    end if;
    if new.authorization_reviewed_at >
         clock_timestamp() + interval '5 minutes' then
      raise exception using errcode = '23514',
        message = 'source authorization review cannot be future dated';
    end if;
    if new.may_email_jobs
       and new.authorization_basis not in (
         'first_party', 'written_permission', 'commercial_contract'
       ) then
      raise exception using errcode = '23514',
        message = 'email distribution requires explicit source permission';
    end if;

    if new.source_type = 'employer_ats' then
      if char_length(new.adapter_key) > 100
         or char_length(new.name) not between 1 and 300
         or new.terms_url !~* '^https://'
         or char_length(new.terms_version) > 500
         or char_length(coalesce(new.attribution_text, '')) > 2000
         or char_length(new.required_destination_kind) > 120 then
        raise exception using errcode = '23514',
          message = 'ATS source metadata exceeds the worker contract';
      end if;
      if new.authorization_basis not in (
           'written_permission', 'commercial_contract',
           'documented_public_api'
         )
         or nullif(btrim(coalesce(new.authorization_grantor, '')), '') is null then
        raise exception using errcode = '23514',
          message = 'active ATS source requires a reviewed authorization basis and grantor';
      end if;

      select exists (
        select 1
        from private.ats_source_configs cfg
        where cfg.source_id = new.id
          and cfg.enabled
          and cfg.fetch_interval = new.refresh_interval
      ) into v_has_enabled_config;

      select coalesce(bool_and(
          cfg.publication_mode <> 'automatic'
          or (
            new.allow_public_listing
            and c.record_status = 'published'
            and c.verification_status in (
              'domain_verified', 'organization_verified'
            )
          )
        ), false)
      into v_automatic_company_ok
      from private.ats_source_configs cfg
      join app.companies c on c.id = cfg.company_id
      where cfg.source_id = new.id
        and cfg.enabled
        and cfg.fetch_interval = new.refresh_interval;

      if not coalesce(v_has_enabled_config, false) then
        raise exception using errcode = '23514',
          message = 'active ATS source requires one enabled matching configuration';
      end if;
      if not coalesce(v_automatic_company_ok, false) then
        raise exception using errcode = '23514',
          message = 'automatic ATS publication requires a published verified company';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function security.authorized_ats_source_config_rows()
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  source_name text,
  employer_name text,
  provider text,
  provider_region text,
  tenant_identifier text,
  allowed_destination_hosts text[],
  allowed_destination_path_prefixes text[],
  fetch_interval_seconds integer,
  daily_request_budget smallint,
  minimum_request_spacing_seconds integer,
  publication_mode text,
  homepage_url text,
  terms_url text,
  terms_version text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  may_email_jobs boolean,
  required_destination_kind text,
  authorization_basis text,
  authorization_evidence_ref text,
  authorization_grantor text,
  authorization_reviewed_at timestamptz,
  authorization_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    cfg.company_id,
    s.adapter_key,
    s.name,
    c.display_name,
    cfg.provider,
    cfg.provider_region,
    cfg.tenant_identifier,
    cfg.allowed_destination_hosts,
    cfg.allowed_destination_path_prefixes,
    extract(epoch from cfg.fetch_interval)::integer,
    cfg.daily_request_budget,
    extract(epoch from cfg.minimum_request_spacing)::integer,
    cfg.publication_mode,
    s.homepage_url,
    s.terms_url,
    s.terms_version,
    s.attribution_required,
    s.attribution_text,
    s.may_store_full_description,
    s.may_index_jobs,
    s.may_emit_jobposting_schema,
    s.may_email_jobs,
    s.required_destination_kind,
    s.authorization_basis,
    s.authorization_evidence_ref,
    s.authorization_grantor,
    s.authorization_reviewed_at,
    s.authorization_expires_at
  from app.job_sources s
  join private.ats_source_configs cfg on cfg.source_id = s.id
  join app.companies c on c.id = cfg.company_id
  where s.source_type = 'employer_ats'
    and s.status = 'active'
    and s.allow_public_listing
    and s.terms_reviewed_at is not null
    and s.authorization_basis is not null
    and s.authorization_basis in (
      'written_permission', 'commercial_contract',
      'documented_public_api'
    )
    and s.authorization_evidence_ref is not null
    and s.authorization_grantor is not null
    and s.authorization_reviewed_at is not null
    and s.authorization_reviewed_at <=
      statement_timestamp() + interval '5 minutes'
    and s.authorization_revoked_at is null
    and (
      s.authorization_expires_at is null
      or s.authorization_expires_at > statement_timestamp()
    )
    and cfg.enabled
    and cfg.fetch_interval = s.refresh_interval
    and c.record_status <> 'removed'
    and c.verification_status <> 'suspended'
    and (
      cfg.publication_mode = 'review'
      or (
        c.record_status = 'published'
        and c.verification_status in (
          'domain_verified', 'organization_verified'
        )
      )
    )
$$;

commit;
