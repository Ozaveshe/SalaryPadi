-- APPLIED TO PRODUCTION 2026-08-12 via the supabase_salarypadi MCP server.
-- Register Andela and Numo employer-owned Ashby boards, verified 2026-08-12.
--
-- Andela (andela): 19 open roles; newest 2026-08-06. One current role is
-- explicitly located in Kenya with South Africa as a secondary location.
-- Andela's official careers page links directly to jobs.ashbyhq.com/andela.
--
-- Numo (numo): 3 open roles; newest 2026-07-13. All three are located in
-- Lagos. numofx.com's Careers link redirects directly to
-- jobs.ashbyhq.com/numo.
--
-- Basis: documented_public_api. Ashby documents the public Job Posting API,
-- and each tenant is corroborated by the employer's own web property.
-- Rights remain limited to the active NG country pack. This script does not
-- weaken or bypass publication, destination, freshness, or country gates.
--
-- Data-only rows: apply directly to production, never in the migration chain.
-- Reversible: pause either adapter_key to stop future claims without deleting
-- its evidence, configuration, receipts, or country-rights record.

begin;

do $guard$
declare
  existing_domain text;
begin
  select website_domain into existing_domain from app.companies
  where slug = 'andela';
  if found and existing_domain is distinct from 'andela.com' then
    raise exception 'company slug collision: andela maps to %', existing_domain;
  end if;

  select website_domain into existing_domain from app.companies
  where slug = 'numo-fx';
  if found and existing_domain is distinct from 'numofx.com' then
    raise exception 'company slug collision: numo-fx maps to %', existing_domain;
  end if;
end;
$guard$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select v.slug, v.display_name, v.website_url, v.website_domain, v.industry,
  'domain_verified', v.verification_scope, 'published'
from (values
  (
    'andela', 'Andela', 'https://www.andela.com', 'andela.com',
    'Technology services',
    'official employer careers page and ATS tenant reviewed 2026-08-12'
  ),
  (
    'numo-fx', 'Numo', 'https://numofx.com', 'numofx.com',
    'Financial services',
    'official employer website careers redirect and ATS tenant reviewed 2026-08-12'
  )
) as v(slug, display_name, website_url, website_domain, industry,
       verification_scope)
where not exists (select 1 from app.companies c where c.slug = v.slug);

insert into app.job_sources (
  adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, may_email_jobs,
  allow_public_listing, required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version,
  authorization_basis, authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at
)
select v.adapter_key, v.name, 'employer_ats', 'draft', v.homepage_url,
  'https://developers.ashbyhq.com/docs/public-job-posting-api',
  true, v.attribution_text,
  true, true, true, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'ashby-public-job-board-api-reviewed-2026-08-12',
  'documented_public_api', v.evidence_ref, v.grantor, clock_timestamp()
from (values
  (
    'andela_ashby', 'Andela careers (Ashby board)',
    'https://www.andela.com/careers',
    'Published on Andela''s official Ashby job board; apply on the employer''s own application page.',
    'https://www.andela.com/careers links to https://jobs.ashbyhq.com/andela; the public API served 19 open roles, newest 2026-08-06, including one Kenya/South Africa role (verified 2026-08-12)',
    'Andela via its public Ashby job board'
  ),
  (
    'numo_ashby', 'Numo careers (Ashby board)',
    'https://careers.numofx.com',
    'Published on Numo''s official Ashby job board; apply on the employer''s own application page.',
    'https://numofx.com links Careers to https://careers.numofx.com, which redirects to https://jobs.ashbyhq.com/numo; the public API served 3 open Lagos roles, newest 2026-07-13 (verified 2026-08-12)',
    'Numo via its public Ashby job board'
  )
) as v(adapter_key, name, homepage_url, attribution_text, evidence_ref, grantor)
where not exists (
  select 1 from app.job_sources s where s.adapter_key = v.adapter_key
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select source.id, company.id, 'ashby', v.tenant,
  array['jobs.ashbyhq.com'], array[v.path_prefix],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from (values
  ('andela_ashby', 'andela', 'andela', '/andela'),
  ('numo_ashby', 'numo-fx', 'numo', '/numo')
) as v(adapter_key, company_slug, tenant, path_prefix)
join app.job_sources source on source.adapter_key = v.adapter_key
join app.companies company on company.slug = v.company_slug
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
where adapter_key in ('andela_ashby', 'numo_ashby');

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
where source.adapter_key in ('andela_ashby', 'numo_ashby')
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
      'Destination allowlist is pinned to the employer tenant and Ashby host observed on the public board 2026-08-12; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original application link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources source
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dependency(key)
where source.adapter_key in ('andela_ashby', 'numo_ashby')
  and not exists (
    select 1 from private.job_source_dependencies existing
    where existing.source_id = source.id
      and existing.dependency_key = dependency.key
  );

commit;

select row.adapter_key, row.tenant_identifier, row.publication_mode
from security.authorized_ats_source_config_rows() row
where row.adapter_key in ('andela_ashby', 'numo_ashby')
order by row.adapter_key;
