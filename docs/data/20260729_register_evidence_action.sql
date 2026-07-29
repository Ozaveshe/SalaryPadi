-- Register Evidence Action, 2026-07-29.
--
-- Applied directly to production per the docs/data convention.
--
-- HOW IT WAS FOUND, and why that matters for identity
--
-- scripts/sniff-employer-ats-links.mjs, which asks the employer instead of
-- guessing. The slug-guessing pass finds *a* board on a name-shaped slug and
-- then has to prove the board belongs to the employer -- that is how
-- greenhouse/carbon (the Sunnyvale 3D-printing company) and greenhouse/prospa
-- (the Australian lender) turned up as false positives for Nigerian companies.
--
-- Reading the careers page inverts that. apply.workable.com/evidence-action is
-- linked from evidenceaction.org's own careers page, so the tenant is the
-- employer's own declaration rather than our inference, and a slug collision is
-- impossible by construction. Corroborated anyway: the Workable account record
-- names itself "Evidence Action", and evidenceaction.org returns HTTP 200 with
-- the title "Evidence Action | Using evidence to improve global well being".
--
-- VERIFIED 2026-07-29: 25 roles, 3 Nigerian, all in Abuja --
--   (Senior) Director, Global Monitoring, Evaluation, and Learning
--   Consultant Analyst - Data Analysis, QA & Capacity Building
--   Field Enumerator, SQ-LNS - Talent Pool
-- The remainder are United States, Liberia, Kenya and India; the country gate
-- withholds those whose packs are not activated.
--
-- Destinations are apply.workable.com/j/<code>, the same shape already carried
-- by kuda_workable, fairmoney_workable and renmoney_workable.
--
-- REVERSIBLE. Set status = 'paused' to stop the worker claiming it.

begin;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select 'evidence-action', 'Evidence Action', 'https://www.evidenceaction.org',
  'evidenceaction.org', 'Global health', 'domain_verified', 'published'
where not exists (select 1 from app.companies where slug = 'evidence-action');

insert into app.job_sources (
  adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, may_email_jobs,
  allow_public_listing, required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version,
  authorization_basis, authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at
)
select 'evidence_action_workable', 'Evidence Action careers (Workable board)',
  'employer_ats', 'draft', 'https://www.evidenceaction.org/careers',
  'https://help.workable.com/hc/en-us/articles/115012750446',
  true,
  'Published on Evidence Action''s official Workable job board; apply on Evidence Action''s own application page.',
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), 'workable-public-widget-api-reviewed-2026-07-29',
  'documented_public_api',
  'Tenant declared by the employer itself: apply.workable.com/evidence-action is linked from evidenceaction.org''s own careers page, and is served by the documented public widget API https://apply.workable.com/api/v1/widget/accounts/evidence-action (verified 2026-07-29, 25 roles, 3 Nigerian in Abuja, account name "Evidence Action")',
  'Evidence Action via its public Workable job board',
  clock_timestamp()
where not exists (
  select 1 from app.job_sources where adapter_key = 'evidence_action_workable'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, 'workable', 'evidence-action',
  array['apply.workable.com'], array['/j'],
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from app.job_sources s
join app.companies c on c.slug = 'evidence-action'
where s.adapter_key = 'evidence_action_workable'
  and not exists (
    select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
  );

commit;

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
    missing_dependencies = '{}'::text[],
    status = 'active'
where adapter_key = 'evidence_action_workable';

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
where source.adapter_key = 'evidence_action_workable'
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
      'ATS destination policy pins this tenant to apply.workable.com/j, observed on its own board 2026-07-29; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key = 'evidence_action_workable'
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

select row.adapter_key, row.tenant_identifier
from security.authorized_ats_source_config_rows() row
where row.adapter_key = 'evidence_action_workable';
