-- Register SNV's official SmartRecruiters board, verified 2026-08-12.
--
-- APPLIED TO PRODUCTION 2026-08-12 via the supabase_salarypadi MCP server.
--
-- Discovery: the employer-first board probe now includes the SmartRecruiters
-- provider already supported by the worker. The documented Posting API served
-- 8 active SNV roles: 5 in Africa and one in Kano, Nigeria. The Nigeria role,
-- Community Development Advisor (ILM), is mirrored on SNV's own careers site
-- under the same posting id and links back to the SmartRecruiters application.
--
-- Authorization: SmartRecruiters documents this unauthenticated Posting API as
-- public job data intended for custom career sites. We retain only the list
-- fields and link out. The list endpoint carries no description, so neither
-- source rights nor search/schema rights claim one. Full copy remains on SNV's
-- official page. Only NG country rights activate here; the other African rows
-- stay held until their country packs pass their independent launch gates.
--
-- Data-only registration. Reversible by pausing snv_smartrecruiters; no record
-- or evidence needs to be deleted.

begin;

do $guard$
begin
  if exists (
    select 1 from app.companies
    where slug = 'snv'
      and website_domain is distinct from 'snv.org'
  ) then
    raise exception 'company slug collision: snv does not map to snv.org';
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select 'snv', 'SNV', 'https://www.snv.org', 'snv.org',
  'International development', 'domain_verified',
  'official SNV careers page and matching SmartRecruiters tenant reviewed 2026-08-12',
  'published'
where not exists (select 1 from app.companies where slug = 'snv');

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
  'snv_smartrecruiters', 'SNV careers (SmartRecruiters board)',
  'employer_ats', 'draft', 'https://www.snv.org/careers/',
  'https://developers.smartrecruiters.com/docs/posting-api',
  true,
  'Published on SNV''s official careers site and SmartRecruiters board; apply on the original SNV listing.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'smartrecruiters-posting-api-reviewed-2026-08-12',
  'documented_public_api',
  'https://api.smartrecruiters.com/v1/companies/SNV/postings?limit=100 served 8 active roles, 5 in Africa and 1 in Nigeria; https://www.snv.org/careers/community-development-advisor-ilm-744000140302115 mirrors posting 744000140302115 and links to jobs.smartrecruiters.com (verified 2026-08-12)',
  'SNV via its official careers site and public SmartRecruiters board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'snv_smartrecruiters'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select source.id, company.id, 'smartrecruiters', 'SNV',
  array['jobs.smartrecruiters.com'], array['/SNV'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources source
join app.companies company on company.slug = 'snv'
where source.adapter_key = 'snv_smartrecruiters'
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
      'id', 'name', 'releasedDate', 'company', 'location',
      'department', 'function', 'typeOfEmployment', 'experienceLevel',
      -- The raw-record policy guard checks the normalized storage contract as
      -- well as the provider spelling. Keep these names paired so a provider
      -- field cannot silently authorize unrelated stored data.
      'external_id', 'title', 'source_url', 'application_url',
      'work_arrangement', 'employment_type', 'engagement_type',
      'experience_level', 'posted_at', 'locations', 'eligibility'
    ],
    policy_review_due_at = clock_timestamp() + interval '6 months',
    raw_retention = interval '1 day',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    required_dependencies = array[
      'employer_application_destination', 'clickable_source_attribution'
    ]::text[],
    missing_dependencies = '{}'::text[],
    status = 'active'
where adapter_key = 'snv_smartrecruiters';

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
  false, source.attribution_required, source.attribution_text,
  source.minimum_poll_interval, source.raw_retention,
  source.allow_public_listing, false, false, '{}'::text[]
from app.job_sources source
where source.adapter_key = 'snv_smartrecruiters'
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
      'Destination is derived from the posting company identifier and id, then pinned to jobs.smartrecruiters.com/SNV; the matching official SNV careers page links to the same destination'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources source
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dependency(key)
where source.adapter_key = 'snv_smartrecruiters'
  and not exists (
    select 1 from private.job_source_dependencies existing
    where existing.source_id = source.id
      and existing.dependency_key = dependency.key
  );

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key = 'snv_smartrecruiters';

-- Production follow-up, applied 2026-08-12 after the first scheduled run
-- proved the database guard rejected `title`: align the reviewed provider
-- fields with the normalized fields the ATS worker is allowed to persist.
-- This remains data-only and deliberately repeats authorization review after
-- the policy-changing update invalidates the prior review.
begin;

update app.job_sources
set allowed_fields = array[
      'id', 'name', 'releasedDate', 'company', 'location',
      'department', 'function', 'typeOfEmployment', 'experienceLevel',
      'external_id', 'title', 'source_url', 'application_url',
      'work_arrangement', 'employment_type', 'engagement_type',
      'experience_level', 'posted_at', 'locations', 'eligibility'
    ],
    terms_reviewed_at = clock_timestamp()
where adapter_key = 'snv_smartrecruiters';

update app.source_country_rights rights
set allowed_fields = source.allowed_fields,
    reviewed_at = clock_timestamp(),
    review_due_at = source.policy_review_due_at
from app.job_sources source
where source.id = rights.source_id
  and source.adapter_key = 'snv_smartrecruiters'
  and rights.country_code = 'NG';

update app.job_sources
set authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    policy_state = 'enabled',
    status = 'active'
where adapter_key = 'snv_smartrecruiters';

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key = 'snv_smartrecruiters';
