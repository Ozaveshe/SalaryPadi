begin;

-- A source may be fetched or published only while its authorization record is
-- current. Evidence references are intentionally private operational data;
-- public clients continue to receive only the reviewed source projection.
alter table app.job_sources
  add column if not exists authorization_basis text,
  add column if not exists authorization_evidence_ref text,
  add column if not exists authorization_grantor text,
  add column if not exists authorization_reviewed_at timestamptz,
  add column if not exists authorization_reviewed_by uuid
    references private.profiles(user_id) on delete set null,
  add column if not exists authorization_expires_at timestamptz,
  add column if not exists authorization_revoked_at timestamptz,
  add column if not exists authorization_revoked_by uuid
    references private.profiles(user_id) on delete set null,
  add column if not exists authorization_revocation_reason text,
  add column if not exists may_email_jobs boolean not null default false;

update app.job_sources
set authorization_basis = 'first_party',
    authorization_evidence_ref =
      'salarypadi:employer-submission-terms:2026-07-10',
    authorization_reviewed_at = coalesce(
      authorization_reviewed_at,
      terms_reviewed_at,
      timestamptz '2026-07-10 00:00:00+00'
    ),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    may_email_jobs = false
where adapter_key = 'salarypadi_employer_submissions';

update app.job_sources
set authorization_basis = 'documented_public_api',
    authorization_evidence_ref =
      'repo:remotive-com/remote-jobs-api:reviewed-2026-07-10',
    authorization_reviewed_at = coalesce(
      authorization_reviewed_at,
      terms_reviewed_at,
      timestamptz '2026-07-10 00:00:00+00'
    ),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    may_email_jobs = false
where adapter_key = 'remotive';

-- Unknown active sources fail closed when this migration lands. They can be
-- re-enabled only after a separate evidence review.
update app.job_sources
set status = 'paused',
    authorization_revoked_at = coalesce(
      authorization_revoked_at,
      clock_timestamp()
    ),
    authorization_revocation_reason = coalesce(
      authorization_revocation_reason,
      'authorization_required_by_policy_migration'
    ),
    authorization_reviewed_at = null,
    authorization_reviewed_by = null
