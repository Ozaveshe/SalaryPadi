-- Register M-KOPA, LemFi and Acumen, 2026-07-29.
--
-- Applied directly to production per the docs/data convention. Mirrors the
-- Moniepoint/Jumia recipe. Adds the first two Ashby tenants; the adapter and
-- endpoint already exist (src/lib/jobs/ats/endpoints.ts) and the policy layer
-- already accepts provider 'ashby'.
--
-- HOW THESE WERE FOUND
--
-- scripts/probe-african-employer-boards.mjs, which asks the question the
-- earlier Workable sweep got backwards. That sweep asked the vendor which
-- boards exist and registered what came back: 108 sources, 43 of which never
-- put a role in front of a Nigerian candidate. This run started from employers
-- known to hire in Nigeria or across Africa and only then looked for a board.
--
-- 1,032 (employer, slug, provider) probes returned 23 boards. Most were
-- discarded, and the reason matters: guessing a tenant slug from a company name
-- finds *a* board, not *that employer's* board. greenhouse/carbon is the
-- Sunnyvale 3D-printing company, not the Nigerian lender. greenhouse/prospa is
-- the Australian SME lender. greenhouse/grey is the advertising agency. Each
-- would have registered cleanly and imported roles no Nigerian can apply for.
-- Identity was corroborated against the employer's own domain before any of the
-- three below were accepted.
--
-- Two more were rejected on freshness, which is the other half of the zombie
-- test: lever/apolloagriculture last published 2025-09-23 and
-- workable/helium-health 2025-06-23, thirteen months stale. Helium Health was
-- already probed_rejected in the registry for this reason and stays rejected.
--
-- VERIFIED 2026-07-29
--
--   M-KOPA   ashby/m-kopa     49 roles, newest 2026-07-29, 5 Nigerian
--            (Telesales Representative inbound and outbound, Sales Executive
--            Lagos, Head of Legal Regulatory & Compliance West Africa) and 23
--            elsewhere in Africa. m-kopa.com HTTP 200, "M-KOPA | Smart Phone,
--            Smart Money, Smart Choice". Asset financier operating across
--            Kenya, Nigeria, Ghana and Uganda.
--
--   LemFi    ashby/lemfi      22 roles, newest 2026-07-28, 1 Nigerian
--            (AML Ops Lead, Transaction Monitoring). lemfi.com HTTP 200,
--            "LemFi | International Payments For Everyone". Nigerian-founded
--            remittance company; the rest of the board is London and US, which
--            the country gate withholds.
--
--   Acumen   greenhouse/acumen  6 roles, newest 2026-07-23, 1 Nigerian
--            ("Data & Technology Manager, Acumen East & West Africa", posted
--            against Nairobi and Lagos). acumen.org HTTP 200, "Acumen |
--            Investing in Change to End Poverty".
--
-- NOT REGISTERED HERE, and why, so the next pass does not redo the work:
--
--   workable/access-bank  41 roles, 3 Nigerian, 41 African, fresh. The location
--            spread (Angola, Guinea, Gambia) matches Access Bank's real
--            subsidiary footprint, so this is promising -- but Workable began
--            returning HTTP 429 before the account record could be read, and
--            'domain_verified' is a claim that identity WAS corroborated. It is
--            left unregistered rather than asserted on a guess. Re-probe it.
--
--   greenhouse/ozow  10 roles, all Cape Town. Ozow is South-African only and
--            does not hire in Nigeria, so unlike Luno there is no prospect of
--            a Nigerian role appearing later. Registering it would store ten
--            records the country gate withholds forever. Held until the ZA
--            country pack activates.
--
-- DESTINATIONS observed on each board; host and prefix arrays are index-aligned
-- pairs, which ats-source-policy.ts enforces.
--
-- REVERSIBLE. Set status = 'paused' to stop the worker claiming any of these.

begin;

insert into app.companies (
  slug, display_name, website_url, website_domain,
  industry, verification_status, record_status
)
select v.slug, v.display_name, v.website_url, v.website_domain,
  v.industry, 'domain_verified', 'published'
