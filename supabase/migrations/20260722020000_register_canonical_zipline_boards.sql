-- Register two further public employer ATS boards under the
-- documented_public_api basis, following the reviewed Moniepoint recipe
-- (registration, configuration, post-configuration re-review, activation,
-- Nigeria country rights, and verified dependencies in one reviewed pass):
--
-- * Canonical (Greenhouse tenant `canonical`): https://canonical.com/careers
--   applies through https://job-boards.greenhouse.io/canonical; the public
--   board API serves boards-api.greenhouse.io/v1/boards/canonical/jobs
--   (verified 2026-07-22; 302 roles, 176 remote Worldwide/EMEA).
-- * Zipline (Greenhouse tenant `flyzipline`): https://www.zipline.com/careers
--   lists roles whose apply URLs live on the employer's own site under
--   www.zipline.com/open-roles, served from
--   boards-api.greenhouse.io/v1/boards/flyzipline/jobs (verified 2026-07-22;
--   Nigeria operations roles in Kaduna, Abuja, and Lagos).
--
-- Bounded metadata only (no stored descriptions), attribution required, and
-- the only outbound destinations are the employers' own application pages.

begin;

-- Companies -----------------------------------------------------------------

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select
  'canonical', 'Canonical', 'https://canonical.com', 'canonical.com',
  'Software', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'canonical');

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select
  'zipline', 'Zipline', 'https://www.zipline.com', 'zipline.com',
  'Logistics and healthcare delivery', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'zipline');

update app.companies
set verification_status = 'domain_verified', record_status = 'published'
where slug in ('canonical', 'zipline')
  and verification_status = 'unverified';

-- Sources -------------------------------------------------------------------

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
  'canonical_greenhouse', 'Canonical careers (Greenhouse board)',
  'employer_ats', 'draft', 'https://canonical.com/careers',
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on Canonical''s official Greenhouse job board; apply on Canonical''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-07-22',
  'documented_public_api',
  'https://canonical.com/careers applies through https://job-boards.greenhouse.io/canonical, served by https://boards-api.greenhouse.io/v1/boards/canonical/jobs (verified 2026-07-22)',
  'Canonical via its public Greenhouse job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'canonical_greenhouse'
);

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
  'zipline_greenhouse', 'Zipline careers (Greenhouse board)',
  'employer_ats', 'draft', 'https://www.zipline.com/careers',
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on Zipline''s official Greenhouse job board; apply on Zipline''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-07-22',
  'documented_public_api',
  'https://www.zipline.com/careers lists roles with apply URLs on www.zipline.com/open-roles, served by https://boards-api.greenhouse.io/v1/boards/flyzipline/jobs (verified 2026-07-22)',
  'Zipline via its public Greenhouse job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'zipline_greenhouse'
);

-- Configurations ------------------------------------------------------------

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select
  s.id, c.id, 'greenhouse', 'canonical',
  array['job-boards.greenhouse.io', 'boards.greenhouse.io'],
  array['/canonical', '/canonical'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'canonical'
where s.adapter_key = 'canonical_greenhouse'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select
  s.id, c.id, 'greenhouse', 'flyzipline',
  array['www.zipline.com', 'job-boards.greenhouse.io', 'boards.greenhouse.io'],
  array['/open-roles', '/flyzipline', '/flyzipline'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'zipline'
where s.adapter_key = 'zipline_greenhouse'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

-- Post-configuration re-review, supply policy, and activation ---------------
-- (registering a configuration always revokes the prior authorization
-- review, so the review is recorded again after the configuration exists)

update app.job_sources
set authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revocation_reason = null,
    terms_reviewed_at = clock_timestamp(),
    policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'id', 'title', 'absolute_url', 'url', 'application_url',
      'location', 'departments', 'offices', 'eligibility',
      'employment_type', 'engagement_type', 'publication_date', 'updated_at'
    ],
    policy_review_due_at = clock_timestamp() + interval '6 months',
    raw_retention = interval '1 day',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    required_dependencies = array[
      'employer_application_destination', 'clickable_source_attribution'
    ]::text[],
    missing_dependencies = '{}'::text[]
where adapter_key in ('canonical_greenhouse', 'zipline_greenhouse');

update app.job_sources
set status = 'active'
where adapter_key in ('canonical_greenhouse', 'zipline_greenhouse')
  and status <> 'active';

-- Nigeria country rights and verified dependencies --------------------------

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
where source.adapter_key in ('canonical_greenhouse', 'zipline_greenhouse')
  and not exists (
    select 1 from app.source_country_rights rights
    where rights.source_id = source.id and rights.country_code = 'NG'
  );

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select s.id, dep.key, 'verified',
  case dep.key
    when 'employer_application_destination' then
      'ATS destination policy allows only the employer''s own application hosts (' ||
      case s.adapter_key
        when 'canonical_greenhouse' then 'job-boards.greenhouse.io/canonical'
        else 'www.zipline.com/open-roles'
      end || '); required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job Truth Card renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key in ('canonical_greenhouse', 'zipline_greenhouse')
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;
