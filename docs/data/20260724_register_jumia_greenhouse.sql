-- Register the Jumia public Greenhouse board (documented_public_api basis).
-- Probe verified 2026-07-24 against
-- https://boards-api.greenhouse.io/v1/boards/jumia/jobs: 9 open roles, all
-- updated June–July 2026 (fresh board, not a zombie), locations Ghana,
-- Uganda, Morocco, Senegal and Portugal; destinations on
-- job-boards.eu.greenhouse.io/jumia. Jumia is the pan-African e-commerce
-- group (group.jumia.com) and regularly hires in Nigeria; the NG country
-- rights row follows the existing per-source precedent, and roles in
-- not-yet-activated market countries are held pending by the per-record
-- publishability gate until their country packs activate.
-- Applied to production directly per the docs/data convention (data-only
-- rows never enter the migration chain). Mirrors the Moniepoint recipe.

begin;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select 'jumia', 'Jumia', 'https://group.jumia.com', 'jumia.com',
  'E-commerce', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'jumia');

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
  'jumia_greenhouse', 'Jumia careers (Greenhouse board)',
  'employer_ats', 'draft', 'https://group.jumia.com/careers',
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on Jumia''s official Greenhouse job board; apply on Jumia''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-07-24',
  'documented_public_api',
  'https://job-boards.eu.greenhouse.io/jumia is served by the documented public board API https://boards-api.greenhouse.io/v1/boards/jumia/jobs (verified 2026-07-24, 9 fresh roles)',
  'Jumia via its public Greenhouse job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'jumia_greenhouse'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, 'greenhouse', 'jumia',
  array['job-boards.eu.greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io'],
  array['/jumia', '/jumia', '/jumia'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'jumia'
where s.adapter_key = 'jumia_greenhouse'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

commit;

-- Part 2: re-review (the config insert auto-revokes review), policy fields,
-- activation, NG country rights, dependency evidence.

begin;

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
where adapter_key = 'jumia_greenhouse';

update app.job_sources
set status = 'active'
where adapter_key = 'jumia_greenhouse'
  and status <> 'active';

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
where source.adapter_key = 'jumia_greenhouse'
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
      'ATS destination policy allows only job-boards[.eu].greenhouse.io/jumia postings for this tenant; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key = 'jumia_greenhouse'
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

select row.adapter_key, row.tenant_identifier
from security.authorized_ats_source_config_rows() row
order by row.adapter_key;