where status = 'active'
  and (
    authorization_basis is null
    or authorization_evidence_ref is null
    or authorization_reviewed_at is null
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_basis_valid;
alter table app.job_sources
  add constraint job_sources_authorization_basis_valid check (
    authorization_basis is null or authorization_basis in (
      'first_party', 'documented_public_api',
      'written_permission', 'commercial_contract'
    )
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_evidence_length;
alter table app.job_sources
  add constraint job_sources_authorization_evidence_length check (
    authorization_evidence_ref is null
    or char_length(authorization_evidence_ref) between 3 and 500
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_grantor_length;
alter table app.job_sources
  add constraint job_sources_authorization_grantor_length check (
    authorization_grantor is null
    or char_length(authorization_grantor) between 3 and 300
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_review_bundle;
alter table app.job_sources
  add constraint job_sources_authorization_review_bundle check (
    authorization_reviewed_at is null
    or (
      authorization_basis is not null
      and authorization_evidence_ref is not null
      and authorization_revoked_at is null
    )
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_expiry_order;
alter table app.job_sources
  add constraint job_sources_authorization_expiry_order check (
    authorization_expires_at is null
    or authorization_reviewed_at is null
    or authorization_expires_at > authorization_reviewed_at
  );

alter table app.job_sources
  drop constraint if exists job_sources_authorization_revocation_bundle;
alter table app.job_sources
  add constraint job_sources_authorization_revocation_bundle check (
    (
      authorization_revoked_at is null
      and authorization_revoked_by is null
      and authorization_revocation_reason is null
    ) or (
      authorization_revoked_at is not null
      and authorization_revocation_reason is not null
      and char_length(authorization_revocation_reason) between 3 and 500
    )
  );

create index if not exists job_sources_authorization_reviewed_by_idx
  on app.job_sources (authorization_reviewed_by)
  where authorization_reviewed_by is not null;
create index if not exists job_sources_authorization_revoked_by_idx
  on app.job_sources (authorization_revoked_by)
  where authorization_revoked_by is not null;
create index if not exists job_sources_authorization_expiry_idx
  on app.job_sources (authorization_expires_at)
  where authorization_expires_at is not null;

create or replace function security.is_valid_ats_destination_arrays(
  p_hosts text[],
  p_path_prefixes text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    coalesce(cardinality(p_hosts) between 1 and 20, false)
    and cardinality(p_hosts) = cardinality(p_path_prefixes)
    and not exists (
      select 1
      from unnest(p_hosts, p_path_prefixes) as destination(host, path_prefix)
      where destination.host is null
        or destination.host <> lower(destination.host)
        or char_length(destination.host) > 253
        or destination.host !~
          '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$'
        or destination.path_prefix is null
        or char_length(destination.path_prefix) not between 1 and 300
        or destination.path_prefix !~ '^/'
        or destination.path_prefix like '//%'
        or btrim(destination.path_prefix) <> destination.path_prefix
        or destination.path_prefix ~ '[?#]'
        or destination.path_prefix ~ '(^|/)\\.\\.(/|$)'
        or position(
          pg_catalog.chr(92) in destination.path_prefix
        ) > 0
    )
    and (
      select count(*) = count(distinct (destination.host, destination.path_prefix))
      from unnest(p_hosts, p_path_prefixes) as destination(host, path_prefix)
    )
$$;

revoke all on function security.is_valid_ats_destination_arrays(text[],text[])
from public, anon, authenticated, service_role;

create table if not exists private.ats_source_configs (
  source_id uuid primary key
    references app.job_sources(id) on delete cascade,
  company_id uuid not null
    references app.companies(id) on delete restrict,
  provider text not null,
  provider_region text,
  tenant_identifier text not null,
  allowed_destination_hosts text[] not null,
  allowed_destination_path_prefixes text[] not null,
  fetch_interval interval not null default interval '6 hours',
  daily_request_budget smallint not null default 4,
  minimum_request_spacing interval not null default interval '5 minutes',
  publication_mode text not null default 'review',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ats_source_configs_provider check (
    provider in ('greenhouse', 'lever', 'ashby')
  ),
  constraint ats_source_configs_provider_region check (
    (provider = 'lever' and provider_region in ('global', 'eu'))
    or (provider = 'lever' and provider_region is null)
    or (provider <> 'lever' and provider_region is null)
  ),
  constraint ats_source_configs_tenant_identifier check (
    char_length(tenant_identifier) between 1 and 100
    and tenant_identifier ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'
  ),
  constraint ats_source_configs_destinations check (
    security.is_valid_ats_destination_arrays(
      allowed_destination_hosts,
      allowed_destination_path_prefixes
    )
  ),
  constraint ats_source_configs_fetch_interval check (
    fetch_interval between interval '15 minutes' and interval '24 hours'
  ),
  constraint ats_source_configs_daily_budget check (
    daily_request_budget between 1 and 96
  ),
  constraint ats_source_configs_minimum_spacing check (
    minimum_request_spacing between interval '1 minute' and interval '24 hours'
    and minimum_request_spacing <= fetch_interval
  ),
  constraint ats_source_configs_publication_mode check (
    publication_mode in ('review', 'automatic')
  )
);

create index if not exists ats_source_configs_company_idx
  on private.ats_source_configs (company_id);
create unique index if not exists ats_source_configs_provider_tenant_unique
  on private.ats_source_configs (
    provider,
    coalesce(provider_region, 'global'),
    lower(tenant_identifier)
  );
create index if not exists ats_source_configs_enabled_idx
  on private.ats_source_configs (provider, tenant_identifier)
  where enabled;

alter table private.ats_source_configs enable row level security;
alter table private.ats_source_configs force row level security;
revoke all on private.ats_source_configs
from public, anon, authenticated, service_role;

comment on table private.ats_source_configs is
  'Trusted, disabled-by-default ATS tenant and network policy. Access is available only through service-role worker RPCs.';
comment on column private.ats_source_configs.publication_mode is
  'Review is the safe default. Automatic mode is returned only for a published, verified, non-suspended company.';

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
           'written_permission', 'commercial_contract'
         )
         or nullif(btrim(coalesce(new.authorization_grantor, '')), '') is null then
        raise exception using errcode = '23514',
          message = 'active ATS source requires employer permission or contract';
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

revoke all on function security.enforce_job_source_authorization()
from public, anon, authenticated, service_role;

drop trigger if exists job_sources_enforce_authorization on app.job_sources;
create trigger job_sources_enforce_authorization
before insert or update on app.job_sources
for each row execute function security.enforce_job_source_authorization();

create or replace function security.revoke_source_on_ats_config_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_changed boolean := true;
begin
  if tg_op <> 'DELETE' and not exists (
    select 1
    from app.job_sources source
    where source.id = new.source_id
      and source.source_type = 'employer_ats'
  ) then
    raise exception using errcode = '23514',
      message = 'ATS configuration requires an employer ATS source';
  end if;

  if tg_op = 'UPDATE' and new.source_id is distinct from old.source_id then
    raise exception using errcode = '23514',
      message = 'ATS source configuration identity is immutable';
  end if;

  if tg_op = 'UPDATE' then
    v_source_id := new.source_id;
    v_changed :=
      new.company_id is distinct from old.company_id
      or new.provider is distinct from old.provider
      or new.provider_region is distinct from old.provider_region
      or new.tenant_identifier is distinct from old.tenant_identifier
      or new.allowed_destination_hosts is distinct from old.allowed_destination_hosts
      or new.allowed_destination_path_prefixes is distinct from old.allowed_destination_path_prefixes
      or new.fetch_interval is distinct from old.fetch_interval
      or new.daily_request_budget is distinct from old.daily_request_budget
      or new.minimum_request_spacing is distinct from old.minimum_request_spacing
      or new.publication_mode is distinct from old.publication_mode
      or new.enabled is distinct from old.enabled;
  elsif tg_op = 'DELETE' then
    v_source_id := old.source_id;
  else
    v_source_id := new.source_id;
  end if;

  if v_changed then
    update app.job_sources
    set status = 'paused',
        authorization_reviewed_at = null,
        authorization_reviewed_by = null,
        authorization_revoked_at = clock_timestamp(),
        authorization_revoked_by = null,
        authorization_revocation_reason = 'ats_configuration_changed'
    where id = v_source_id
      and (status = 'active' or authorization_reviewed_at is not null);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function security.revoke_source_on_ats_config_change()
from public, anon, authenticated, service_role;

drop trigger if exists ats_source_configs_revoke_source
  on private.ats_source_configs;
create trigger ats_source_configs_revoke_source
before insert or update or delete on private.ats_source_configs
for each row execute function security.revoke_source_on_ats_config_change();

-- One internal predicate is shared by list, get, and claim so an authorization
-- rule cannot drift between worker entry points.
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
      'written_permission', 'commercial_contract'
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

revoke all on function security.authorized_ats_source_config_rows()
from public, anon, authenticated, service_role;

create or replace function api.worker_list_authorized_ats_sources()
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  return query
  select authorized.*
  from security.authorized_ats_source_config_rows() authorized
  order by authorized.adapter_key;
end;
$$;

create or replace function api.worker_get_authorized_ats_source(
  p_adapter_key text
)
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or char_length(p_adapter_key) not between 1 and 120
     or p_adapter_key !~ '^[a-z0-9_]+$' then
    raise exception using errcode = '22023',
      message = 'invalid source adapter key';
  end if;

  return query
  select authorized.*
  from security.authorized_ats_source_config_rows() authorized
  where authorized.adapter_key = p_adapter_key;
end;
$$;

revoke all on function api.worker_list_authorized_ats_sources()
from public, anon, authenticated;
revoke all on function api.worker_get_authorized_ats_source(text)
from public, anon, authenticated;
grant execute on function api.worker_list_authorized_ats_sources()
to service_role;
grant execute on function api.worker_get_authorized_ats_source(text)
to service_role;

comment on function api.worker_list_authorized_ats_sources() is
  'Service-only ATS registry. Returns only currently authorized, enabled, public source configs.';
comment on function api.worker_get_authorized_ats_source(text) is
  'Service-only exact ATS source config; unauthorized, paused, revoked, expired, or disabled sources return no row.';

create or replace function api.worker_claim_ats_source_fetch(
  p_adapter_key text,
  p_request_key uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_fetch_interval interval;
  v_minimum_spacing interval;
  v_daily_budget smallint;
  v_recent_count integer;
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or p_adapter_key !~ '^[a-z0-9_]{1,120}$'
     or p_request_key is null
     or p_purpose is null
     or p_purpose !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023',
      message = 'invalid ATS source fetch claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'salarypadi:ats-source-fetch:' || p_adapter_key,
      0
    )
  );

  select
    authorized.source_id,
    pg_catalog.make_interval(secs => authorized.fetch_interval_seconds),
    pg_catalog.make_interval(
      secs => authorized.minimum_request_spacing_seconds
    ),
    authorized.daily_request_budget
  into
    v_source_id,
    v_fetch_interval,
    v_minimum_spacing,
    v_daily_budget
  from security.authorized_ats_source_config_rows() authorized
  where authorized.adapter_key = p_adapter_key;

  if v_source_id is null then return false; end if;
  if exists (
    select 1
    from private.source_fetch_claims claim
    where claim.request_key = p_request_key
  ) then return false; end if;

  if exists (
    select 1
    from private.source_fetch_claims claim
    where claim.source_id = v_source_id
      and claim.claimed_at > clock_timestamp()
        - greatest(v_fetch_interval, v_minimum_spacing)
  ) then return false; end if;

  delete from private.source_fetch_claims
  where claimed_at < clock_timestamp() - interval '30 days';

  select count(*)::integer into v_recent_count
  from private.source_fetch_claims claim
  where claim.source_id = v_source_id
    and claim.claimed_at > clock_timestamp() - interval '24 hours';
  if v_recent_count >= v_daily_budget then return false; end if;

  insert into private.source_fetch_claims (
    request_key,
    source_id,
    purpose
  ) values (
    p_request_key,
    v_source_id,
    p_purpose
  );
  return true;
end;
$$;

revoke all on function api.worker_claim_ats_source_fetch(text,uuid,text)
from public, anon, authenticated;
grant execute on function api.worker_claim_ats_source_fetch(text,uuid,text)
to service_role;

comment on function api.worker_claim_ats_source_fetch(text,uuid,text) is
  'Service-only per-source fetch claim enforcing current authorization, configured cadence, minimum spacing, and rolling daily budget.';

-- The network worker must fetch from the exact policy that received a budget
-- claim. Return that config from the same transaction while row locks prevent
-- a tenant, destination, company, or permission edit from racing the claim.
create or replace function api.worker_claim_authorized_ats_source(
  p_adapter_key text,
  p_request_key uuid,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_company_id uuid;
  v_fetch_interval_seconds integer;
  v_minimum_spacing_seconds integer;
  v_daily_budget smallint;
  v_recent_count integer;
  v_policy jsonb;
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or p_adapter_key !~ '^[a-z0-9_]{1,120}$'
     or p_request_key is null
     or p_purpose is null
     or p_purpose !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023',
      message = 'invalid ATS source fetch claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'salarypadi:ats-source-fetch:' || p_adapter_key,
      0
    )
  );

  select
    authorized.source_id,
    authorized.company_id
  into v_source_id, v_company_id
  from security.authorized_ats_source_config_rows() authorized
  where authorized.adapter_key = p_adapter_key;
  if v_source_id is null then
    return jsonb_build_object('claimed', false);
  end if;

  -- Re-read the authorization predicate after locking every mutable row that
  -- determines the outbound request and publication policy.
  -- Match the config-change trigger's lock order (config, then source) so a
  -- scheduled claim racing an administrative policy edit cannot deadlock.
  perform 1 from private.ats_source_configs config
  where config.source_id = v_source_id for share;
  perform 1 from app.job_sources source
  where source.id = v_source_id for share;
  perform 1 from app.companies company
  where company.id = v_company_id for share;

  select
    authorized.fetch_interval_seconds,
    authorized.minimum_request_spacing_seconds,
    authorized.daily_request_budget,
    to_jsonb(authorized)
  into
    v_fetch_interval_seconds,
    v_minimum_spacing_seconds,
    v_daily_budget,
    v_policy
  from security.authorized_ats_source_config_rows() authorized
  where authorized.adapter_key = p_adapter_key
    and authorized.source_id = v_source_id
    and authorized.company_id = v_company_id;
  if v_policy is null then
    return jsonb_build_object('claimed', false);
  end if;

  if exists (
    select 1 from private.source_fetch_claims claim
    where claim.request_key = p_request_key
  ) then
    return jsonb_build_object('claimed', false);
  end if;
  if exists (
    select 1 from private.source_fetch_claims claim
    where claim.source_id = v_source_id
      and claim.claimed_at > clock_timestamp() - pg_catalog.make_interval(
        secs => greatest(
          v_fetch_interval_seconds,
          v_minimum_spacing_seconds
        )
      )
  ) then
    return jsonb_build_object('claimed', false);
  end if;

  delete from private.source_fetch_claims
  where claimed_at < clock_timestamp() - interval '30 days';

  select count(*)::integer into v_recent_count
  from private.source_fetch_claims claim
  where claim.source_id = v_source_id
    and claim.claimed_at > clock_timestamp() - interval '24 hours';
  if v_recent_count >= v_daily_budget then
    return jsonb_build_object('claimed', false);
  end if;

  insert into private.source_fetch_claims (
    request_key, source_id, purpose
  ) values (
    p_request_key, v_source_id, p_purpose
  );

  return jsonb_build_object('claimed', true, 'policy', v_policy);
end;
$$;

revoke all on function api.worker_claim_authorized_ats_source(text,uuid,text)
from public, anon, authenticated;
grant execute on function api.worker_claim_authorized_ats_source(text,uuid,text)
to service_role;

comment on function api.worker_claim_authorized_ats_source(text,uuid,text) is
  'Atomically claims provider budget and returns the exact locked authorization/configuration used for the outbound request.';

comment on table private.source_fetch_claims is
  'Short-retention provider-request claims consumed before authorized Remotive or employer ATS network requests, including failed requests.';

-- Carry the false-by-default email permission into the public job projection.
-- The field is a distribution policy, not private authorization evidence, and
-- allows the service-role alert worker to filter every source uniformly.
create or replace view api.jobs
with (security_invoker = true, security_barrier = true)
as
select
  j.id, j.slug, j.title, j.description_text, j.description_html,
  j.requirements_text, j.benefits_text, j.work_arrangement,
  j.employment_type, j.engagement_type, j.experience_level,
  j.role_family_id, j.salary_min, j.salary_max, j.currency_code,
  j.pay_period, j.gross_net, j.bonus_text, j.application_url,
  j.source_url, j.posted_at, j.valid_through, j.last_checked_at,
  j.last_verified_at,
  c.id as company_id, c.slug as company_slug, c.display_name as company_name,
  c.verification_status as company_verification_status,
  s.name as source_name, s.attribution_text, s.may_index_jobs,
  s.may_emit_jobposting_schema,
  e.scope as eligibility_scope, e.required_timezone_overlap,
  e.work_authorization_requirement, e.visa_sponsorship,
  e.relocation_support, e.evidence_text as eligibility_evidence,
  e.provenance as eligibility_provenance,
  e.last_verified_at as eligibility_verified_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', l.country_code, 'city', l.city, 'region', l.region,
      'is_primary', l.is_primary
    ) order by l.is_primary desc, l.country_code, l.city)
    from app.job_locations l where l.job_id = j.id
  ), '[]'::jsonb) as locations,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', ec.country_code, 'rule', ec.rule
    ) order by ec.rule, ec.country_code)
    from app.job_eligibility_countries ec where ec.job_id = j.id
  ), '[]'::jsonb) as eligibility_countries,
  j.external_source_id,
  j.dedup_fingerprint,
  r.slug as role_slug,
  r.name as role_family,
  s.id as source_id,
  s.adapter_key as source_adapter_key,
  s.source_type,
  s.homepage_url as source_homepage_url,
  s.terms_url as source_terms_url,
  s.attribution_required,
  s.may_store_full_description,
  s.required_destination_kind,
  extract(epoch from s.refresh_interval)::integer
    as refresh_interval_seconds,
  s.terms_reviewed_at,
  coalesce((
    select jsonb_agg(sk.name order by sk.name)
    from app.job_skills js
    join app.skills sk on sk.id = js.skill_id
    where js.job_id = j.id
  ), '[]'::jsonb) as skills,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', ri.code,
      'severity', ri.severity,
      'evidence_text', ri.evidence_text
    ) order by ri.severity desc, ri.code)
    from app.job_risk_indicators ri
    where ri.job_id = j.id and ri.is_public
  ), '[]'::jsonb) as risk_indicators,
  s.may_email_jobs
