-- Register the ReliefWeb jobs API as a reviewed, authorized source.
--
-- ReliefWeb approved SalaryPadi's API appname on 2026-07-26
-- (appname salarypadi-jobs-7k3q9x, support ref 00D6g022nMK/500PZ0so0Aj),
-- which closes the `preapproved_reliefweb_app_name` dependency. From
-- 1 November 2025 ReliefWeb requires a pre-approved appname on every call.
--
-- The `original_content_field_review` dependency is closed by an explicit
-- operator decision recorded here. ReliefWeb's own terms state that its
-- content "is contributed by information partners and may contain copyrighted
-- material owned by the original source", while also stating that "the vast
-- majority of ReliefWeb's content is owned by content partners and contributed
-- for re-publication", always attributed to the original source with the
-- original URL.
--
-- The review therefore permits listing metadata only:
--   id, url, title, source, country, closing_date, job_type, career_category.
-- No description or body text is requested by the adapter, stored, or
-- displayed, so no partner's prose is reproduced. Every listing attributes
-- ReliefWeb AND the named information partner, and links to the ReliefWeb URL.
--
-- may_index_jobs is true: the operator accepted search-engine indexing.
-- may_emit_jobposting_schema is FALSE and is not a policy preference — Google's
-- JobPosting markup requires a description, and this source carries none, so
-- the markup would be structurally invalid. Enabling it requires description
-- rights from ReliefWeb first.

begin;

insert into app.job_sources (
  adapter_key, name, authority, source_type, status, policy_state,
  homepage_url, terms_url, terms_version, terms_reviewed_at,
  allowed_fields, attribution_required, attribution_text,
  allow_public_listing, may_index_jobs, may_emit_jobposting_schema,
  may_store_full_description, may_email_jobs,
  required_destination_kind, refresh_interval, minimum_poll_interval,
  maximum_requests_per_day, raw_retention,
  authorization_basis, authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at, policy_review_due_at,
  required_dependencies, missing_dependencies
) values (
  'reliefweb',
  'ReliefWeb jobs API',
  'secondary_feed',
  'permitted_api',
  'active',
  'enabled',
  'https://reliefweb.int/',
  'https://apidoc.reliefweb.int/',
  'reliefweb-jobs-api-reviewed-2026-07-14',
  '2026-07-14T00:00:00+00:00',
  array[
    'id', 'url', 'title', 'source', 'country',
    'closing_date', 'job_type', 'career_category'
  ],
  true,
  'Source: ReliefWeb and the named information partner',
  true,
  true,   -- indexing accepted by the operator
  false,  -- JobPosting markup impossible without a description
  false,  -- no body text is ever requested or stored
  false,
  'source_url',
  interval '6 hours',
  interval '6 hours',
  12,     -- well inside ReliefWeb's documented 1000/day ceiling
  interval '30 days',
  'documented_public_api',
  'ReliefWeb API appname approval 2026-07-26 (salarypadi-jobs-7k3q9x); https://reliefweb.int/help/api',
  'ReliefWeb (UN OCHA) API team',
  '2026-07-26T00:00:00+00:00',
  '2026-08-26T00:00:00+00:00',
  array[
    'preapproved_reliefweb_app_name',
    'original_content_field_review'
  ],
  array[]::text[]
)
on conflict (adapter_key) do update
set status = excluded.status,
    policy_state = excluded.policy_state,
    may_index_jobs = excluded.may_index_jobs,
    may_emit_jobposting_schema = excluded.may_emit_jobposting_schema,
    allowed_fields = excluded.allowed_fields,
    authorization_evidence_ref = excluded.authorization_evidence_ref,
    authorization_reviewed_at = excluded.authorization_reviewed_at,
    policy_review_due_at = excluded.policy_review_due_at,
    missing_dependencies = excluded.missing_dependencies,
    updated_at = now();

commit;
