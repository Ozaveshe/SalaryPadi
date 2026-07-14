-- Fail-closed SEO eligibility, Google JobPosting notification outbox, and
-- evidence-pack editorial operations. This migration creates no public page,
-- enables no provider integration, and submits no URL.

create table if not exists editorial.seo_landing_pages (
  landing_key text primary key,
  canonical_path text not null unique,
  stable_demand_signal boolean not null default false,
  demand_evidence text,
  demand_reviewed_at timestamptz,
  demand_reviewed_by uuid references private.profiles(user_id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint seo_landing_key_format check (landing_key ~ '^[a-z0-9_]+$'),
  constraint seo_landing_path_format check (canonical_path ~ '^/jobs(?:/[a-z0-9-]+)+$'),
  constraint seo_landing_demand_evidence check (
    (not stable_demand_signal)
    or (
      char_length(btrim(coalesce(demand_evidence, ''))) between 10 and 1000
      and demand_reviewed_at is not null
      and demand_reviewed_by is not null
    )
  )
);

alter table editorial.seo_landing_pages enable row level security;
alter table editorial.seo_landing_pages force row level security;
revoke all on editorial.seo_landing_pages from public, anon, authenticated;

insert into editorial.seo_landing_pages (landing_key, canonical_path) values
  ('remote_nigeria', '/jobs/remote'),
  ('nigeria_local', '/jobs/nigeria'),
  ('nigeria_graduate', '/jobs/graduate'),
  ('visa_sponsorship_nigeria', '/jobs/visa-sponsorship'),
  ('nigeria_software', '/jobs/software'),
  ('nigeria_ngo', '/jobs/ngo'),
  ('role_software_engineering', '/jobs/roles/software-engineering'),
  ('city_lagos', '/jobs/cities/lagos')
on conflict (landing_key) do update set
  canonical_path = excluded.canonical_path,
  updated_at = clock_timestamp();

create or replace function security.job_matches_seo_landing(
  p_job_id uuid,
  p_landing_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_landing_key
      when 'remote_nigeria' then
        job.work_arrangement = 'remote'
        and (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
      when 'nigeria_local' then
        job.work_arrangement <> 'remote'
        and exists (
          select 1 from app.job_locations location
          where location.job_id = job.id and location.country_code = 'NG'
        )
      when 'nigeria_graduate' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and (
          job.experience_level = 'entry'
          or job.employment_type = 'internship'
          or concat_ws(' ', job.title, job.description_text) ~* '\m(graduate|trainee|intern(ship)?|nysc)\M'
        )
      when 'visa_sponsorship_nigeria' then
        eligibility.visa_sponsorship is true
        and (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
      when 'nigeria_software' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, role.name) ~* '\m(software|developer|engineering|frontend|backend|devops|data engineer)\M'
      when 'nigeria_ngo' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, company.display_name, job.description_text)
          ~* '\m(ngo|nonprofit|non-profit|humanitarian|development organisation|development organization)\M'
      when 'role_software_engineering' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, role.name)
          ~* '\m(software engineer|software developer|frontend engineer|backend engineer|full.?stack engineer)\M'
      when 'city_lagos' then
        job.work_arrangement <> 'remote'
        and exists (
          select 1 from app.job_locations location
          where location.job_id = job.id
            and location.country_code = 'NG'
            and location.city ~* '^lagos$'
        )
      else false
    end
    from app.jobs job
    join app.companies company on company.id = job.company_id
    left join app.job_eligibility eligibility on eligibility.job_id = job.id
    left join app.role_families role on role.id = job.role_family_id
    where job.id = p_job_id
  ), false)
$$;

revoke all on function security.job_matches_seo_landing(uuid, text)
from public, anon, authenticated, service_role;

