-- Replace the capped, latest-only job queue with an operator search contract
-- and a protected evidence-rich detail contract. Data-quality staff may read;
-- existing admin-only transition functions retain all mutation authority.

begin;

create or replace function api.admin_search_jobs(
  p_query text default '',
  p_status text default null,
  p_limit integer default 50
)
returns table(
  id uuid,
  title text,
  company_name text,
  source_name text,
  source_adapter text,
  external_source_id text,
  slug text,
  status text,
  updated_at timestamptz,
  version integer,
  open_report_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;
  if char_length(v_query) = 1 or char_length(v_query) > 200
     or p_limit is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in (
       'draft', 'pending', 'published', 'expired', 'removed', 'rejected'
     )) then
    raise exception using errcode = '22023', message = 'invalid job search';
  end if;

  return query
  select
    job.id,
    left(job.title, 300),
    left(company.display_name, 200),
    left(source.name, 200),
    source.adapter_key,
    left(job.external_source_id, 500),
    job.slug,
    job.status::text,
    job.updated_at,
    job.admin_version,
    coalesce(report_summary.open_count, 0)::bigint
  from app.jobs job
  join app.companies company on company.id = job.company_id
  join app.job_sources source on source.id = job.source_id
  left join lateral (
    select count(*) filter (where report.status in ('pending', 'in_review')) as open_count
    from private.reports report
    where report.target_kind = 'job'
      and report.target_id in (job.id::text, job.slug)
  ) report_summary on true
  where (p_status is null or job.status::text = p_status)
    and (
      v_query = ''
      or job.id::text = v_query
      or lower(job.slug) = lower(v_query)
      or lower(job.external_source_id) = lower(v_query)
      or job.title ilike '%' || v_query || '%'
      or company.display_name ilike '%' || v_query || '%'
      or coalesce(company.website_domain::text, '') ilike '%' || v_query || '%'
      or source.name ilike '%' || v_query || '%'
      or source.adapter_key ilike '%' || v_query || '%'
    )
  order by
    case when v_query <> '' and (
      job.id::text = v_query or lower(job.slug) = lower(v_query)
      or lower(job.external_source_id) = lower(v_query)
    ) then 0 else 1 end,
    report_summary.open_count desc,
    job.updated_at desc,
    job.id
  limit p_limit;
end;
$$;

comment on function api.admin_search_jobs(text,text,integer) is
  'AAL2 data-quality/admin job search by UUID, slug, external ID, title, '
  'company, domain, source, or adapter. Returns at most 100 safe queue rows.';

