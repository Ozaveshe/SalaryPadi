-- Register the Kuda and FairMoney public Workable boards (documented_public_api
-- basis) in DRAFT. The deployed worker cannot parse provider 'workable' until
-- the Workable adapter ships, so both sources stay draft — never listed, never
-- claimed — until the deploy freeze lifts. Verified 2026-07-22:
--   https://apply.workable.com/api/v1/widget/accounts/kuda       (13 roles, all Nigeria)
--   https://apply.workable.com/api/v1/widget/accounts/fairmoney  (13 roles, 11 Nigeria)
-- Part 1 (run now / already applied): companies, draft sources, configs.
-- Part 2 (run AFTER the Workable adapter deploys): re-review, policy fields,
-- activation, NG country rights, dependency evidence — mirrors the Moniepoint
-- recipe exactly.

-- ============================== PART 1 =====================================
begin;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select 'kuda', 'Kuda', 'https://www.kuda.com', 'kuda.com',
  'Financial services', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'kuda');

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select 'fairmoney', 'FairMoney', 'https://fairmoney.io', 'fairmoney.io',
  'Financial services', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'fairmoney');

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
  'kuda_workable', 'Kuda careers (Workable board)',
  'employer_ats', 'draft', 'https://www.kuda.com/careers',
  'https://help.workable.com/hc/en-us/articles/115012750446',
  true,
  'Published on Kuda''s official Workable job board; apply on Kuda''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'workable-public-widget-api-reviewed-2026-07-22',
  'documented_public_api',
  'https://apply.workable.com/kuda is served by the public widget API https://apply.workable.com/api/v1/widget/accounts/kuda (verified 2026-07-22)',
  'Kuda via its public Workable job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'kuda_workable'
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
  'fairmoney_workable', 'FairMoney careers (Workable board)',
  'employer_ats', 'draft', 'https://fairmoney.io/careers',
  'https://help.workable.com/hc/en-us/articles/115012750446',
  true,
  'Published on FairMoney''s official Workable job board; apply on FairMoney''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'workable-public-widget-api-reviewed-2026-07-22',
  'documented_public_api',
  'https://apply.workable.com/fairmoney is served by the public widget API https://apply.workable.com/api/v1/widget/accounts/fairmoney (verified 2026-07-22)',
  'FairMoney via its public Workable job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'fairmoney_workable'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, 'workable', 'kuda',
  array['apply.workable.com'], array['/j'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'kuda'
where s.adapter_key = 'kuda_workable'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, 'workable', 'fairmoney',
  array['apply.workable.com'], array['/j'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'fairmoney'
where s.adapter_key = 'fairmoney_workable'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

commit;

-- ============================== PART 2 =====================================
-- RUN ONLY AFTER the Workable adapter is deployed to Netlify.
/*
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
where adapter_key in ('kuda_workable', 'fairmoney_workable');

update app.job_sources
set status = 'active'
where adapter_key in ('kuda_workable', 'fairmoney_workable')
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
where source.adapter_key in ('kuda_workable', 'fairmoney_workable')
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
      'ATS destination policy allows only apply.workable.com/j postings for this tenant; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job Truth Card renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key in ('kuda_workable', 'fairmoney_workable')
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

select row.adapter_key, row.tenant_identifier
from security.authorized_ats_source_config_rows() row
order by row.adapter_key;
*/
