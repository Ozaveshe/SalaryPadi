begin;

create or replace view api.companies
with (security_invoker = true, security_barrier = true)
as
select
  c.id, c.slug, c.display_name, c.website_url, c.industry, c.size_band,
  c.description, c.headquarters_country, c.verification_status,
  c.verification_scope, c.updated_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', l.country_code,
      'city', l.city,
      'region', l.region,
      'location_type', l.location_type,
      'is_primary', l.is_primary
    ) order by l.is_primary desc, l.country_code, l.city)
    from app.company_locations l
    where l.company_id = c.id
  ), '[]'::jsonb) as locations
from app.companies c
where c.record_status = 'published';

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
  e.provenance as eligibility_provenance, e.last_verified_at as eligibility_verified_at,
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
  extract(epoch from s.refresh_interval)::integer as refresh_interval_seconds,
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
  ), '[]'::jsonb) as risk_indicators
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

create or replace view api.company_reviews
with (security_invoker = true, security_barrier = true)
as
select
  p.id, p.company_id, p.role_family_id, p.country_code, p.employment_status,
  p.employment_period_label, p.compensation_rating, p.pay_reliability_rating,
  p.management_rating, p.work_life_rating, p.career_growth_rating,
  p.overall_rating, p.pros, p.cons, p.advice_to_management, p.published_at,
  c.slug as company_slug,
  r.slug as role_slug,
  r.name as role_family
from app.review_publications p
join app.companies c on c.id = p.company_id
left join app.role_families r on r.id = p.role_family_id
where p.publication_status = 'published';

create or replace view api.interview_experiences
with (security_invoker = true, security_barrier = true)
as
select
  p.id, p.company_id, p.role_family_id, p.seniority, p.country_code,
  p.application_source, p.stages, p.approximate_duration_label, p.difficulty,
  p.feedback_received, p.outcome, p.question_themes, p.general_experience,
  p.published_at,
  c.slug as company_slug,
  r.slug as role_slug,
  r.name as role_family
from app.interview_publications p
join app.companies c on c.id = p.company_id
left join app.role_families r on r.id = p.role_family_id
where p.publication_status = 'published';

create or replace view api.company_ratings
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.company_id, s.sample_size, s.overall_rating, s.confidence_label,
  s.rule_version_id, s.computed_at, c.slug as company_slug
from app.company_rating_snapshots s
join app.companies c on c.id = s.company_id
where s.is_current and s.is_released;

create or replace view api.company_benefits
with (security_invoker = true, security_barrier = true)
as
select
  b.id, b.company_id, c.slug as company_slug, b.benefit_code, b.label,
  b.description, b.source_kind, b.sample_size, b.confidence_label,
  b.last_verified_at
from app.company_benefits b
join app.companies c on c.id = b.company_id
where b.record_status = 'published';

grant select on api.company_benefits to anon, authenticated;

comment on view api.jobs is
  'Published non-fixture jobs with source policy, eligibility, skills, and public risk evidence for the SalaryPadi web product.';
comment on view api.company_benefits is
  'Published company benefits with provenance and confidence labels.';

commit;
