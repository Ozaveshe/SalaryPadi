-- Register Yassir's employer-owned Lever board, verified 2026-08-12.
--
-- Yassir's official careers surface at https://yassir.com/en/career serves
-- current role pages, and those role identifiers match its Lever-hosted board.
-- Lever's documented public Postings API currently serves 151 Yassir roles;
-- 13 explicitly include Lagos, Nigeria among their declared locations.
--
-- Basis: documented_public_api. Lever documents this API for published public
-- postings and custom job sites. Rights are limited to the active NG country
-- pack; non-Nigeria roles remain filtered by the normal eligibility gate.
--
-- Data-only registration. Apply directly to production only after the Lever
-- allLocations preservation release is live. Reversible by pausing
-- yassir_lever without deleting evidence, configuration, or receipts.

begin;

do $guard$
begin
  if exists (
    select 1 from app.companies
    where slug = 'yassir'
      and website_domain is distinct from 'yassir.com'
  ) then
    raise exception 'company slug collision: yassir does not map to yassir.com';
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select 'yassir', 'Yassir', 'https://yassir.com', 'yassir.com',
  'Technology', 'domain_verified',
  'official employer careers pages and matching Lever tenant reviewed 2026-08-12',
  'published'
where not exists (select 1 from app.companies where slug = 'yassir');

insert into app.job_sources (
  adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, may_email_jobs,
  allow_public_listing, required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version,
  authorization_basis, authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at
)
select
  'yassir_lever', 'Yassir careers (Lever board)',
  'employer_ats', 'draft', 'https://yassir.com/en/career',
  'https://github.com/lever/postings-api',
  true,
  'Published on Yassir''s official careers site and Lever board; apply on the employer''s own application page.',
  true, true, true, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'lever-public-postings-api-reviewed-2026-08-12',
  'documented_public_api',
  'https://yassir.com/en/career and matching official role pages corroborate https://jobs.lever.co/Yassir; https://api.lever.co/v0/postings/Yassir?mode=json served 151 public roles, including 13 that explicitly list Lagos, Nigeria (verified 2026-08-12)',
  'Yassir via its official careers site and public Lever board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'yassir_lever'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, provider_region, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select source.id, company.id, 'lever', 'global', 'Yassir',
  array['jobs.lever.co'], array['/Yassir'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources source
join app.companies company on company.slug = 'yassir'
where source.adapter_key = 'yassir_lever'
  and not exists (
    select 1 from private.ats_source_configs config
    where config.source_id = source.id
  );

commit;

-- Configuration insertion deliberately revokes source review. Re-review the
-- exact destination boundary, then activate the source and NG rights together.
begin;

update app.job_sources
set authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    terms_reviewed_at = clock_timestamp(),
    policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'id', 'text', 'categories', 'country', 'createdAt',
      'description', 'descriptionPlain', 'hostedUrl', 'applyUrl',
      'workplaceType', 'external_id', 'title', 'source_url',
      'application_url', 'location', 'work_arrangement',
      'employment_type', 'engagement_type', 'posted_at', 'locations',
      'eligibility'
    ],
    policy_review_due_at = clock_timestamp() + interval '6 months',
    raw_retention = interval '30 days',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    required_dependencies = array[
      'employer_application_destination', 'clickable_source_attribution'
    ]::text[],
    missing_dependencies = '{}'::text[],
    status = 'active'
where adapter_key = 'yassir_lever';

insert into app.source_country_rights (
  source_id, country_code, policy_state, permission_basis,
  evidence_reference, terms_url, reviewed_at, review_due_at, allowed_fields,
  may_store_full_description, attribution_required, attribution_text,
  minimum_poll_interval, retention_period, allow_public_display,
  allow_search_index, allow_google_jobposting, missing_dependencies
)
select source.id, 'NG', 'enabled'::app.source_policy_state,
  source.authorization_basis, source.authorization_evidence_ref,
  source.terms_url, source.authorization_reviewed_at,
  source.policy_review_due_at, source.allowed_fields,
  source.may_store_full_description, source.attribution_required,
  source.attribution_text, source.minimum_poll_interval,
  source.raw_retention, source.allow_public_listing,
  source.may_index_jobs, source.may_emit_jobposting_schema,
  '{}'::text[]
from app.job_sources source
where source.adapter_key = 'yassir_lever'
  and not exists (
    select 1 from app.source_country_rights rights
    where rights.source_id = source.id and rights.country_code = 'NG'
  );

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select source.id, dependency.key, 'verified',
  case dependency.key
    when 'employer_application_destination' then
      'Destination allowlist is pinned to jobs.lever.co/Yassir and official Yassir role pages use matching Lever posting identifiers; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original employer application link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources source
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dependency(key)
where source.adapter_key = 'yassir_lever'
  and not exists (
    select 1 from private.job_source_dependencies existing
    where existing.source_id = source.id
      and existing.dependency_key = dependency.key
  );

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key = 'yassir_lever';
