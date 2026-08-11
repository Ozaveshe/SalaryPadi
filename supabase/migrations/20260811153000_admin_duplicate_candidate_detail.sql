-- Give data-quality operators one protected, provenance-bearing comparison
-- before they make a canonical-job decision. The function follows current
-- canonical roots so an older candidate never presents a stale pair as truth.

begin;

create or replace function api.admin_get_duplicate_candidate(p_candidate_id uuid)
returns table(
  candidate_id uuid,
  candidate_status text,
  candidate_version integer,
  title_similarity numeric,
  detection_reason text,
  left_application_host text,
  right_application_host text,
  candidate_created_at timestamptz,
  candidate_reviewed_at timestamptz,
  resolution_reason text,
  canonical_job_id uuid,
  first_source_job_id uuid,
  first_job_id uuid,
  first_title text,
  first_description text,
  first_company_name text,
  first_status text,
  first_slug text,
  first_work_arrangement text,
  first_employment_type text,
  first_engagement_type text,
  first_experience_level text,
  first_salary_min numeric,
  first_salary_max numeric,
  first_currency_code text,
  first_pay_period text,
  first_application_url text,
  first_source_url text,
  first_posted_at timestamptz,
  first_valid_through timestamptz,
  first_last_seen_at timestamptz,
  first_last_verified_at timestamptz,
  first_locations text,
  first_eligibility_scope text,
  first_eligibility_evidence text,
  first_eligibility_provenance text,
  first_source_name text,
  first_source_adapter text,
  first_source_authority text,
  first_source_terms_url text,
  first_source_terms_reviewed_at timestamptz,
  second_source_job_id uuid,
  second_job_id uuid,
  second_title text,
  second_description text,
  second_company_name text,
  second_status text,
  second_slug text,
  second_work_arrangement text,
  second_employment_type text,
  second_engagement_type text,
  second_experience_level text,
  second_salary_min numeric,
  second_salary_max numeric,
  second_currency_code text,
  second_pay_period text,
  second_application_url text,
  second_source_url text,
  second_posted_at timestamptz,
  second_valid_through timestamptz,
  second_last_seen_at timestamptz,
  second_last_verified_at timestamptz,
  second_locations text,
  second_eligibility_scope text,
  second_eligibility_evidence text,
  second_eligibility_provenance text,
  second_source_name text,
  second_source_adapter text,
  second_source_authority text,
  second_source_terms_url text,
  second_source_terms_reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_candidate_id is null then
    raise exception using errcode = '22023', message = 'duplicate candidate id required';
  end if;
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;

  return query
  select
    candidate.id,
    candidate.status,
    candidate.version,
    candidate.title_similarity,
    left(candidate.evidence ->> 'reason', 500),
    left(candidate.evidence ->> 'left_application_host', 255),
    left(candidate.evidence ->> 'right_application_host', 255),
    candidate.created_at,
    candidate.reviewed_at,
    candidate.resolution_reason,
    candidate.canonical_job_id,
    left_source.id,
    left_root.id,
    left_root.title,
    left_root.description_text,
    left_company.display_name,
    left_root.status::text,
    left_root.slug,
    left_root.work_arrangement::text,
    left_root.employment_type::text,
    left_root.engagement_type::text,
    left_root.experience_level::text,
    left_root.salary_min,
    left_root.salary_max,
    left_root.currency_code,
    left_root.pay_period::text,
    left_root.application_url,
    left_root.source_url,
    left_root.posted_at,
    left_root.valid_through,
    left_root.last_seen_at,
    left_root.last_verified_at,
    left_location.summary,
    left_eligibility.scope::text,
    left_eligibility.evidence_text,
    left_eligibility.provenance::text,
    left_job_source.name,
    left_job_source.adapter_key,
    left_job_source.authority::text,
    left_job_source.terms_url,
    left_job_source.terms_reviewed_at,
    right_source.id,
    right_root.id,
    right_root.title,
    right_root.description_text,
    right_company.display_name,
    right_root.status::text,
    right_root.slug,
    right_root.work_arrangement::text,
    right_root.employment_type::text,
    right_root.engagement_type::text,
    right_root.experience_level::text,
    right_root.salary_min,
    right_root.salary_max,
    right_root.currency_code,
    right_root.pay_period::text,
    right_root.application_url,
    right_root.source_url,
    right_root.posted_at,
    right_root.valid_through,
    right_root.last_seen_at,
    right_root.last_verified_at,
    right_location.summary,
    right_eligibility.scope::text,
    right_eligibility.evidence_text,
    right_eligibility.provenance::text,
    right_job_source.name,
    right_job_source.adapter_key,
    right_job_source.authority::text,
    right_job_source.terms_url,
    right_job_source.terms_reviewed_at
  from audit.job_duplicate_candidates candidate
  join app.jobs left_source on left_source.id = candidate.left_job_id
  join app.jobs right_source on right_source.id = candidate.right_job_id
  join app.jobs left_root on left_root.id = coalesce(left_source.canonical_job_id, left_source.id)
  join app.jobs right_root on right_root.id = coalesce(right_source.canonical_job_id, right_source.id)
  join app.companies left_company on left_company.id = left_root.company_id
  join app.companies right_company on right_company.id = right_root.company_id
  join app.job_sources left_job_source on left_job_source.id = left_root.source_id
  join app.job_sources right_job_source on right_job_source.id = right_root.source_id
  left join app.job_eligibility left_eligibility on left_eligibility.job_id = left_root.id
  left join app.job_eligibility right_eligibility on right_eligibility.job_id = right_root.id
  left join lateral (
    select left(string_agg(
      concat_ws(', ', location.city, location.region, location.country_code),
      ' | ' order by location.is_primary desc, location.id
    ), 1000) as summary
    from app.job_locations location where location.job_id = left_root.id
  ) left_location on true
  left join lateral (
    select left(string_agg(
      concat_ws(', ', location.city, location.region, location.country_code),
      ' | ' order by location.is_primary desc, location.id
    ), 1000) as summary
    from app.job_locations location where location.job_id = right_root.id
  ) right_location on true
  where candidate.id = p_candidate_id;
end;
$$;

comment on function api.admin_get_duplicate_candidate(uuid) is
  'AAL2-only field comparison for one fuzzy duplicate candidate. Returns the '
  'current canonical roots, bounded detection evidence, source policy provenance, '
  'and the job fields needed for an explicit operator decision.';

revoke all on function api.admin_get_duplicate_candidate(uuid) from public, anon;
grant execute on function api.admin_get_duplicate_candidate(uuid) to authenticated;

commit;
