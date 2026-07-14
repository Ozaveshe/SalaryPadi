begin;

-- Jobicy documents its API/RSS feed for integration into websites and wider
-- distribution. SalaryPadi uses only minimal metadata, links every role to the
-- Jobicy URL, avoids search/Google JobPosting publication, and polls at the
-- documented six-hour cadence. This authorization is intentionally separate
-- from the still-paused Remotive source.
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
  'jobicy',
  'Jobicy public API',
  'permitted_api',
  'active',
  'https://jobicy.com/',
  'https://jobicy.com/jobs-rss-feed',
  true,
  'Source: Jobicy; preserve a clickable link to the returned Jobicy URL',
  false,
  false,
  false,
  true,
  'source_url',
  interval '6 hours',
  timestamptz '2026-07-14 00:00:00+00',
  'jobicy-public-feed-reviewed-2026-07-14',
  'documented_public_api',
  'https://jobicy.com/jobs-rss-feed#fair-use-and-restrictions',
  'Jobicy public API and feed documentation',
  timestamptz '2026-07-14 00:00:00+00',
  false,
  'enabled',
  'secondary_feed',
  array[
    'id', 'url', 'jobTitle', 'companyName', 'jobIndustry', 'jobType',
    'jobGeo', 'jobLevel', 'jobExcerpt', 'pubDate', 'salaryMin',
    'salaryMax', 'salaryCurrency', 'salaryPeriod'
  ],
  timestamptz '2026-08-14 00:00:00+00',
  interval '1 day',
  interval '6 hours',
  4,
  array[
    'clickable_source_attribution',
    'six_hour_polling_limit',
    'no_external_redistribution'
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
where source.adapter_key = 'jobicy'
on conflict (source_id, dependency_key) do update
set state = excluded.state,
    evidence_reference = excluded.evidence_reference,
    reviewed_at = excluded.reviewed_at;

commit;
