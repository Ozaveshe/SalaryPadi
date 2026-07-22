-- api.jobs evaluated security.public_job_provenance(job.id) twice per row —
-- once as the output column and once in the WHERE clause. At 200+ published
-- ATS jobs that costs ~2.3 s per feed query, close enough to the app's 6 s
-- fetch timeout that the reviewed-employer lane intermittently degrades to
-- "temporarily unavailable". The view now computes provenance once in a
-- lateral join and both filters and projects that single evaluation. Column
-- list, ordering, and semantics are unchanged.

begin;

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
    provenance.value as provenance
   from app.jobs job
     join app.companies company on company.id = job.company_id
     join app.job_sources source on source.id = job.source_id
     left join app.job_eligibility eligibility on eligibility.job_id = job.id
     left join app.role_families role on role.id = job.role_family_id
     cross join lateral (
       -- offset 0 stops the planner from pulling the subquery up and
       -- re-substituting the function call at every reference site
       select security.public_job_provenance(job.id) as value
       offset 0
     ) provenance
  where job.status = 'published'::app.job_status
    and job.lifecycle_state <> 'closed'::app.job_lifecycle_state
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > clock_timestamp())
    and company.record_status = 'published'::app.record_status
    and security.is_public_job_source(source.id)
    and provenance.value is not null;

commit;
