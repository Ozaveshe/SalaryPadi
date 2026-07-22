-- Activate the UK salary benchmark lane from the ONS Annual Survey of Hours
-- and Earnings (ASHE) Table 14.7a — annual gross pay percentiles by 4-digit
-- SOC 2020 occupation, full-time employees, 2025 provisional edition
-- (reference period April 2025, released 2025-10-22). Published under the
-- Open Government Licence v3.0; values are used exactly as published with
-- ONS attribution. Occupations were matched to the same ten role families
-- the US BLS OEWS lane covers, at the same specialist (non-director) level.

begin;

insert into app.currencies (code, name, symbol, minor_units)
select 'GBP', 'Pound sterling', '£', 2
where not exists (select 1 from app.currencies where code = 'GBP');

insert into app.salary_data_sources (
  source_key, adapter_key, display_name, publisher_name, source_kind,
  dataset_url, methodology_url, terms_url, authorization_basis,
  authorization_evidence_ref, market_country_code, refresh_interval,
  allowed_fields, status, reviewed_at, review_due_at
)
select
  'uk_ons_ashe_reviewed_snapshot', 'reviewed_snapshot',
  'UK ONS ASHE annual gross pay percentiles (April 2025, provisional)',
  'Office for National Statistics', 'official_statistics',
  'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/occupation4digitsoc2010ashetable14',
  'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/methodologies/annualsurveyofhoursandearningsashemethodologyandguidance',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'open_government_licence',
  'ASHE datasets are published by ONS under the Open Government Licence v3.0, which permits reproduction with attribution',
  'GB', interval '1 year',
  array[
    'occupation_code', 'occupation_title', 'annual_25th_percentile',
    'annual_median', 'annual_75th_percentile', 'reference_period'
  ],
  'enabled', clock_timestamp(), clock_timestamp() + interval '6 months'
where not exists (
  select 1 from app.salary_data_sources
  where source_key = 'uk_ons_ashe_reviewed_snapshot'
);

insert into app.salary_benchmarks (
  source_id, role_family_id, country_code, currency_code, pay_period,
  gross_net, seniority, engagement_type,
  p25_amount, median_amount, p75_amount,
  p25_annual, median_annual, p75_annual,
  source_role_code, source_role_label, external_record_id,
  source_url, methodology_url,
  effective_from, effective_to, source_published_at,
  retrieved_at, review_status, reviewed_at, is_current,
  normalization_version, normalization_assumptions
)
select
  source.id, role.id, 'GB', 'GBP', 'annual',
  'gross', 'all', 'employee',
  data.p25, data.median, data.p75,
  data.p25, data.median, data.p75,
  data.soc_code, data.soc_label, 'ashe-2025p-' || data.soc_code,
  'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/occupation4digitsoc2010ashetable14',
  'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/methodologies/annualsurveyofhoursandearningsashemethodologyandguidance',
  date '2025-04-01', date '2027-03-31', timestamptz '2025-10-22 00:00:00+00',
  clock_timestamp(), 'approved', clock_timestamp(), true,
  'reviewed-snapshot-2026-07-22',
  jsonb_build_array(
    'ASHE 2025 provisional Table 14.7a (annual pay, gross) for full-time employees, United Kingdom',
    'Annual 25th percentile, median and 75th percentile used exactly as published; no conversion or adjustment applied',
    'source_published_at records the ONS release date; the reference period is April 2025',
    'Contains public sector information licensed under the Open Government Licence v3.0'
  )
from (values
  ('software-engineering', '2134', 'Programmers and software development professionals', 42289, 56914, 75794),
  ('cybersecurity', '2135', 'Cyber security professionals', 42761, 54647, 71808),
  ('quality-assurance', '2136', 'IT quality and testing professionals', 36725, 47118, 55008),
  ('data-science', '3544', 'Data analysts', 30835, 38572, 47045),
  ('accounting-finance', '2421', 'Chartered and certified accountants', 38696, 50062, 68056),
  ('marketing', '3554', 'Marketing associate professionals', 27373, 33412, 41521),
  ('project-management', '2440', 'Business and financial project management professionals', 46399, 59834, 77568),
  ('human-resources', '3571', 'Human resources and industrial relations officers', 29116, 35194, 43735),
  ('sales', '3552', 'Business sales executives', 30244, 37924, 52105),
  ('customer-support', '7219', 'Customer service occupations n.e.c.', 24583, 27848, 33076)
) as data(role_slug, soc_code, soc_label, p25, median, p75)
join app.role_families role on role.slug = data.role_slug
join app.salary_data_sources source
  on source.source_key = 'uk_ons_ashe_reviewed_snapshot'
where not exists (
  select 1 from app.salary_benchmarks existing
  where existing.external_record_id = 'ashe-2025p-' || data.soc_code
);

commit;
