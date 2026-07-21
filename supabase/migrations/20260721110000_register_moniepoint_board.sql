-- Register Moniepoint's public Greenhouse job board as an employer ATS
-- source under the documented_public_api basis. Board ownership was
-- verified from the employer's own domain: https://moniepoint.com/careers
-- loads its vacancies from
-- https://boards-api.greenhouse.io/v1/boards/moniepoint/jobs (checked
-- 2026-07-21). Bounded metadata only (no stored descriptions), attribution
-- required, and the only outbound destination is the employer's own
-- Greenhouse application page.

begin;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select
  'moniepoint', 'Moniepoint', 'https://moniepoint.com', 'moniepoint.com',
  'Financial services', 'domain_verified', 'published'
where not exists (
  select 1 from app.companies where slug = 'moniepoint'
);

update app.companies
set verification_status = 'domain_verified',
    record_status = 'published'
where slug = 'moniepoint'
  and verification_status = 'unverified';

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
  'moniepoint_greenhouse', 'Moniepoint careers (Greenhouse board)',
  'employer_ats', 'draft', 'https://moniepoint.com/careers',
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on Moniepoint''s official Greenhouse job board; apply on Moniepoint''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-07-21',
  'documented_public_api',
  'https://moniepoint.com/careers loads https://boards-api.greenhouse.io/v1/boards/moniepoint/jobs (verified 2026-07-21)',
  'Moniepoint via its public Greenhouse job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'moniepoint_greenhouse'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select
  s.id, c.id, 'greenhouse', 'moniepoint',
  array['job-boards.eu.greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io'],
  array['/moniepoint', '/moniepoint', '/moniepoint'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'moniepoint'
where s.adapter_key = 'moniepoint_greenhouse'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

update app.job_sources
set status = 'active'
where adapter_key = 'moniepoint_greenhouse'
  and status = 'draft';

commit;
