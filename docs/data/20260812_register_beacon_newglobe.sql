-- APPLIED TO PRODUCTION 2026-08-12 via the supabase_salarypadi MCP server.
-- Register two employer-owned Greenhouse boards verified 2026-08-12.
--
-- Beacon Power Services (beaconpowerservices): 3 roles; newest 2026-07-16;
-- locations are Lagos, Nigeria and Africa. Its official careers page describes
-- the employer's Africa energy mission and exposes its current openings.
-- NewGlobe (newglobesandbox): 4 roles; newest 2026-08-12; every current role
-- is in Lagos, Jigawa or Katsina, Nigeria. Its official careers page lists the
-- same current roles and describes its public-education work.
--
-- Basis: documented_public_api. Greenhouse documents the public Job Board API,
-- and both tenants are corroborated by the employers' own careers surfaces.
-- Rights are limited to the active NG country pack; this script does not
-- weaken or bypass any other country gate.
--
-- Data-only rows: run directly against production, never in the migration chain.
-- Reversible: pause an adapter_key to stop future claims without deleting its
-- evidence, configuration, receipts or country-rights record.

begin;

create temporary table greenhouse_registration (
  company_slug text not null,
  adapter_key text not null,
  display_name text not null,
  website_url text not null,
  website_domain text not null,
  industry text not null,
  careers_url text not null,
  tenant_identifier text not null,
  open_roles integer not null,
  newest_role_at timestamptz not null,
  destination_hosts text[] not null,
  destination_paths text[] not null
) on commit drop;

insert into greenhouse_registration values
  (
    'beacon-power-services', 'beacon_power_services_greenhouse',
    'Beacon Power Services', 'https://www.beaconpowerservices.com',
    'beaconpowerservices.com', 'Energy technology',
    'https://www.beaconpowerservices.com/en/about/careers',
    'beaconpowerservices', 3, '2026-07-16T18:38:17Z',
    array['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
          'boards.greenhouse.io'],
    array['/beaconpowerservices', '/beaconpowerservices',
          '/beaconpowerservices']
  ),
  (
    'newglobe', 'newglobe_greenhouse', 'NewGlobe',
    'https://newglobe.education', 'newglobe.education', 'Education',
    'https://newglobe.education/abou/careers/',
    'newglobesandbox', 4, '2026-08-12T16:07:42Z',
    array['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
          'boards.greenhouse.io'],
    array['/newglobesandbox', '/newglobesandbox', '/newglobesandbox']
  );

do $guard$
declare
  collision record;
begin
  select existing.slug, existing.website_domain into collision
  from app.companies existing
  join greenhouse_registration incoming
    on incoming.company_slug = existing.slug
  where existing.website_domain is not null
    and existing.website_domain <> incoming.website_domain
  limit 1;
  if found then
    raise exception 'company slug collision: % already maps to domain %',
      collision.slug, collision.website_domain;
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select company_slug, display_name, website_url, website_domain, industry,
  'domain_verified',
  'official employer careers surface and ATS tenant reviewed 2026-08-12',
  'published'
from greenhouse_registration incoming
where not exists (
  select 1 from app.companies existing
  where existing.slug = incoming.company_slug
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
select incoming.adapter_key,
  incoming.display_name || ' careers (Greenhouse board)',
  'employer_ats', 'draft', incoming.careers_url,
  'https://developers.greenhouse.io/job-board.html',
  true,
  'Published on ' || incoming.display_name ||
    '''s official Greenhouse job board; apply on the employer''s own application page.',
  true, true, true, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'greenhouse-public-board-api-reviewed-2026-08-12',
  'documented_public_api',
  incoming.careers_url || ' identifies ' || incoming.display_name ||
    '''s careers surface; https://boards-api.greenhouse.io/v1/boards/' ||
    incoming.tenant_identifier || '/jobs served ' || incoming.open_roles ||
    ' open roles, newest ' || incoming.newest_role_at::date ||
    ' (verified 2026-08-12)',
  incoming.display_name || ' via its public Greenhouse job board',
  clock_timestamp()
from greenhouse_registration incoming
where not exists (
  select 1 from app.job_sources existing
  where existing.adapter_key = incoming.adapter_key
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select source.id, company.id, 'greenhouse', incoming.tenant_identifier,
  incoming.destination_hosts, incoming.destination_paths,
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from greenhouse_registration incoming
join app.job_sources source on source.adapter_key = incoming.adapter_key
join app.companies company on company.slug = incoming.company_slug
where not exists (
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
where adapter_key in (
  'beacon_power_services_greenhouse', 'newglobe_greenhouse'
);

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
where source.adapter_key in (
  'beacon_power_services_greenhouse', 'newglobe_greenhouse'
)
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
      'Destination allowlist is pinned to the employer tenant and hosts observed on the public Greenhouse board 2026-08-12; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original application link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources source
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dependency(key)
where source.adapter_key in (
  'beacon_power_services_greenhouse', 'newglobe_greenhouse'
)
and not exists (
  select 1 from private.job_source_dependencies existing
  where existing.source_id = source.id
    and existing.dependency_key = dependency.key
);

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key in (
  'beacon_power_services_greenhouse', 'newglobe_greenhouse'
)
order by row.adapter_key;