from app.jobs j
join app.companies c on c.id = j.company_id
join app.job_sources s on s.id = j.source_id
left join app.job_eligibility e on e.job_id = j.id
left join app.role_families r on r.id = j.role_family_id
where j.status = 'published'
  and not j.is_fixture
  and (j.valid_through is null or j.valid_through > clock_timestamp())
  and c.record_status = 'published'
  and s.status = 'active'
  and s.allow_public_listing;

-- Existing public and worker paths inherit the new revocation/expiry boundary.
drop policy if exists job_sources_public_read on app.job_sources;
create policy job_sources_public_read on app.job_sources
for select to anon, authenticated using (
  status = 'active'
  and allow_public_listing
  and terms_reviewed_at is not null
  and authorization_basis is not null
  and authorization_evidence_ref is not null
  and authorization_reviewed_at is not null
  and authorization_revoked_at is null
  and (
    authorization_expires_at is null
    or authorization_expires_at > clock_timestamp()
  )
);

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and exists (
    select 1
    from app.job_sources s
    where s.id = source_id
      and s.status = 'active'
      and s.allow_public_listing
      and s.terms_reviewed_at is not null
      and s.authorization_basis is not null
      and s.authorization_evidence_ref is not null
      and s.authorization_reviewed_at is not null
      and s.authorization_revoked_at is null
      and (
        s.authorization_expires_at is null
        or s.authorization_expires_at > clock_timestamp()
      )
  )
);

