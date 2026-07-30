-- Activate the Nigeria market salary benchmark lane derived from the
-- Coresignal salaried-postings corpus (reports/coresignal-salary-corpus-2026-07.jsonl,
-- retrieved 2026-07-30; 1,599 active salaried postings collected under the
-- free trial). Aggregation is a derivative work expressly permitted by the
-- Coresignal Self-Service Subscription Agreement clause 1.2.3 (archived at
-- docs/data/sources/coresignal-self-service-agreement-2026-07-30.md). Raw
-- records are never published; only percentile cells that meet the
-- n >= 10 / >= 5-distinct-employer threshold appear here.
-- Regenerate with: node scripts/derive-coresignal-salary-benchmarks.mjs

begin;

insert into app.salary_data_sources (
  source_key, adapter_key, display_name, publisher_name, source_kind,
  dataset_url, methodology_url, terms_url, authorization_basis,
  authorization_evidence_ref, market_country_code, refresh_interval,
  allowed_fields, status, reviewed_at, review_due_at
)
select
  'coresignal_jobs_ng_derived_snapshot', 'reviewed_snapshot',
  'Nigeria market pay percentiles derived from Coresignal job postings (July 2026)',
  'Coresignal (Deeptrace Inc.)', 'licensed_dataset',
  'https://coresignal.com/solutions/jobs-data-api/',
  'https://docs.coresignal.com/jobs-api/multi-source-jobs-api/data-dictionary-multi-source-jobs-api',
  'https://coresignal.com/terms-and-conditions-api-dashboard/',
  'written_licence',
  'Coresignal Self-Service Subscription Agreement cl. 1.2.3 (derivative works); archived copy at docs/data/sources/coresignal-self-service-agreement-2026-07-30.md; corpus at reports/coresignal-salary-corpus-2026-07.jsonl',
  'NG', interval '3 months',
  array[
    'title', 'company_name', 'city', 'country', 'date_posted',
    'salary_min', 'salary_max', 'salary_currency', 'salary_period'
  ],
  'enabled', clock_timestamp(), clock_timestamp() + interval '6 months'
where not exists (
  select 1 from app.salary_data_sources
  where source_key = 'coresignal_jobs_ng_derived_snapshot'
);

insert into app.salary_benchmarks (
  source_id, role_family_id, country_code, currency_code, pay_period,
  gross_net, seniority, engagement_type,
  p25_amount, median_amount, p75_amount,
  p25_annual, median_annual, p75_annual,
  sample_size,
  source_role_code, source_role_label, external_record_id,
  source_url, methodology_url,
  effective_from, effective_to, source_published_at,
  retrieved_at, review_status, reviewed_at, is_current,
  normalization_version, normalization_assumptions
)
select
  source.id, role.id, 'NG', 'NGN', 'monthly',
  'unspecified', 'all', 'unspecified',
  data.p25, data.median, data.p75,
  data.p25 * 12, data.median * 12, data.p75 * 12,
  data.n,
  null, 'Nigerian job postings with disclosed monthly pay — ' || data.family_name,
  'coresignal-ng-2026-07-' || data.role_slug,
  'https://coresignal.com/solutions/jobs-data-api/',
  'https://docs.coresignal.com/jobs-api/multi-source-jobs-api/data-dictionary-multi-source-jobs-api',
  data.window_from, data.window_to, timestamptz '2026-07-30 00:00:00+00',
  clock_timestamp(), 'approved', clock_timestamp(), true,
  'coresignal-ng-derived-2026-07-30',
  jsonb_build_array(
    'Derived from active Nigerian job postings with disclosed NGN monthly pay in the Coresignal Multi-source Jobs dataset, retrieved 2026-07-30',
    'Postings dated 2025-08-01 or later only; older observations excluded because naira inflation makes them unrepresentative of current pay',
    'Midpoint of each advertised range; observations outside NGN 20,000-50,000,000/month excluded as implausible; exact company+title+range duplicates counted once',
    'Cells publish only with at least 10 postings across at least 5 distinct employers; sample_size is the posting count, not employee-reported salaries',
    'Monthly values as advertised; annual figures are monthly x 12 with no thirteenth month or allowances assumed',
    'Advertised pay rarely states gross versus net; classification is recorded as unspecified',
    'Aggregation is a derivative work under Coresignal Self-Service Subscription Agreement cl. 1.2.3; individual postings are never republished from this source'
  )
from (values
  ('accounting-finance', 'Accounting and Finance', 145000, 190000, 275000, 21, date '2025-09-26', date '2026-07-21'),
  ('education-academia', 'Education and Academia', 90000, 120000, 133000, 14, date '2025-08-11', date '2026-06-30'),
  ('logistics-supply-chain', 'Logistics and Supply Chain', 95000, 125000, 175000, 37, date '2025-10-02', date '2026-07-14'),
  ('marketing', 'Marketing', 120000, 150000, 360000, 13, date '2025-12-10', date '2026-07-03'),
  ('sales', 'Sales', 110000, 193000, 306000, 84, date '2025-08-01', date '2026-07-21')
) as data(role_slug, family_name, p25, median, p75, n, window_from, window_to)
join app.role_families role on role.slug = data.role_slug
join app.salary_data_sources source
  on source.source_key = 'coresignal_jobs_ng_derived_snapshot'
where not exists (
  select 1 from app.salary_benchmarks existing
  where existing.external_record_id = 'coresignal-ng-2026-07-' || data.role_slug
);

commit;