from (values
  ('m-kopa', 'M-KOPA', 'https://www.m-kopa.com', 'm-kopa.com',
   'Financial services'),
  ('lemfi', 'LemFi', 'https://lemfi.com', 'lemfi.com',
   'Financial services'),
  ('acumen', 'Acumen', 'https://acumen.org', 'acumen.org',
   'Impact investing')
) as v(slug, display_name, website_url, website_domain, industry)
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
  v.terms_url, true, v.attribution_text,
  false, false, false, false, true,
  'employer_application_url', interval '6 hours',
  clock_timestamp(), v.terms_version,
  'documented_public_api', v.evidence_ref, v.grantor, clock_timestamp()
from (values
  (
    'mkopa_ashby', 'M-KOPA careers (Ashby board)',
    'https://www.m-kopa.com/careers',
    'https://developers.ashbyhq.com/docs/public-job-posting-api',
    'Published on M-KOPA''s official Ashby job board; apply on M-KOPA''s own application page.',
    'ashby-public-job-board-api-reviewed-2026-07-29',
    'https://jobs.ashbyhq.com/m-kopa is served by the documented public job board API https://api.ashbyhq.com/posting-api/job-board/m-kopa (verified 2026-07-29, 49 roles, 5 Nigerian, newest 2026-07-29)',
    'M-KOPA via its public Ashby job board'
  ),
  (
    'lemfi_ashby', 'LemFi careers (Ashby board)',
    'https://lemfi.com/careers',
    'https://developers.ashbyhq.com/docs/public-job-posting-api',
    'Published on LemFi''s official Ashby job board; apply on LemFi''s own application page.',
    'ashby-public-job-board-api-reviewed-2026-07-29',
    'https://jobs.ashbyhq.com/lemfi is served by the documented public job board API https://api.ashbyhq.com/posting-api/job-board/lemfi (verified 2026-07-29, 22 roles, 1 Nigerian, newest 2026-07-28)',
    'LemFi via its public Ashby job board'
  ),
  (
    'acumen_greenhouse', 'Acumen careers (Greenhouse board)',
    'https://acumen.org/careers',
    'https://developers.greenhouse.io/job-board.html',
    'Published on Acumen''s official Greenhouse job board; apply on Acumen''s own application page.',
    'greenhouse-public-board-api-reviewed-2026-07-29',
    'https://job-boards.greenhouse.io/acumen is served by the documented public board API https://boards-api.greenhouse.io/v1/boards/acumen/jobs (verified 2026-07-29, 6 roles, 1 Nigerian, newest 2026-07-23)',
    'Acumen via its public Greenhouse job board'
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
select s.id, c.id, v.provider, v.tenant, v.hosts, v.prefixes,
  interval '6 hours', 4, interval '1 hour', 'automatic', true
from (values
  ('mkopa_ashby', 'm-kopa', 'ashby', 'm-kopa',
   array['jobs.ashbyhq.com'], array['/m-kopa']),
  ('lemfi_ashby', 'lemfi', 'ashby', 'lemfi',
   array['jobs.ashbyhq.com'], array['/lemfi']),
  ('acumen_greenhouse', 'acumen', 'greenhouse', 'acumen',
   array['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
         'boards.greenhouse.io'],
   array['/acumen', '/acumen', '/acumen'])
) as v(adapter_key, company_slug, provider, tenant, hosts, prefixes)
join app.job_sources s on s.adapter_key = v.adapter_key
join app.companies c on c.slug = v.company_slug
where not exists (
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
    missing_dependencies = '{}'::text[]
where adapter_key in ('mkopa_ashby', 'lemfi_ashby', 'acumen_greenhouse');

update app.job_sources
set status = 'active'
where adapter_key in ('mkopa_ashby', 'lemfi_ashby', 'acumen_greenhouse')
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
where source.adapter_key in ('mkopa_ashby', 'lemfi_ashby', 'acumen_greenhouse')
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
where s.adapter_key in ('mkopa_ashby', 'lemfi_ashby', 'acumen_greenhouse')
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;

select row.adapter_key, row.tenant_identifier
from security.authorized_ats_source_config_rows() row
where row.adapter_key in ('mkopa_ashby', 'lemfi_ashby', 'acumen_greenhouse')
order by row.adapter_key;