-- A table-level grant would expose evidence columns added after the original
-- migration. Replace it with the exact columns required by security-invoker
-- public views; ATS configuration and authorization evidence remain private.
revoke select on app.job_sources from anon, authenticated;
grant select (
  id,
  adapter_key,
  name,
  source_type,
  status,
  homepage_url,
  terms_url,
  attribution_required,
  attribution_text,
  may_store_full_description,
  may_index_jobs,
  may_emit_jobposting_schema,
  may_email_jobs,
  allow_public_listing,
  required_destination_kind,
  refresh_interval,
  terms_reviewed_at,
  terms_version
) on app.job_sources to anon, authenticated;

-- Keep the legacy Remotive budget fail-closed under the same durable
-- authorization record. ATS sources use the generic claim RPC above.
create or replace function api.worker_claim_remotive_fetch(
  p_request_key uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_recent_count integer;
begin
  perform security.require_service_role();
  if p_request_key is null
     or p_purpose is null
     or p_purpose !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023',
      message = 'invalid source fetch claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('salarypadi:source-fetch:remotive', 0)
  );

  select s.id into v_source_id
  from app.job_sources s
  where s.adapter_key = 'remotive'
    and s.source_type = 'permitted_api'
    and s.status = 'active'
    and s.allow_public_listing
    and s.attribution_required
    and not s.may_store_full_description
    and not s.may_index_jobs
    and not s.may_emit_jobposting_schema
    and not s.may_email_jobs
    and s.required_destination_kind = 'source_url'
    and s.refresh_interval = interval '12 hours'
    and s.terms_url = 'https://github.com/remotive-com/remote-jobs-api'
    and s.terms_version =
      'remotive-public-api-repository-reviewed-2026-07-10'
    and s.terms_reviewed_at is not null
    and s.authorization_basis = 'documented_public_api'
    and s.authorization_evidence_ref is not null
    and s.authorization_reviewed_at is not null
    and s.authorization_revoked_at is null
    and (
      s.authorization_expires_at is null
      or s.authorization_expires_at > clock_timestamp()
    )
  for key share;

  if v_source_id is null then return false; end if;
  if exists (
    select 1 from private.source_fetch_claims c
    where c.request_key = p_request_key
  ) then return false; end if;
  if exists (
    select 1 from private.source_fetch_claims c
    where c.source_id = v_source_id
      and c.claimed_at > clock_timestamp() - interval '1 minute'
  ) then return false; end if;

  delete from private.source_fetch_claims
  where claimed_at < clock_timestamp() - interval '30 days';

  select count(*)::integer into v_recent_count
  from private.source_fetch_claims c
  where c.source_id = v_source_id
    and c.claimed_at > clock_timestamp() - interval '24 hours';
  if v_recent_count >= 4 then return false; end if;

  insert into private.source_fetch_claims (
    request_key,
    source_id,
    purpose
  ) values (
    p_request_key,
    v_source_id,
    p_purpose
  );
  return true;
end;
$$;

revoke all on function api.worker_claim_remotive_fetch(uuid,text)
from public, anon, authenticated;
grant execute on function api.worker_claim_remotive_fetch(uuid,text)
to service_role;

commit;
