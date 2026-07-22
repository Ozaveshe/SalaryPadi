-- The public jobs read path re-derived the full provenance policy stack per
-- row on every request (~2.1 s for ~210 jobs as anon, against a ~3 s role
-- statement timeout). Policy answers change only when policy or job evidence
-- changes, so the provenance document and a readiness horizon are now cached
-- on app.jobs and maintained by triggers on every table that feeds the
-- decision. Time-based conditions stay live: the cached row is honoured only
-- until public_ready_until (the earliest policy-review or eligibility
-- freshness expiry that the decision depended on), and cheap per-row checks
-- (status, valid_through) remain in the view and policy.

begin;

alter table app.jobs
  add column if not exists public_provenance jsonb,
  add column if not exists public_ready_until timestamptz;

-- Recompute and store the provenance decision for one job. The expensive
-- security.public_job_provenance function is unchanged and remains the
-- single source of truth; this simply persists its answer.
create or replace function security.refresh_job_public_provenance(
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provenance jsonb;
  v_ready_until timestamptz;
  v_guard text;
begin
  if p_job_id is null then return; end if;
  -- The maintenance triggers are deferred to commit and one transaction can
  -- queue many events for one job (a sync batch rewrites locations,
  -- eligibility, and occurrence rows). The first refresh in a transaction
  -- sees the final state, so later ones for the same job are skipped.
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
    source.policy_review_due_at,
    source.authorization_expires_at,
    (
      select min(rights.review_due_at)
      from app.source_country_rights rights
      join app.market_countries country
        on country.iso2 = rights.country_code
       and country.public_routes_enabled
      where rights.source_id = job.source_id
    ),
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
$$;

revoke all on function security.refresh_job_public_provenance(uuid)
from public, anon, authenticated, service_role;

-- Row trigger for job-evidence tables (job_id or canonical_job_id column).
create or replace function security.job_provenance_evidence_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_job_id uuid;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old);
  else v_row := to_jsonb(new); end if;
  v_job_id := coalesce(
    (v_row ->> 'job_id')::uuid,
    (v_row ->> 'canonical_job_id')::uuid
  );
  perform security.refresh_job_public_provenance(v_job_id);
  return null;
end;
$$;

-- Row trigger for source-level policy tables: refresh every job of the
-- affected source. Policy edits are rare and administrative.
create or replace function security.job_provenance_source_policy_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_source_id uuid;
  v_job record;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old);
  else v_row := to_jsonb(new); end if;
  v_source_id := coalesce(
    (v_row ->> 'source_id')::uuid,
    case when tg_table_name = 'job_sources'
      then (v_row ->> 'id')::uuid end
  );
  if v_source_id is null then return null; end if;
  for v_job in
    select job.id from app.jobs job where job.source_id = v_source_id
  loop
    perform security.refresh_job_public_provenance(v_job.id);
  end loop;
  return null;
end;
$$;

-- Market-country pack changes affect every source; refresh everything.
create or replace function security.job_provenance_market_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
begin
  for v_job in select job.id from app.jobs job loop
    perform security.refresh_job_public_provenance(v_job.id);
  end loop;
  return null;
end;
$$;

-- The job's own policy-relevant columns. The refresh function writes only
-- public_provenance/public_ready_until, which are not in this list, so the
-- trigger cannot recurse.
-- All maintenance triggers are deferred to commit: one sync batch rewrites a
-- job's locations, eligibility, and occurrence rows across many statements,
-- and the refresh must run once per job on the final state.
drop trigger if exists jobs_public_provenance_refresh on app.jobs;
create constraint trigger jobs_public_provenance_refresh
after insert or update of
  status, lifecycle_state, valid_through, canonical_job_id, is_fixture,
  source_id, company_id, last_seen_at, last_verified_at, last_checked_at
on app.jobs
deferrable initially deferred
for each row execute function security.job_provenance_evidence_changed();

drop trigger if exists job_locations_provenance_refresh on app.job_locations;
create constraint trigger job_locations_provenance_refresh
after insert or update or delete on app.job_locations
deferrable initially deferred
for each row execute function security.job_provenance_evidence_changed();

drop trigger if exists job_eligibility_provenance_refresh on app.job_eligibility;
create constraint trigger job_eligibility_provenance_refresh
after insert or update or delete on app.job_eligibility
deferrable initially deferred
for each row execute function security.job_provenance_evidence_changed();

drop trigger if exists job_eligibility_countries_provenance_refresh
  on app.job_eligibility_countries;
create constraint trigger job_eligibility_countries_provenance_refresh
after insert or update or delete on app.job_eligibility_countries
deferrable initially deferred
for each row execute function security.job_provenance_evidence_changed();

drop trigger if exists job_occurrence_links_provenance_refresh
  on ingest.job_occurrence_links;
create constraint trigger job_occurrence_links_provenance_refresh
after insert or update or delete on ingest.job_occurrence_links
deferrable initially deferred
for each row execute function security.job_provenance_evidence_changed();