create or replace function api.job_landing_page_metrics(p_landing_key text)
returns table (
  landing_key text,
  active_unique_jobs integer,
  unique_jobs_seen_90_days integer,
  company_count integer,
  stable_demand_signal boolean,
  last_modified timestamptz,
  measured_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with landing as (
    select page.landing_key, page.stable_demand_signal
    from editorial.seo_landing_pages page
    where page.landing_key = p_landing_key
  ), eligible_jobs as (
    select job.id, job.company_id, job.updated_at, job.last_checked_at
    from app.jobs job
    join app.companies company on company.id = job.company_id
    join app.job_sources source on source.id = job.source_id
    where job.status = 'published'
      and job.lifecycle_state <> 'closed'
      and job.canonical_job_id is null
      and not job.is_fixture
      and (job.valid_through is null or job.valid_through > statement_timestamp())
      and company.record_status = 'published'
      and source.may_index_jobs
      and security.job_source_policy_is_runnable(source.id)
      and security.public_job_provenance(job.id) is not null
      and security.job_matches_seo_landing(job.id, p_landing_key)
  ), seen_jobs as (
    select distinct link.canonical_job_id
    from ingest.job_occurrence_links link
    join ingest.job_source_occurrences occurrence on occurrence.id = link.occurrence_id
    join app.jobs job on job.id = link.canonical_job_id
    join app.job_sources source on source.id = job.source_id
    where occurrence.observed_at >= statement_timestamp() - interval '90 days'
      and source.may_index_jobs
      and security.job_matches_seo_landing(job.id, p_landing_key)
  )
  select landing.landing_key,
    (select count(*)::integer from eligible_jobs),
    (select count(*)::integer from seen_jobs),
    (select count(distinct company_id)::integer from eligible_jobs),
    landing.stable_demand_signal,
    (select max(greatest(updated_at, last_checked_at)) from eligible_jobs),
    statement_timestamp()
  from landing
$$;

revoke all on function api.job_landing_page_metrics(text) from public;
grant execute on function api.job_landing_page_metrics(text) to anon, authenticated, service_role;

create table if not exists private.google_indexing_outbox (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references app.jobs(id) on delete set null,
  job_slug text not null,
  notification_kind text not null,
  idempotency_key text not null unique,
  status text not null default 'pending',
  attempts smallint not null default 0,
  available_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  completed_at timestamptz,
  provider_http_status integer,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint google_indexing_kind check (notification_kind in ('URL_UPDATED', 'URL_DELETED')),
  constraint google_indexing_status check (status in ('pending', 'processing', 'sent', 'dead')),
  constraint google_indexing_slug check (job_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint google_indexing_attempts check (attempts between 0 and 5),
  constraint google_indexing_http_status check (
    provider_http_status is null or provider_http_status between 100 and 599
  ),
  constraint google_indexing_error_code check (
    error_code is null or error_code ~ '^[a-z0-9_]{2,80}$'
  )
);

create index if not exists google_indexing_outbox_claim
on private.google_indexing_outbox (available_at, created_at)
where status = 'pending';

alter table private.google_indexing_outbox enable row level security;
alter table private.google_indexing_outbox force row level security;
revoke all on private.google_indexing_outbox from public, anon, authenticated;

create or replace function security.google_indexing_source_is_eligible(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.job_sources source
    where source.id = p_source_id
      and source.may_index_jobs
      and source.may_emit_jobposting_schema
      and security.job_source_policy_is_runnable(source.id)
  )
$$;

revoke all on function security.google_indexing_source_is_eligible(uuid)
from public, anon, authenticated, service_role;

create or replace function security.google_indexing_job_is_eligible(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.jobs job
    join app.companies company on company.id = job.company_id
    where job.id = p_job_id
      and job.status = 'published'
      and job.lifecycle_state <> 'closed'
      and job.canonical_job_id is null
      and not job.is_fixture
      and (job.valid_through is null or job.valid_through > statement_timestamp())
      and company.record_status = 'published'
      and security.google_indexing_source_is_eligible(job.source_id)
      and security.public_job_provenance(job.id) is not null
  )
$$;

revoke all on function security.google_indexing_job_is_eligible(uuid)
from public, anon, authenticated, service_role;

create or replace function security.enqueue_google_indexing_job_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_eligible boolean := false;
  v_new_eligible boolean := false;
  v_kind text;
  v_slug text;
  v_job_id uuid;
  v_version text;
begin
  if tg_op <> 'INSERT' then
    v_old_eligible := old.status = 'published'
      and old.lifecycle_state <> 'closed'
      and old.canonical_job_id is null
      and not old.is_fixture
      and (old.valid_through is null or old.valid_through > statement_timestamp())
      and security.google_indexing_source_is_eligible(old.source_id)
      and exists (
        select 1 from app.companies company
        where company.id = old.company_id
          and company.record_status = 'published'
      )
      and security.public_job_provenance(old.id) is not null;
  end if;
  if tg_op <> 'DELETE' then
    v_new_eligible := security.google_indexing_job_is_eligible(new.id);
  end if;
  if tg_op = 'UPDATE' and v_old_eligible and v_new_eligible then
    if old.slug is distinct from new.slug then
      insert into private.google_indexing_outbox (
        job_id, job_slug, notification_kind, idempotency_key
      ) values (
        old.id, old.slug, 'URL_DELETED',
        old.id::text || ':URL_DELETED:old-slug:'
          || encode(extensions.digest(old.slug || ':' || new.slug, 'sha256'), 'hex')
      ) on conflict (idempotency_key) do nothing;
    elsif row(
      old.company_id, old.source_id, old.external_source_id, old.title,
      old.description_text, old.requirements_text, old.benefits_text,
      old.work_arrangement, old.employment_type, old.role_family_id,
      old.salary_min, old.salary_max, old.currency_code, old.pay_period,
      old.application_url, old.posted_at, old.valid_through
    ) is not distinct from row(
      new.company_id, new.source_id, new.external_source_id, new.title,
      new.description_text, new.requirements_text, new.benefits_text,
      new.work_arrangement, new.employment_type, new.role_family_id,
      new.salary_min, new.salary_max, new.currency_code, new.pay_period,
      new.application_url, new.posted_at, new.valid_through
    ) then
      return new;
    end if;
  end if;
  if v_new_eligible then
    v_kind := 'URL_UPDATED';
    v_job_id := new.id;
    v_slug := new.slug;
    v_version := new.updated_at::text;
  elsif v_old_eligible then
    v_kind := 'URL_DELETED';
    v_job_id := old.id;
    v_slug := old.slug;
    v_version := case
      when tg_op = 'DELETE' then statement_timestamp()::text
      else new.updated_at::text
    end;
  else
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into private.google_indexing_outbox (
    job_id, job_slug, notification_kind, idempotency_key
  ) values (
    v_job_id, v_slug, v_kind,
    v_job_id::text || ':' || v_kind || ':' || encode(extensions.digest(v_version, 'sha256'), 'hex')
  ) on conflict (idempotency_key) do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists jobs_google_indexing_outbox on app.jobs;
create trigger jobs_google_indexing_outbox
after insert or update on app.jobs
for each row execute function security.enqueue_google_indexing_job_change();

drop trigger if exists jobs_google_indexing_outbox_delete on app.jobs;
create trigger jobs_google_indexing_outbox_delete
before delete on app.jobs
for each row execute function security.enqueue_google_indexing_job_change();

create or replace function security.enqueue_google_indexing_job_child_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_slug text;
  v_version text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'DELETE' then
    v_job_id := old.job_id;
    v_version := to_jsonb(old)::text;
  else
    v_job_id := new.job_id;
    v_version := to_jsonb(new)::text;
  end if;
  if not security.google_indexing_job_is_eligible(v_job_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select job.slug into v_slug from app.jobs job where job.id = v_job_id;
  insert into private.google_indexing_outbox (
    job_id, job_slug, notification_kind, idempotency_key
  ) values (
    v_job_id, v_slug, 'URL_UPDATED',
    v_job_id::text || ':URL_UPDATED:' || tg_table_name || ':'
      || encode(extensions.digest(v_version, 'sha256'), 'hex')
  ) on conflict (idempotency_key) do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists job_eligibility_google_indexing_outbox on app.job_eligibility;
create trigger job_eligibility_google_indexing_outbox
after insert or update or delete on app.job_eligibility
for each row execute function security.enqueue_google_indexing_job_child_change();

drop trigger if exists job_eligibility_countries_google_indexing_outbox
on app.job_eligibility_countries;
create trigger job_eligibility_countries_google_indexing_outbox
after insert or update or delete on app.job_eligibility_countries
for each row execute function security.enqueue_google_indexing_job_child_change();

drop trigger if exists job_locations_google_indexing_outbox on app.job_locations;
create trigger job_locations_google_indexing_outbox
after insert or update or delete on app.job_locations
for each row execute function security.enqueue_google_indexing_job_child_change();

drop trigger if exists job_skills_google_indexing_outbox on app.job_skills;
create trigger job_skills_google_indexing_outbox
after insert or update or delete on app.job_skills
for each row execute function security.enqueue_google_indexing_job_child_change();

create or replace function security.enqueue_google_indexing_company_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_version text;
begin
  if row(old.display_name, old.record_status)
    is not distinct from row(new.display_name, new.record_status) then
    return new;
  end if;
  if new.record_status = 'published' then
    v_kind := 'URL_UPDATED';
  elsif old.record_status = 'published' then
    v_kind := 'URL_DELETED';
  else
    return new;
  end if;
  v_version := concat_ws(':', old.display_name, new.display_name,
    old.record_status::text, new.record_status::text);
  insert into private.google_indexing_outbox (
    job_id, job_slug, notification_kind, idempotency_key
  )
  select job.id, job.slug, v_kind,
    job.id::text || ':' || v_kind || ':company:'
      || encode(extensions.digest(v_version, 'sha256'), 'hex')
  from app.jobs job
  where job.company_id = new.id
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and security.google_indexing_source_is_eligible(job.source_id)
    and security.public_job_provenance(job.id) is not null
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_google_indexing_outbox on app.companies;
create trigger companies_google_indexing_outbox
after update on app.companies
for each row execute function security.enqueue_google_indexing_company_change();

create or replace function security.enqueue_google_indexing_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    and old.policy_review_due_at > statement_timestamp()
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
$$;

drop trigger if exists job_sources_google_indexing_outbox on app.job_sources;
create trigger job_sources_google_indexing_outbox
after update on app.job_sources
for each row execute function security.enqueue_google_indexing_source_change();

revoke all on function security.enqueue_google_indexing_job_change()
from public, anon, authenticated, service_role;
revoke all on function security.enqueue_google_indexing_job_child_change()
from public, anon, authenticated, service_role;
revoke all on function security.enqueue_google_indexing_company_change()
from public, anon, authenticated, service_role;
revoke all on function security.enqueue_google_indexing_source_change()
from public, anon, authenticated, service_role;

create or replace function api.google_indexing_claim_notifications(p_limit integer default 20)
returns table (
  outbox_id uuid,
  job_id uuid,
  job_slug text,
  notification_kind text,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid indexing claim limit';
  end if;
  update private.google_indexing_outbox outbox
  set status = 'dead', error_code = 'ineligible_before_delivery',
    completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where outbox.status = 'pending'
    and outbox.notification_kind = 'URL_UPDATED'
    and not security.google_indexing_job_is_eligible(outbox.job_id);
  return query
  with claimed as (
    select pending.id
    from private.google_indexing_outbox pending
    where pending.status = 'pending' and pending.available_at <= clock_timestamp()
    order by pending.available_at, pending.created_at
    limit p_limit for update skip locked
  )
  update private.google_indexing_outbox outbox
  set status = 'processing', attempts = outbox.attempts + 1,
    claimed_at = clock_timestamp(), updated_at = clock_timestamp()
  from claimed where outbox.id = claimed.id
  returning outbox.id, outbox.job_id, outbox.job_slug,
    outbox.notification_kind, outbox.attempts::integer;
end;
$$;

create or replace function api.google_indexing_finish_notification(
  p_outbox_id uuid,
  p_success boolean,
  p_http_status integer default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_http_status is not null and p_http_status not between 100 and 599 then
    raise exception using errcode = '22023', message = 'invalid provider status';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023', message = 'invalid indexing error code';
  end if;
  update private.google_indexing_outbox outbox
  set status = case
      when p_success then 'sent'
      when outbox.attempts >= 5 then 'dead'
      else 'pending'
    end,
    available_at = case
      when p_success or outbox.attempts >= 5 then outbox.available_at
      else clock_timestamp() + make_interval(mins => least(360, (2 ^ outbox.attempts)::integer * 5))
    end,
    completed_at = case when p_success or outbox.attempts >= 5 then clock_timestamp() else null end,
    provider_http_status = p_http_status,
    error_code = case when p_success then null else coalesce(p_error_code, 'provider_request_failed') end,
    updated_at = clock_timestamp()
  where outbox.id = p_outbox_id and outbox.status = 'processing';
  return found;
end;
$$;

revoke all on function api.google_indexing_claim_notifications(integer)
from public, anon, authenticated;
revoke all on function api.google_indexing_finish_notification(uuid, boolean, integer, text)
from public, anon, authenticated;
grant execute on function api.google_indexing_claim_notifications(integer) to service_role;
grant execute on function api.google_indexing_finish_notification(uuid, boolean, integer, text) to service_role;

create table if not exists editorial.topic_signals (
  id uuid primary key default gen_random_uuid(),
  signal_kind text not null,
  signal_key text not null,
  window_start date not null,
  window_end date not null,
  impressions integer,
  clicks integer,
  product_events integer,
  source_checked_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (signal_kind, signal_key, window_start, window_end),
  constraint topic_signal_kind check (signal_kind in ('search_console', 'site_search', 'product_data')),
  constraint topic_signal_key check (char_length(signal_key) between 3 and 160),
  constraint topic_signal_window check (window_start <= window_end),
  constraint topic_signal_counts check (
    coalesce(impressions, 0) >= 0 and coalesce(clicks, 0) >= 0 and coalesce(product_events, 0) >= 0
  )
);

create table if not exists editorial.evidence_packs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references editorial.topic_candidates(id) on delete cascade,
  snapshot_id uuid references editorial.data_snapshots(id) on delete restrict,
  signal_summary jsonb not null default '[]'::jsonb,
  source_summary jsonb not null default '[]'::jsonb,
  claim_constraints jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  prepared_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint evidence_pack_status check (status in ('draft', 'reviewed', 'rejected', 'expired')),
  constraint evidence_pack_signal_array check (jsonb_typeof(signal_summary) = 'array'),
  constraint evidence_pack_source_array check (jsonb_typeof(source_summary) = 'array'),
  constraint evidence_pack_claim_array check (jsonb_typeof(claim_constraints) = 'array'),
  constraint evidence_pack_review_pair check ((status <> 'reviewed') or (reviewed_at is not null and reviewed_by is not null))
);

alter table editorial.topic_signals enable row level security;
alter table editorial.topic_signals force row level security;
alter table editorial.evidence_packs enable row level security;
alter table editorial.evidence_packs force row level security;
revoke all on editorial.topic_signals, editorial.evidence_packs from public, anon, authenticated;

create or replace function api.editorial_record_topic_signals(p_signals jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  if jsonb_typeof(p_signals) <> 'array' or jsonb_array_length(p_signals) > 100 then
    raise exception using errcode = '22023', message = 'invalid editorial topic signals';
  end if;
  insert into editorial.topic_signals (
    signal_kind, signal_key, window_start, window_end,
    impressions, clicks, product_events, source_checked_at
  )
  select signal.signal_kind, btrim(signal.signal_key), signal.window_start,
    signal.window_end, signal.impressions, signal.clicks,
    signal.product_events, signal.source_checked_at
  from jsonb_to_recordset(p_signals) signal(
    signal_kind text, signal_key text, window_start date, window_end date,
    impressions integer, clicks integer, product_events integer,
    source_checked_at timestamptz
  )
  where signal.signal_kind in ('search_console', 'site_search', 'product_data')
    and char_length(btrim(signal.signal_key)) between 3 and 160
    and signal.signal_key !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    and signal.signal_key !~ '(^|[^0-9])[0-9]{10,14}([^0-9]|$)'
    and signal.window_start <= signal.window_end
    and signal.source_checked_at <= clock_timestamp() + interval '5 minutes'
  on conflict (signal_kind, signal_key, window_start, window_end) do update set
    impressions = excluded.impressions,
    clicks = excluded.clicks,
    product_events = excluded.product_events,
    source_checked_at = excluded.source_checked_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function api.editorial_prepare_evidence_pack()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate editorial.topic_candidates%rowtype;
  v_snapshot editorial.data_snapshots%rowtype;
  v_pack_id uuid;
begin
  perform security.require_service_role();
  select * into v_candidate from editorial.topic_candidates candidate
  where candidate.status = 'selected'
    and not exists (
      select 1 from editorial.evidence_packs pack where pack.candidate_id = candidate.id
    )
  order by candidate.priority desc, candidate.created_at, candidate.id
  limit 1 for update skip locked;
  if not found then
    return jsonb_build_object('prepared', 0, 'reason', 'no_selected_candidate');
  end if;
  select * into v_snapshot from editorial.data_snapshots
  order by captured_at desc, id desc limit 1;
  if v_candidate.topic_kind = 'data_brief'
     and (v_snapshot.id is null or v_snapshot.source_checked_at < clock_timestamp() - interval '25 hours') then
    return jsonb_build_object('prepared', 0, 'reason', 'fresh_snapshot_required');
  end if;
  insert into editorial.evidence_packs (
    candidate_id, snapshot_id, signal_summary, source_summary, claim_constraints
  ) values (
    v_candidate.id,
    case when v_candidate.topic_kind = 'data_brief' then v_snapshot.id else null end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', signal.signal_kind,
        'key', signal.signal_key,
        'window_start', signal.window_start,
        'window_end', signal.window_end,
        'impressions', signal.impressions,
        'clicks', signal.clicks,
        'product_events', signal.product_events,
        'checked_at', signal.source_checked_at
      ) order by signal.source_checked_at desc)
      from (
        select * from editorial.topic_signals
        where source_checked_at >= clock_timestamp() - interval '90 days'
        order by source_checked_at desc limit 30
      ) signal
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_id', source.id,
        'canonical_url', source.canonical_url,
        'publisher', source.publisher,
        'last_checked_at', source.last_checked_at,
        'link_status', source.link_status
      ) order by source.canonical_url)
      from editorial.sources source
      where source.link_status in ('healthy', 'redirected')
    ), '[]'::jsonb),
    '["No claim without a cited source or reproducible snapshot.","PII and private contribution text are prohibited.","Tax, salary, legal, employer and workplace claims require human approval.","Copyrighted third-party prose must not be copied or paraphrased."]'::jsonb
  ) returning id into v_pack_id;
  return jsonb_build_object('prepared', 1, 'evidence_pack_id', v_pack_id);