create or replace function api.admin_get_job_detail(p_job_id uuid)
returns table(
  job_data jsonb,
  company_data jsonb,
  source_data jsonb,
  locations_data jsonb,
  eligibility_data jsonb,
  publication_blockers jsonb,
  open_report_count bigint,
  report_count bigint,
  duplicate_candidate_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_job_id is null then
    raise exception using errcode = '22023', message = 'job id required';
  end if;
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;

  return query
  select
    jsonb_build_object(
      'id', job.id,
      'version', job.admin_version,
      'canonical_job_id', job.canonical_job_id,
      'external_source_id', job.external_source_id,
      'slug', job.slug,
      'status', job.status::text,
      'title', job.title,
      'description', job.description_text,
      'requirements', job.requirements_text,
      'benefits', job.benefits_text,
      'work_arrangement', job.work_arrangement::text,
      'employment_type', job.employment_type::text,
      'engagement_type', job.engagement_type::text,
      'experience_level', job.experience_level::text,
      'salary_min', job.salary_min,
      'salary_max', job.salary_max,
      'currency_code', job.currency_code,
      'pay_period', job.pay_period::text,
      'gross_net', job.gross_net::text,
      'bonus_text', job.bonus_text,
      'application_url', job.application_url,
      'source_url', job.source_url,
      'original_employer_url', job.original_employer_url,
      'posted_at', job.posted_at,
      'valid_through', job.valid_through,
      'last_seen_at', job.last_seen_at,
      'last_checked_at', job.last_checked_at,
      'last_verified_at', job.last_verified_at,
      'content_sanitized_at', job.content_sanitized_at,
      'dedup_fingerprint', job.dedup_fingerprint,
      'is_fixture', job.is_fixture,
      'created_at', job.created_at,
      'updated_at', job.updated_at,
      'lifecycle_state', job.lifecycle_state::text,
      'lifecycle_reason', job.lifecycle_reason,
      'manual_reconfirmed_at', job.manual_reconfirmed_at,
      'apply_link_state', job.apply_link_state::text,
      'apply_link_checked_at', job.apply_link_checked_at,
      'public_ready_until', job.public_ready_until,
      'application_destination_kind', job.application_destination_kind
    ),
    jsonb_build_object(
      'id', company.id,
      'slug', company.slug,
      'display_name', company.display_name,
      'website_url', company.website_url,
      'website_domain', company.website_domain::text,
      'verification_status', company.verification_status::text,
      'record_status', company.record_status::text
    ),
    jsonb_build_object(
      'id', source.id,
      'name', source.name,
      'adapter_key', source.adapter_key,
      'source_type', source.source_type::text,
      'status', source.status::text,
      'authority', source.authority::text,
      'policy_state', source.policy_state::text,
      'terms_url', source.terms_url,
      'terms_reviewed_at', source.terms_reviewed_at,
      'terms_version', source.terms_version,
      'allow_public_listing', source.allow_public_listing,
      'may_index_jobs', source.may_index_jobs,
      'may_emit_jobposting_schema', source.may_emit_jobposting_schema,
      'may_email_jobs', source.may_email_jobs,
      'authorization_basis', source.authorization_basis,
      'authorization_evidence_ref', source.authorization_evidence_ref,
      'authorization_reviewed_at', source.authorization_reviewed_at,
      'authorization_expires_at', source.authorization_expires_at,
      'authorization_revoked_at', source.authorization_revoked_at
    ),
    coalesce(location_summary.items, '[]'::jsonb),
    case when eligibility.job_id is null then null else jsonb_build_object(
      'scope', eligibility.scope::text,
      'required_timezone_overlap', eligibility.required_timezone_overlap,
      'work_authorization_requirement', eligibility.work_authorization_requirement,
      'visa_sponsorship', eligibility.visa_sponsorship,
      'relocation_support', eligibility.relocation_support,
      'evidence_text', eligibility.evidence_text,
      'provenance', eligibility.provenance::text,
      'confidence', eligibility.confidence,
      'last_verified_at', eligibility.last_verified_at,
      'region_wording', eligibility.region_wording,
      'physical_location_requirement', eligibility.physical_location_requirement,
      'arrangement_evidence', eligibility.arrangement_evidence
    ) end,
    to_jsonb(array_remove(array[
      case when job.is_fixture then 'fixture_record' end,
      case when source.status <> 'active' then 'source_not_active' end,
      case when source.policy_state <> 'enabled' then 'source_policy_not_enabled' end,
      case when not source.allow_public_listing then 'public_listing_not_allowed' end,
      case when source.terms_reviewed_at is null then 'source_terms_not_reviewed' end,
      case when job.content_sanitized_at is null then 'content_not_sanitized' end,
      case when job.valid_through is not null and job.valid_through <= clock_timestamp()
        then 'job_expired' end,
      case when job.apply_link_state = 'broken' then 'application_link_broken' end
    ], null)),
    coalesce(report_summary.open_count, 0)::bigint,
    coalesce(report_summary.total_count, 0)::bigint,
    coalesce(duplicate_summary.total_count, 0)::bigint
  from app.jobs job
  join app.companies company on company.id = job.company_id
  join app.job_sources source on source.id = job.source_id
  left join app.job_eligibility eligibility on eligibility.job_id = job.id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'country_code', location.country_code,
      'city', location.city,
      'region', location.region,
      'is_primary', location.is_primary,
      'source_location_text', location.source_location_text
    ) order by location.is_primary desc, location.id) as items
    from app.job_locations location where location.job_id = job.id
  ) location_summary on true
  left join lateral (
    select
      count(*) filter (where report.status in ('pending', 'in_review')) as open_count,
      count(*) as total_count
    from private.reports report
    where report.target_kind = 'job'
      and report.target_id in (job.id::text, job.slug)
  ) report_summary on true
  left join lateral (
    select count(*) as total_count
    from audit.job_duplicate_candidates candidate
    where candidate.left_job_id = job.id or candidate.right_job_id = job.id
  ) duplicate_summary on true
  where job.id = p_job_id;
end;
$$;

comment on function api.admin_get_job_detail(uuid) is
  'AAL2 data-quality/admin evidence DTO for one job. Explicitly exposes job, '
  'company, source-policy, location, eligibility, blocker, report-count and '
  'duplicate-count fields without reporter identity or report narrative.';

revoke all on function api.admin_search_jobs(text,text,integer) from public, anon;
grant execute on function api.admin_search_jobs(text,text,integer) to authenticated;
revoke all on function api.admin_get_job_detail(uuid) from public, anon;
grant execute on function api.admin_get_job_detail(uuid) to authenticated;

commit;
