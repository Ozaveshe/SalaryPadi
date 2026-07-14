begin;

-- Himalayas explicitly documents its public API for backfilling job boards.
-- SalaryPadi keeps only bounded metadata and excerpts, links every role to the
-- Himalayas URL, polls three reviewed pages once daily, and excludes these
-- records from search indexing, Google JobPosting, email, and redistribution.
insert into app.job_sources (
  adapter_key,
  name,
  source_type,
  status,
  homepage_url,
  terms_url,
  attribution_required,
  attribution_text,
  may_store_full_description,
  may_index_jobs,
  may_emit_jobposting_schema,
  allow_public_listing,
  required_destination_kind,
  refresh_interval,
  terms_reviewed_at,
  terms_version,
  authorization_basis,
  authorization_evidence_ref,
  authorization_grantor,
  authorization_reviewed_at,
  may_email_jobs,
  policy_state,
  authority,
  allowed_fields,
  policy_review_due_at,
  raw_retention,
  minimum_poll_interval,
  maximum_requests_per_day,
  required_dependencies,
  missing_dependencies
) values (
  'himalayas',
  'Himalayas public jobs API',
  'permitted_api',
  'active',
  'https://himalayas.app/',
  'https://himalayas.app/api',
  true,
  'Source: Himalayas; preserve a clickable link to the returned Himalayas URL',
  false,
  false,
  false,
  true,
  'source_url',
  interval '1 day',
  timestamptz '2026-07-14 19:40:00+00',
  'himalayas-public-api-reviewed-2026-07-15',
  'documented_public_api',
  'https://himalayas.app/api',
  'Himalayas Remote Jobs API documentation',
  timestamptz '2026-07-14 19:40:00+00',
  false,
  'enabled',
  'secondary_feed',
  array[
    'guid', 'applicationLink', 'title', 'excerpt', 'companyName',
    'companySlug', 'employmentType', 'minSalary', 'maxSalary',
    'salaryPeriod', 'seniority', 'currency', 'locationRestrictions',
    'timezoneRestrictions', 'categories', 'parentCategories', 'pubDate',
    'expiryDate'
  ],
  timestamptz '2026-08-14 19:40:00+00',
  interval '1 day',
  interval '1 day',
  3,
  array[
    'clickable_source_attribution',
    'daily_polling_limit',
    'no_third_party_redistribution'
  ],
  '{}'::text[]
);

insert into private.job_source_dependencies (
  source_id,
  dependency_key,
  state,
  evidence_reference,
  reviewed_at
)
select
  source.id,
  dependency.dependency_key,
  'verified',
  source.authorization_evidence_ref,
  source.authorization_reviewed_at
from app.job_sources source
cross join lateral unnest(source.required_dependencies)
  as dependency(dependency_key)
where source.adapter_key = 'himalayas'
on conflict (source_id, dependency_key) do update
set state = excluded.state,
    evidence_reference = excluded.evidence_reference,
    reviewed_at = excluded.reviewed_at;

commit;