end;
$$;

create or replace function security.require_editorial_evidence_pack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidate_id is not null and not exists (
    select 1 from editorial.evidence_packs pack
    where pack.candidate_id = new.candidate_id and pack.status in ('draft', 'reviewed')
  ) then
    raise exception using errcode = '23514', message = 'editorial evidence pack required';
  end if;
  return new;
end;
$$;

drop trigger if exists editorial_articles_require_evidence_pack on editorial.articles;
create trigger editorial_articles_require_evidence_pack
before insert on editorial.articles
for each row execute function security.require_editorial_evidence_pack();

-- Replace the launch-era outline generator with a useful deterministic brief.
-- Cornerstones remain private outlines; only snapshot-backed data briefs can
-- ever reach the no-human-approval branch in editorial_publish_due().
create or replace function api.editorial_prepare_one_draft()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate editorial.topic_candidates%rowtype;
  v_snapshot editorial.data_snapshots%rowtype;
  v_article_id uuid;
  v_source_id uuid;
  v_body text;
begin
  perform security.require_service_role();
  select * into v_candidate
  from editorial.topic_candidates candidate
  where candidate.status = 'selected'
    and not exists (
      select 1 from editorial.articles article
      where article.candidate_id = candidate.id
    )
    and exists (
      select 1 from editorial.evidence_packs pack
      where pack.candidate_id = candidate.id
        and pack.status in ('draft', 'reviewed')
    )
  order by candidate.priority desc, candidate.created_at, candidate.id
  limit 1 for update skip locked;
  if not found then
    return jsonb_build_object('drafted', 0, 'reason', 'no_evidence_backed_candidate');
  end if;

  select * into v_snapshot from editorial.data_snapshots
  order by captured_at desc, id desc limit 1;
  if v_candidate.topic_kind = 'data_brief'
     and (v_snapshot.id is null
       or v_snapshot.source_checked_at < clock_timestamp() - interval '25 hours') then
    return jsonb_build_object('drafted', 0, 'reason', 'fresh_snapshot_required');
  end if;

  select source.id into v_source_id
  from editorial.sources source
  where source.canonical_url = 'https://salarypadi.com/methodology';
  if v_source_id is null then
    return jsonb_build_object('drafted', 0, 'reason', 'methodology_source_required');
  end if;

  if v_candidate.topic_kind = 'data_brief' then
    v_body := 'This brief describes the SalaryPadi canonical job inventory at '
      || to_char(v_snapshot.source_checked_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC')
      || '. It is a reproducible product-data snapshot, not a forecast and not a measure of every job available in the market. The snapshot counted '
      || coalesce(v_snapshot.metrics->>'active_jobs', '0') || ' active jobs. Of those, '
      || coalesce(v_snapshot.metrics->>'indexable_jobs', '0') || ' were attached to a current source policy that permitted public search indexing. Records from supplemental sources can remain useful to a visitor while being excluded from this public-data count.'
      || E'\n\n## Eligibility and work mode\n\n'
      || 'The same snapshot contained ' || coalesce(v_snapshot.metrics->>'remote_jobs', '0')
      || ' remote jobs. Explicit source evidence supported Nigerian applicants for '
      || coalesce(v_snapshot.metrics->>'nigeria_eligible', '0') || ' active jobs, while '
      || coalesce(v_snapshot.metrics->>'nigeria_unclear', '0')
      || ' active jobs remained unclear. Generic remote wording is never converted into Nigeria eligibility. An unclear count means the source did not provide enough applicant-location evidence; it does not mean the employer excludes Nigerians.'
      || E'\n\n## Deadlines and freshness\n\n'
      || coalesce(v_snapshot.metrics->>'jobs_with_deadlines', '0')
      || ' active jobs had a stated deadline and '
      || coalesce(v_snapshot.metrics->>'jobs_without_deadlines', '0')
      || ' did not. A missing deadline is preserved as unknown. Jobs can close after the snapshot, so readers should check the detailed Job Truth Card and the original vacancy before applying. SalaryPadi removes a record from active counts when the deadline passes, the source confirms closure, or the absence lifecycle reaches its conservative close threshold.'
      || E'\n\n## How to reproduce this brief\n\n'
      || 'The scheduled snapshot reads the canonical job catalogue, keeps only open records whose deadline has not passed, and groups the results using stored work-mode, eligibility, deadline, source-policy and freshness fields. Counts are stored with a content hash and source summary. The article cites the first-party methodology record and is rechecked against a snapshot no older than twenty-five hours before publication. If that evidence is stale, missing or inconsistent, preflight blocks publication. No salary, tax, legal, employer-quality or workplace claim is inferred from these counts.';
  else
    v_body := 'Editorial draft outline. This cornerstone must not be published until every substantive claim has a cited source, a completed fact check, and explicit human approval.'
      || E'\n\n## Reader question\n\n' || v_candidate.search_intent
      || E'\n\n## Evidence required\n\n' || v_candidate.evidence_requirements::text
      || E'\n\n## Internal routes\n\n' || array_to_string(v_candidate.internal_link_targets, ', ')
      || E'\n\n[HUMAN REVIEW REQUIRED BEFORE PUBLICATION]';
  end if;

  insert into editorial.articles (
    candidate_id, snapshot_id, slug, title, description, article_kind,
    body_markdown, deterministic, internal_link_targets, next_review_at
  ) values (
    v_candidate.id,
    case when v_candidate.topic_kind = 'data_brief' then v_snapshot.id else null end,
    v_candidate.slug, v_candidate.title, v_candidate.rationale,
    v_candidate.topic_kind, v_body,
    v_candidate.topic_kind = 'data_brief',
    v_candidate.internal_link_targets,
    clock_timestamp() + case
      when v_candidate.topic_kind = 'data_brief' then interval '1 day'
      else interval '90 days'
    end
  ) returning id into v_article_id;

  insert into editorial.article_sources (article_id, source_id, purpose)
  values (v_article_id, v_source_id, 'SalaryPadi methodology and data provenance');

  if v_candidate.topic_kind = 'data_brief' then
    insert into editorial.claims (
      article_id, source_id, claim_text, claim_type, status,
      requires_editorial_review, evidence_note, checked_at
    ) values
      (v_article_id, v_source_id,
        'Active jobs: ' || coalesce(v_snapshot.metrics->>'active_jobs', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Indexable active jobs: ' || coalesce(v_snapshot.metrics->>'indexable_jobs', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Nigeria-eligible active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_eligible', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Nigeria-unclear active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_unclear', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at);
  end if;

  update editorial.topic_candidates
  set status = 'drafted', updated_at = clock_timestamp(),
    admin_version = admin_version + 1
  where id = v_candidate.id;
  return jsonb_build_object(
    'drafted', 1,
    'article_id', v_article_id,
    'kind', v_candidate.topic_kind,
    'deterministic', v_candidate.topic_kind = 'data_brief'
  );
end;
$$;

alter table editorial.audit_findings
  drop constraint if exists editorial_audit_kind;
alter table editorial.audit_findings
  add constraint editorial_audit_kind
  check (audit_kind in ('preflight', 'nightly', 'weekly', 'monthly'));

create or replace function api.editorial_run_monthly_audit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new integer;
begin
  perform security.require_service_role();
  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'monthly', article.id, 'critical', 'review_overdue',
    'Published legal, tax, salary, employer, workplace, source-policy or methodology material is due for human freshness review.'
  from editorial.articles article
  where article.status = 'published'
    and (article.next_review_at is null or article.next_review_at <= clock_timestamp())
  on conflict do nothing;
  get diagnostics v_new = row_count;
  update editorial.articles article
  set status = 'update_required', updated_at = clock_timestamp(),
    admin_version = admin_version + 1
  where article.status = 'published'
    and exists (
      select 1 from editorial.audit_findings finding
      where finding.article_id = article.id
        and finding.audit_kind = 'monthly'
        and finding.status = 'open'
    );
  return jsonb_build_object(
    'new_findings', v_new,
    'open_findings', (
      select count(*) from editorial.audit_findings
      where audit_kind = 'monthly' and status = 'open'
    )
  );
end;
$$;

create or replace function api.editorial_run_preflight_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checked integer := 0;
  v_passed integer := 0;
begin
  perform security.require_service_role();
  delete from editorial.audit_findings
  where audit_kind = 'preflight' and status = 'open';

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'possible_pii',
    'Draft contains an email address, phone-like sequence, private-key marker, or credential phrase.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check') and (
    article.body_markdown ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or article.body_markdown ~ '(^|[^0-9])[0-9]{10,14}([^0-9]|$)'
    or article.body_markdown ~* 'BEGIN [A-Z ]*PRIVATE KEY'
    or article.body_markdown ~* '\m(password|api key|secret key|access token)\M\s*[:=]'
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'evidence_pack_missing',
    'Every workflow draft requires a private evidence pack before review.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check')
    and article.candidate_id is not null
    and not exists (
      select 1 from editorial.evidence_packs pack
      where pack.candidate_id = article.candidate_id
        and pack.status in ('draft', 'reviewed')
    ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'unverified_claim',
    'One or more claims are not verified against a source record.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check') and exists (
    select 1 from editorial.claims claim
    where claim.article_id = article.id and claim.status <> 'verified'
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'human_review_required',
    'Tax, salary, legal, employer, workplace, and employment claims require human approval.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check') and exists (
    select 1 from editorial.claims claim
    where claim.article_id = article.id
      and claim.claim_type in ('salary', 'tax', 'legal', 'company', 'employment')
      and claim.requires_editorial_review
      and claim.checked_by is null
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'source_link_unhealthy',
    'A cited source has not passed the latest link and freshness check.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check') and exists (
    select 1 from editorial.article_sources article_source
    join editorial.sources source on source.id = article_source.source_id
    where article_source.article_id = article.id
      and (
        source.link_status not in ('healthy', 'redirected')
        or source.last_checked_at is null
        or source.last_checked_at < clock_timestamp() - interval '35 days'
      )
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'possible_duplicate',
    'Another article has the same normalized title or substantially similar draft text.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check') and exists (
    select 1 from editorial.articles other
    where other.id <> article.id
      and other.status <> 'archived'
      and (
        lower(regexp_replace(other.title, '\s+', ' ', 'g')) =
          lower(regexp_replace(article.title, '\s+', ' ', 'g'))
        or extensions.similarity(left(other.body_markdown, 5000), left(article.body_markdown, 5000)) >= 0.82
      )
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'warning', 'possible_copyright_quote',
    'Draft contains a long quoted or blockquoted passage that requires a copyright and source check.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check')
    and article.body_markdown ~ E'(^|\n)>[^\n]{180,}'
  on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'thin_data_brief',
    'An auto-publishable deterministic brief must contain at least 180 words of reproducible context and methodology.'
  from editorial.articles article
  where article.status in ('draft', 'fact_check')
    and article.article_kind = 'data_brief'
    and cardinality(regexp_split_to_array(btrim(article.body_markdown), '\s+')) < 180
  on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', article.id, 'critical', 'fresh_snapshot_required',
    'Deterministic data brief is missing a source snapshot newer than 25 hours.'
  from editorial.articles article
  left join editorial.data_snapshots snapshot on snapshot.id = article.snapshot_id
  where article.status in ('draft', 'fact_check')
    and article.article_kind = 'data_brief'
    and (snapshot.id is null or snapshot.source_checked_at < clock_timestamp() - interval '25 hours')
  on conflict do nothing;

  update editorial.articles article set
    status = 'fact_check',
    fact_check_status = case when exists (
      select 1 from editorial.audit_findings finding
      where finding.article_id = article.id
        and finding.audit_kind = 'preflight'
        and finding.status = 'open'
    ) then 'needs_review' else 'passed' end,
    editorial_approval_status = case
      when article.article_kind = 'data_brief'
        and article.deterministic
        and not exists (
          select 1 from editorial.claims claim
          where claim.article_id = article.id and claim.requires_editorial_review
        )
      then 'not_required'
      else article.editorial_approval_status
    end,
    updated_at = clock_timestamp(),
    admin_version = admin_version + 1
  where article.status in ('draft', 'fact_check');
  get diagnostics v_checked = row_count;
  select count(*) into v_passed from editorial.articles
  where status = 'fact_check' and fact_check_status = 'passed';
  return jsonb_build_object('checked', v_checked, 'passed', v_passed);
end;
$$;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values
  ('google_indexing_notifications', interval '15 minutes', interval '45 minutes', 'SalaryPadi SEO operations owner'),
  ('editorial_evidence_packs', interval '24 hours', interval '27 hours', 'SalaryPadi research editor'),
  ('editorial_monthly_audit', interval '1 month', interval '35 days', 'SalaryPadi editorial policy owner')
on conflict (task_key) do update set
  expected_interval = excluded.expected_interval,
  stale_after = excluded.stale_after,
  owner_label = excluded.owner_label,
  enabled = true,
  updated_at = clock_timestamp();

revoke all on function api.editorial_prepare_evidence_pack() from public, anon, authenticated;
revoke all on function api.editorial_record_topic_signals(jsonb) from public, anon, authenticated;
revoke all on function api.editorial_run_monthly_audit() from public, anon, authenticated;
grant execute on function api.editorial_prepare_evidence_pack() to service_role;
grant execute on function api.editorial_record_topic_signals(jsonb) to service_role;
grant execute on function api.editorial_run_monthly_audit() to service_role;

comment on table editorial.seo_landing_pages is
  'Human-reviewed demand state for fail-closed programmatic index gates. Volume alone cannot enable indexing.';
comment on table private.google_indexing_outbox is
  'Job-only Google Indexing API notifications. Rows are created only when both search-index and JobPosting policy rights pass.';
comment on table editorial.evidence_packs is
  'Private evidence bundle required before an editorial article draft may enter the database.';
