-- Register three reviewed employer boards, 2026-07-29.
--
-- Applied directly to production per the docs/data convention: these are data
-- rows, and CI replays the migration chain against pgTAP fixtures, so source
-- registrations never enter it. Mirrors the Moniepoint/Jumia recipe exactly.
--
-- RIGHTS BASIS
--
-- All three are 'documented_public_api': the employer publishes its own board
-- through the ATS vendor's documented public endpoint. This is the same basis
-- carried by every source already registered, not a per-employer negotiation.
-- Verified 2026-07-29 with the SalaryPadi user agent:
--
--   https://apply.workable.com/api/v1/widget/accounts/renmoney
--   https://boards-api.greenhouse.io/v1/boards/oneacrefund/jobs
--   https://boards-api.greenhouse.io/v1/boards/luno/jobs
--
-- IDENTITY (what 'domain_verified' asserts: the official site was fetched in
-- this pass and the organisation record corroborated, nothing more)
--
--   renmoney.com      HTTP 200, "Loan App in Nigeria & High-Yield Savings |
--                     Renmoney", self-describes as a CBN-licensed lender.
--                     Workable account name "Renmoney".
--   oneacrefund.org   HTTP 200, title "One Acre Fund", smallholder-farmer
--                     supply NGO. Greenhouse board name "One Acre Fund".
--   luno.com          HTTP 200, "Luno - Buy and sell crypto securely".
--                     Greenhouse board name "Luno".
--
-- FRESHNESS AND YIELD, probed 2026-07-29
--
--   renmoney     110 roles, board last updated 2026-07-28 (one day old),
--                71 in Nigeria: Lagos x62, Ikoyi x9. The remainder are Russia,
--                Serbia, Georgia, Belarus and Kazakhstan engineering roles,
--                which the country gate withholds until those packs activate.
--   oneacrefund   37 roles, newest 2026-07-29, 4 in Nigeria (Minna x3,
--                Bauchi x1). The other 33 are Rwanda, Burundi, Kenya and
--                Ethiopia and are held pending by the same gate.
--   luno           6 roles, newest 2026-07-29, NONE in Nigeria: three Cape
--                Town/Johannesburg, the rest Jakarta and Kuala Lumpur.
--
-- WHY LUNO IS REGISTERED DESPITE YIELDING NOTHING TODAY
--
-- This is the jumia_greenhouse precedent, not the ajaia_workable mistake. The
-- distinction that matters is whether a board *can* carry Nigerian roles. ajaia
-- was paused because its 245 roles were US, Philippines, India and Pakistan and
-- it has no Nigerian presence at all -- importing it would have cost 245 stored
-- records the gate then withholds forever. Luno operates in Nigeria, and its
-- board is six roles. A board that may carry Nigerian roles later, at trivial
-- storage cost, is not the same as one that never will.
--
-- DESTINATIONS are pinned to what was actually observed, and the host and
-- prefix arrays are index-aligned pairs (ats-source-policy.ts rejects unequal
-- lengths and groups prefixes by host):
--
--   renmoney     apply.workable.com/j/<id>
--   oneacrefund  oneacrefund.org/vacancies/?gh_jid=<id>  -- the employer's own
--                domain, with the Greenhouse host kept as the fallback the
--                adapter may still be handed
--   luno         job-boards.greenhouse.io/luno/jobs/<id>
--
-- REVERSIBLE. Set app.job_sources.status = 'paused' to stop the worker claiming
-- any of these without discarding the registration or its rights rows.

begin;

-- ---------------------------------------------------------------------------
-- Part 1: companies, sources and ATS configs.
-- ---------------------------------------------------------------------------

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select v.slug, v.display_name, v.website_url, v.website_domain,
  v.industry, 'domain_verified', 'published'
from (values
  ('renmoney', 'Renmoney', 'https://renmoney.com', 'renmoney.com',
   'Financial services'),
  ('one-acre-fund', 'One Acre Fund', 'https://oneacrefund.org',
   'oneacrefund.org', 'Agriculture'),
  ('luno', 'Luno', 'https://www.luno.com', 'luno.com', 'Financial services')
) as v(slug, display_name, website_url, website_domain, industry)
where not exists (
  select 1 from app.companies c where c.slug = v.slug
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
select v.adapter_key, v.name, 'employer_ats', 'draft', v.homepage_url,
  v.terms_url, true, v.attribution_text,
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), v.terms_version,
  'documented_public_api', v.evidence_ref, v.grantor, clock_timestamp()