drop trigger if exists job_sources_provenance_refresh on app.job_sources;
create constraint trigger job_sources_provenance_refresh
after update of
  status, policy_state, allow_public_listing, authorization_revoked_at,
  authorization_reviewed_at, authorization_expires_at, policy_review_due_at,
  missing_dependencies, required_dependencies, may_index_jobs,
  may_emit_jobposting_schema
on app.job_sources
deferrable initially deferred
for each row execute function security.job_provenance_source_policy_changed();

drop trigger if exists source_country_rights_provenance_refresh
  on app.source_country_rights;
create constraint trigger source_country_rights_provenance_refresh
after insert or update or delete on app.source_country_rights
deferrable initially deferred
for each row execute function security.job_provenance_source_policy_changed();

drop trigger if exists job_source_dependencies_provenance_refresh
  on private.job_source_dependencies;
create constraint trigger job_source_dependencies_provenance_refresh
after insert or update or delete on private.job_source_dependencies
deferrable initially deferred
for each row execute function security.job_provenance_source_policy_changed();

drop trigger if exists market_countries_provenance_refresh
  on app.market_countries;
create constraint trigger market_countries_provenance_refresh
after update on app.market_countries
deferrable initially deferred
for each row execute function security.job_provenance_market_changed();

-- The view and the public read policy now consume the cached decision. All
-- purely time-based conditions stay live and cheap.
create or replace view api.jobs
with (security_invoker = true, security_barrier = true) as
 select job.id,
    job.slug,
    job.title,
    job.description_text,
    job.description_html,
    job.requirements_text,
    job.benefits_text,
    job.work_arrangement,
    job.employment_type,
    job.engagement_type,
    job.experience_level,
    job.role_family_id,
    job.salary_min,
    job.salary_max,
    job.currency_code,
    job.pay_period,
    job.gross_net,
    job.bonus_text,
    job.application_url,
    job.source_url,
    job.posted_at,
    job.valid_through,
    job.last_checked_at,
    coalesce(job.last_verified_at, job.last_seen_at) as last_verified_at,
    company.id as company_id,
    company.slug as company_slug,
    company.display_name as company_name,
    company.verification_status as company_verification_status,
    source.name as source_name,
    source.attribution_text,
    source.may_index_jobs,
    source.may_emit_jobposting_schema,
    eligibility.scope as eligibility_scope,
    eligibility.required_timezone_overlap,
    eligibility.work_authorization_requirement,
    eligibility.visa_sponsorship,
    eligibility.relocation_support,
    eligibility.evidence_text as eligibility_evidence,
    eligibility.provenance as eligibility_provenance,
    eligibility.last_verified_at as eligibility_verified_at,
    coalesce(( select jsonb_agg(jsonb_build_object('country_code', location.country_code, 'city', location.city, 'region', location.region, 'is_primary', location.is_primary) order by location.is_primary desc, location.country_code, location.city)
           from app.job_locations location
          where location.job_id = job.id), '[]'::jsonb) as locations,
    coalesce(( select jsonb_agg(jsonb_build_object('country_code', country.country_code, 'rule', country.rule) order by country.rule, country.country_code)
           from app.job_eligibility_countries country
          where country.job_id = job.id), '[]'::jsonb) as eligibility_countries,
    job.external_source_id,
    job.dedup_fingerprint,
    role.slug as role_slug,
    role.name as role_family,
    source.id as source_id,
    source.adapter_key as source_adapter_key,
    source.source_type,
    source.homepage_url as source_homepage_url,
    source.terms_url as source_terms_url,
    source.attribution_required,
    source.may_store_full_description,
    source.required_destination_kind,
    extract(epoch from source.refresh_interval)::integer as refresh_interval_seconds,
    source.terms_reviewed_at,
    coalesce(( select jsonb_agg(skill.name order by skill.name)
           from app.job_skills job_skill
             join app.skills skill on skill.id = job_skill.skill_id
          where job_skill.job_id = job.id), '[]'::jsonb) as skills,
    coalesce(( select jsonb_agg(jsonb_build_object('code', risk.code, 'severity', risk.severity, 'evidence_text', risk.evidence_text) order by risk.severity desc, risk.code)
           from app.job_risk_indicators risk
          where risk.job_id = job.id and risk.is_public), '[]'::jsonb) as risk_indicators,
    source.may_email_jobs,
    job.public_provenance as provenance
   from app.jobs job
     join app.companies company on company.id = job.company_id
     join app.job_sources source on source.id = job.source_id
     left join app.job_eligibility eligibility on eligibility.job_id = job.id
     left join app.role_families role on role.id = job.role_family_id
  where job.status = 'published'::app.job_status
    and job.lifecycle_state <> 'closed'::app.job_lifecycle_state
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > clock_timestamp())
    and company.record_status = 'published'::app.record_status
    and security.is_public_job_source(source.id)
    and job.public_provenance is not null
    and (job.public_ready_until is null
      or job.public_ready_until > clock_timestamp());

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and public_provenance is not null
  and (public_ready_until is null
    or public_ready_until > clock_timestamp())
);

-- Backfill every existing job once.
do $$
declare
  v_job record;
begin
  for v_job in select id from app.jobs loop
    perform security.refresh_job_public_provenance(v_job.id);
  end loop;
end;
$$;

commit;
