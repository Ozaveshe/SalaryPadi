-- APPLIED TO PRODUCTION 2026-08-12 via the supabase_salarypadi MCP server.
-- Register PawaPay's employer-owned Greenhouse board, verified 2026-08-12.
--
-- PawaPay (pawapay): 2 open roles; newest 2026-07-13. The current board
-- includes a Cybersecurity Officer - West Africa role located in Africa.
-- PawaPay's official careers page links candidates to its open positions and
-- describes the employer as a pan-African payments company.
--
-- Basis: documented_public_api. Greenhouse documents the public Job Board API,
-- and the tenant is corroborated by the employer's own careers surface.
-- Rights are limited to the active NG country pack. This script does not
-- weaken or bypass any publication, destination, freshness or country gate.
--
-- Data-only rows: run directly against production, never in the migration chain.
-- Reversible: pause the adapter_key to stop future claims without deleting its
-- evidence, configuration, receipts or country-rights record.

begin;

do $guard$
declare
  existing_domain text;
begin
  select website_domain into existing_domain
  from app.companies
  where slug = 'pawapay';

  if found and existing_domain is distinct from 'pawapay.io' then
    raise exception 'company slug collision: pawapay already maps to domain %',
      existing_domain;
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select
  'pawapay', 'PawaPay', 'https://www.pawapay.io', 'pawapay.io',
  'Financial services', 'domain_verified',
  'official employer careers surface and ATS tenant reviewed 2026-08-12',
  'published'
where not exists (
  select 1 from app.companies where slug = 'pawapay'
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
  'pawapay_greenhouse', 'PawaPay careers (Greenhouse board)',
  'employer_ats', 'draft', 'https://www.pawapay.io/careers',
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on PawaPay''s official Greenhouse job board; apply on the employer''s own application page.',
  true, true, true, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-08-12',
  'documented_public_api',
  'https://www.pawapay.io/careers identifies PawaPay''s careers surface; https://boards-api.greenhouse.io/v1/boards/pawapay/jobs served 2 open roles, newest 2026-07-13 (verified 2026-08-12)',
  'PawaPay via its public Greenhouse job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'pawapay_greenhouse'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select source.id, company.id, 'greenhouse', 'pawapay',
  array['job-boards.eu.greenhouse.io', 'job-boards.greenhouse.io',
        'boards.greenhouse.io'],
  array['/pawapay', '/pawapay', '/pawapay'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources source
join app.companies company on company.slug = 'pawapay'
where source.adapter_key = 'pawapay_greenhouse'
  and not exists (
    select 1 from private.ats_source_configs config
    where config.source_id = source.id
  );

commit;

-- Configuration inserts deliberately revoke review. Re-review the exact
-- trusted configuration, then activate and grant only NG country rights.
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
      'id', 'title', 'absolute_url', 'url', 'application_url',
      'location', 'departments', 'offices', 'eligibility',
      'employment_type', 'engagement_type', 'publication_date', 'updated_at',
      'description'
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
where adapter_key = 'pawapay_greenhouse';

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
where source.adapter_key = 'pawapay_greenhouse'
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
      'Destination allowlist is pinned to the employer tenant and Greenhouse hosts observed on the public board 2026-08-12; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original application link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources source
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dependency(key)
where source.adapter_key = 'pawapay_greenhouse'
  and not exists (
    select 1 from private.job_source_dependencies existing
    where existing.source_id = source.id
      and existing.dependency_key = dependency.key
  );

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key = 'pawapay_greenhouse';