from (values
  (
    'renmoney_workable', 'Renmoney careers (Workable board)',
    'https://renmoney.com/careers',
    'https://help.workable.com/hc/en-us/articles/115012750446',
    'Published on Renmoney''s official Workable job board; apply on Renmoney''s own application page.',
    'workable-public-widget-api-reviewed-2026-07-29',
    'https://apply.workable.com/renmoney/ is served by the documented public widget API https://apply.workable.com/api/v1/widget/accounts/renmoney (verified 2026-07-29, 110 roles, 71 Nigerian, board updated 2026-07-28)',
    'Renmoney via its public Workable job board'
  ),
  (
    'oneacrefund_greenhouse', 'One Acre Fund careers (Greenhouse board)',
    'https://oneacrefund.org/careers',
    'https://developers.greenhouse.io/job-board.html',
    'Published on One Acre Fund''s official Greenhouse job board; apply on One Acre Fund''s own application page.',
    'greenhouse-public-board-api-reviewed-2026-07-29',
    'https://oneacrefund.org/vacancies is served by the documented public board API https://boards-api.greenhouse.io/v1/boards/oneacrefund/jobs (verified 2026-07-29, 37 fresh roles, 4 Nigerian)',
    'One Acre Fund via its public Greenhouse job board'
  ),
  (
    'luno_greenhouse', 'Luno careers (Greenhouse board)',
    'https://www.luno.com/en/careers',
    'https://developers.greenhouse.io/job-board.html',
    'Published on Luno''s official Greenhouse job board; apply on Luno''s own application page.',
    'greenhouse-public-board-api-reviewed-2026-07-29',
    'https://job-boards.greenhouse.io/luno is served by the documented public board API https://boards-api.greenhouse.io/v1/boards/luno/jobs (verified 2026-07-29, 6 fresh roles, none Nigerian at probe time)',
    'Luno via its public Greenhouse job board'
  )
) as v(adapter_key, name, homepage_url, terms_url, attribution_text,
       terms_version, evidence_ref, grantor)
where not exists (
  select 1 from app.job_sources s where s.adapter_key = v.adapter_key
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
)
select s.id, c.id, v.provider, v.tenant,
  v.hosts, v.prefixes,
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from (values
  ('renmoney_workable', 'renmoney', 'workable', 'renmoney',
   array['apply.workable.com'], array['/j']),
  ('oneacrefund_greenhouse', 'one-acre-fund', 'greenhouse', 'oneacrefund',
   array['oneacrefund.org', 'job-boards.greenhouse.io'],
   array['/vacancies', '/oneacrefund']),
  ('luno_greenhouse', 'luno', 'greenhouse', 'luno',
   array['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
         'boards.greenhouse.io'],
   array['/luno', '/luno', '/luno'])
) as v(adapter_key, company_slug, provider, tenant, hosts, prefixes)
join app.job_sources s on s.adapter_key = v.adapter_key
join app.companies c on c.slug = v.company_slug
where not exists (
  select 1 from private.ats_source_configs cfg where cfg.source_id = s.id
);

commit;

begin;

-- ---------------------------------------------------------------------------
-- Part 2: re-review (the config insert auto-revokes it), policy fields,
-- activation, NG country rights and dependency evidence.
-- ---------------------------------------------------------------------------

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
where adapter_key in (
  'renmoney_workable', 'oneacrefund_greenhouse', 'luno_greenhouse'
);

update app.job_sources
set status = 'active'
where adapter_key in (
    'renmoney_workable', 'oneacrefund_greenhouse', 'luno_greenhouse'
  )
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
where source.adapter_key in (
    'renmoney_workable', 'oneacrefund_greenhouse', 'luno_greenhouse'
  )
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
      'ATS destination policy pins this tenant to the hosts and path prefixes observed on its own board 2026-07-29; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then
      'Job detail renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key in (
    'renmoney_workable', 'oneacrefund_greenhouse', 'luno_greenhouse'
  )
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

-- Verification: every new tenant must appear here, or the runtime policy
-- reader will not hand the worker a claim for it.
select row.adapter_key, row.tenant_identifier
from security.authorized_ats_source_config_rows() row
order by row.adapter_key;
