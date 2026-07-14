-- Keep first-party salary contributions and externally sourced benchmarks in
-- separate evidence lanes. External data is never treated as a contribution,
-- never used to satisfy a privacy cohort, and cannot become public until the
-- source and each normalized benchmark have both been reviewed.

create table if not exists app.salary_data_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  display_name text not null,
  publisher_name text not null,
  source_kind text not null,
  adapter_key text not null,
  market_country_code text,
  dataset_url text not null,
  methodology_url text,
  terms_url text,
  authorization_basis text not null default 'pending_review',
  authorization_evidence_ref text,
  allowed_fields text[] not null default '{}',
  refresh_interval interval not null default interval '30 days',
  status text not null default 'draft',
  reviewed_at timestamptz,
  review_due_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_data_sources_key check (source_key ~ '^[a-z0-9][a-z0-9_]{2,79}$'),
  constraint salary_data_sources_name check (
    char_length(display_name) between 2 and 160
    and char_length(publisher_name) between 2 and 160
  ),
  constraint salary_data_sources_kind check (
    source_kind in ('official_statistics', 'licensed_dataset', 'verified_employer')
  ),
  constraint salary_data_sources_adapter check (
    adapter_key in ('bls_oews', 'ons_ashe', 'statcan_wages', 'statssa_qes', 'reviewed_snapshot')
  ),
  constraint salary_data_sources_country check (
    market_country_code is null or market_country_code ~ '^[A-Z]{2}$'
  ),
  constraint salary_data_sources_dataset_https check (dataset_url ~* '^https://'),
  constraint salary_data_sources_methodology_https check (
    methodology_url is null or methodology_url ~* '^https://'
  ),
  constraint salary_data_sources_terms_https check (
    terms_url is null or terms_url ~* '^https://'
  ),
  constraint salary_data_sources_authorization check (
    authorization_basis in (
      'pending_review', 'open_government_licence', 'written_licence',
      'written_employer_authorization'
    )
  ),
  constraint salary_data_sources_refresh check (
    refresh_interval between interval '1 day' and interval '1 year'
  ),
  constraint salary_data_sources_status check (
    status in ('draft', 'enabled', 'paused', 'revoked')
  ),
  constraint salary_data_sources_enabled_shape check (
    status <> 'enabled' or (
      authorization_basis <> 'pending_review'
      and authorization_evidence_ref is not null
      and terms_url is not null
      and reviewed_at is not null
      and review_due_at is not null
      and review_due_at > reviewed_at
      and cardinality(allowed_fields) > 0
    )
  )
);

create table if not exists private.salary_source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app.salary_data_sources(id) on delete restrict,
  run_key text not null,
  status text not null default 'running',
  source_version text,
  source_checksum text,
  fetched_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  summary jsonb not null default '{}'::jsonb,
  constraint salary_source_runs_key check (char_length(run_key) between 8 and 240),
  constraint salary_source_runs_status check (
    status in ('running', 'succeeded', 'failed', 'skipped')
  ),
  constraint salary_source_runs_counts check (
    fetched_count >= 0 and accepted_count >= 0 and rejected_count >= 0
    and accepted_count + rejected_count <= fetched_count
  ),
  constraint salary_source_runs_terminal check (
    (status = 'running' and completed_at is null and error_code is null)
    or (status in ('succeeded', 'skipped') and completed_at is not null and error_code is null)
    or (status = 'failed' and completed_at is not null and error_code is not null)
  ),
  unique (source_id, run_key)
);

create index if not exists salary_source_sync_runs_recent
  on private.salary_source_sync_runs (source_id, started_at desc);

create table if not exists private.salary_source_rejections (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.salary_source_sync_runs(id) on delete cascade,
  record_index integer not null,
  record_digest text not null,
  error_code text not null,
  created_at timestamptz not null default now(),
  constraint salary_source_rejections_index check (record_index >= 0),
  constraint salary_source_rejections_digest check (record_digest ~ '^[a-f0-9]{64}$'),
  constraint salary_source_rejections_code check (error_code ~ '^[A-Z0-9]{5}$'),
  unique (run_id, record_index)
);

create table if not exists app.salary_benchmarks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references app.salary_data_sources(id) on delete restrict,
  source_run_id uuid references private.salary_source_sync_runs(id) on delete set null,
  external_record_id text not null,
  role_family_id uuid not null references app.role_families(id) on delete restrict,
  source_role_code text,
  source_role_label text not null,
  country_code text not null,
  region_label text,
  seniority text not null default 'all',
  engagement_type app.engagement_type not null default 'employee',
  currency_code text not null,
  gross_net app.gross_net_classification not null default 'gross',
  pay_period app.pay_period not null,
  median_amount numeric(18,2) not null,
  p25_amount numeric(18,2),
  p75_amount numeric(18,2),
  median_annual numeric(18,2) not null,
  p25_annual numeric(18,2),
  p75_annual numeric(18,2),
  sample_size integer,
  effective_from date not null,
  effective_to date not null,
  source_published_at timestamptz,
  retrieved_at timestamptz not null,
  source_url text not null,
  methodology_url text,
  normalization_version text not null,
  normalization_assumptions jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending',
  reviewed_at timestamptz,
  review_note text,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint salary_benchmarks_external_id check (
    char_length(external_record_id) between 1 and 240
  ),
  constraint salary_benchmarks_role_label check (
    char_length(source_role_label) between 2 and 240
  ),
  constraint salary_benchmarks_country check (country_code ~ '^[A-Z]{2}$'),
  constraint salary_benchmarks_currency check (currency_code ~ '^[A-Z]{3}$'),
  constraint salary_benchmarks_positive check (
    median_amount > 0 and median_annual > 0
    and (p25_amount is null or p25_amount > 0)
    and (p75_amount is null or p75_amount >= median_amount)
    and (p25_amount is null or p25_amount <= median_amount)
    and (p25_annual is null or p25_annual > 0)
    and (p75_annual is null or p75_annual >= median_annual)
    and (p25_annual is null or p25_annual <= median_annual)
  ),
  constraint salary_benchmarks_sample check (sample_size is null or sample_size > 0),
  constraint salary_benchmarks_dates check (effective_to >= effective_from),
  constraint salary_benchmarks_source_https check (source_url ~* '^https://'),
  constraint salary_benchmarks_methodology_https check (
    methodology_url is null or methodology_url ~* '^https://'
  ),
  constraint salary_benchmarks_normalization check (
    char_length(normalization_version) between 1 and 80
    and jsonb_typeof(normalization_assumptions) = 'array'
  ),
  constraint salary_benchmarks_review_status check (
    review_status in ('pending', 'approved', 'rejected', 'expired')
  ),
  constraint salary_benchmarks_public_shape check (
    not is_current or (
      review_status = 'approved'
      and reviewed_at is not null
      and source_published_at is not null
    )
  )
);

create unique index if not exists salary_benchmarks_source_record_version
  on app.salary_benchmarks (source_id, external_record_id, effective_from, effective_to);
create unique index if not exists salary_benchmarks_current_record
  on app.salary_benchmarks (source_id, external_record_id) where is_current;
create index if not exists salary_benchmarks_public_search
  on app.salary_benchmarks (
    is_current, review_status, country_code, role_family_id, effective_to desc
  );

alter table app.salary_data_sources enable row level security;
alter table app.salary_data_sources force row level security;
alter table app.salary_benchmarks enable row level security;
alter table app.salary_benchmarks force row level security;
alter table private.salary_source_sync_runs enable row level security;
alter table private.salary_source_sync_runs force row level security;
alter table private.salary_source_rejections enable row level security;
alter table private.salary_source_rejections force row level security;

drop policy if exists salary_data_sources_public_read on app.salary_data_sources;
create policy salary_data_sources_public_read on app.salary_data_sources
for select to anon, authenticated
using (status = 'enabled' and reviewed_at is not null and review_due_at > now());

drop policy if exists salary_benchmarks_public_read on app.salary_benchmarks;
create policy salary_benchmarks_public_read on app.salary_benchmarks
for select to anon, authenticated
using (
  is_current and review_status = 'approved'
  and exists (
    select 1 from app.salary_data_sources source
    where source.id = salary_benchmarks.source_id
      and source.status = 'enabled'
      and source.reviewed_at is not null
      and source.review_due_at > now()
  )
);

grant select on app.salary_data_sources, app.salary_benchmarks to anon, authenticated;

create or replace function api.worker_list_enabled_salary_sources()
returns table (
  source_key text,
  display_name text,
  adapter_key text,
  market_country_code text,
  dataset_url text,
  methodology_url text,
  terms_url text,
  allowed_fields text[],
  refresh_interval_seconds integer,
  last_success_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select source.source_key, source.display_name, source.adapter_key,
    source.market_country_code, source.dataset_url, source.methodology_url,
    source.terms_url, source.allowed_fields,
    extract(epoch from source.refresh_interval)::integer,
    source.last_success_at
  from app.salary_data_sources source
  where coalesce((select auth.role()), '') = 'service_role'
    and source.status = 'enabled'
    and source.authorization_basis <> 'pending_review'
    and source.authorization_evidence_ref is not null
    and source.reviewed_at is not null
    and source.review_due_at > now()
  order by source.source_key;
$$;

revoke all on function api.worker_list_enabled_salary_sources() from public, anon, authenticated;
grant execute on function api.worker_list_enabled_salary_sources() to service_role;

create or replace function api.worker_store_salary_benchmark_batch(
  p_source_key text,
  p_source_version text,
  p_source_checksum text,
  p_started_at timestamptz,
  p_benchmarks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source app.salary_data_sources%rowtype;
  v_run_id uuid;
  v_item jsonb;
  v_role_family_id uuid;
  v_fetched integer;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_record_index integer := 0;
  v_error_code text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'salary source worker required';
  end if;
  if p_started_at is null
     or char_length(coalesce(p_source_version, '')) not between 1 and 160
     or p_source_checksum !~ '^sha256:[a-f0-9]{64}$'
     or jsonb_typeof(p_benchmarks) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid salary benchmark batch envelope';
  end if;
  v_fetched := jsonb_array_length(p_benchmarks);
  if v_fetched < 1 or v_fetched > 5000 then
    raise exception using errcode = '22023', message = 'salary benchmark batch size out of bounds';
  end if;

  select * into strict v_source
  from app.salary_data_sources source
  where source.source_key = p_source_key
    and source.status = 'enabled'
    and source.authorization_basis <> 'pending_review'
    and source.authorization_evidence_ref is not null
    and source.reviewed_at is not null
    and source.review_due_at > now();

  insert into private.salary_source_sync_runs (
    source_id, run_key, status, source_version, source_checksum,
    fetched_count, started_at
  ) values (
    v_source.id, concat(p_source_version, ':', p_source_checksum), 'running',
    p_source_version, p_source_checksum, v_fetched, p_started_at
  )
  on conflict (source_id, run_key) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    return jsonb_build_object(
      'status', 'duplicate', 'fetched_count', v_fetched,
      'accepted_count', 0, 'rejected_count', 0
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_benchmarks)
  loop
    begin
      if jsonb_typeof(v_item) <> 'object'
         or (v_item->>'sourceUrl') !~* '^https://'
         or (v_item->>'countryCode') !~ '^[A-Z]{2}$'
         or (v_item->>'currencyCode') !~ '^[A-Z]{3}$'
         or (v_item->>'normalizationVersion') is null then
        raise exception using errcode = '22023', message = 'invalid normalized benchmark';
      end if;
      select role.id into strict v_role_family_id
      from app.role_families role
      where role.slug = v_item->>'roleFamilySlug' and role.active;

      insert into app.salary_benchmarks (
        source_id, source_run_id, external_record_id, role_family_id,
        source_role_code, source_role_label, country_code, region_label,
        seniority, engagement_type, currency_code, gross_net, pay_period,
        median_amount, p25_amount, p75_amount,
        median_annual, p25_annual, p75_annual, sample_size,
        effective_from, effective_to, source_published_at, retrieved_at,
        source_url, methodology_url, normalization_version,
        normalization_assumptions, review_status, is_current
      ) values (
        v_source.id, v_run_id, v_item->>'externalRecordId', v_role_family_id,
        nullif(v_item->>'sourceRoleCode', ''), v_item->>'sourceRoleLabel',
        v_item->>'countryCode', nullif(v_item->>'regionLabel', ''),
        coalesce(nullif(v_item->>'seniority', ''), 'all'),
        coalesce(nullif(v_item->>'engagementType', ''), 'employee')::app.engagement_type,
        v_item->>'currencyCode', (v_item->>'grossNet')::app.gross_net_classification,
        (v_item->>'payPeriod')::app.pay_period,
        (v_item->>'medianAmount')::numeric,
        nullif(v_item->>'percentile25Amount', '')::numeric,
        nullif(v_item->>'percentile75Amount', '')::numeric,
        (v_item->>'medianAnnual')::numeric,
        nullif(v_item->>'percentile25Annual', '')::numeric,
        nullif(v_item->>'percentile75Annual', '')::numeric,
        nullif(v_item->>'sampleSize', '')::integer,
        (v_item->>'effectiveFrom')::date, (v_item->>'effectiveTo')::date,
        (v_item->>'sourcePublishedAt')::timestamptz,
        (v_item->>'retrievedAt')::timestamptz,
        v_item->>'sourceUrl', nullif(v_item->>'methodologyUrl', ''),
        v_item->>'normalizationVersion',
        coalesce(v_item->'normalizationAssumptions', '[]'::jsonb),
        'pending', false
      )
      on conflict (source_id, external_record_id, effective_from, effective_to)
      do update set
        source_run_id = excluded.source_run_id,
        source_role_code = excluded.source_role_code,
        source_role_label = excluded.source_role_label,
        role_family_id = excluded.role_family_id,
        region_label = excluded.region_label,
        median_amount = excluded.median_amount,
        p25_amount = excluded.p25_amount,
        p75_amount = excluded.p75_amount,
        median_annual = excluded.median_annual,
        p25_annual = excluded.p25_annual,
        p75_annual = excluded.p75_annual,
        sample_size = excluded.sample_size,
        retrieved_at = excluded.retrieved_at,
        source_url = excluded.source_url,
        methodology_url = excluded.methodology_url,
        normalization_version = excluded.normalization_version,
        normalization_assumptions = excluded.normalization_assumptions,
        review_status = case
          when app.salary_benchmarks.review_status = 'approved'
            and app.salary_benchmarks.normalization_version = excluded.normalization_version
            and app.salary_benchmarks.median_annual = excluded.median_annual
          then app.salary_benchmarks.review_status else 'pending' end,
        is_current = case
          when app.salary_benchmarks.review_status = 'approved'
            and app.salary_benchmarks.normalization_version = excluded.normalization_version
            and app.salary_benchmarks.median_annual = excluded.median_annual
          then app.salary_benchmarks.is_current else false end;
      v_accepted := v_accepted + 1;
    exception when others then
      get stacked diagnostics v_error_code = returned_sqlstate;
      insert into private.salary_source_rejections (
        run_id, record_index, record_digest, error_code
      ) values (
        v_run_id, v_record_index,
        encode(extensions.digest(v_item::text, 'sha256'), 'hex'),
        v_error_code
      );
      v_rejected := v_rejected + 1;
    end;
    v_record_index := v_record_index + 1;
  end loop;

  update private.salary_source_sync_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      accepted_count = v_accepted, rejected_count = v_rejected,
      summary = jsonb_build_object(
        'source_key', p_source_key,
        'source_version', p_source_version,
        'pending_human_review', v_accepted
      )
  where id = v_run_id;
  update app.salary_data_sources
  set last_success_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_source.id;

  return jsonb_build_object(
    'status', 'succeeded', 'run_id', v_run_id,
    'fetched_count', v_fetched, 'accepted_count', v_accepted,
    'rejected_count', v_rejected, 'pending_human_review', v_accepted
  );
exception when others then
  if v_run_id is not null then
    update private.salary_source_sync_runs
    set status = 'failed', completed_at = clock_timestamp(),
        accepted_count = v_accepted, rejected_count = v_rejected,
        error_code = 'salary_batch_failed'
    where id = v_run_id;
  end if;
  raise;
end;
$$;

revoke all on function api.worker_store_salary_benchmark_batch(
  text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function api.worker_store_salary_benchmark_batch(
  text, text, text, timestamptz, jsonb
) to service_role;

-- Public salary search keeps one stable endpoint while exposing the evidence
-- lane. Online benchmarks remain separate rows and never participate in the
-- first-party privacy aggregation function.
create or replace view api.salary_aggregates
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.company_id, c.slug as company_slug,
  s.role_family_id, r.slug as role_slug, r.name as role_family,
  s.country_code, 'all'::text as seniority,
  s.engagement_type::text as arrangement, s.engagement_type,
  s.currency_code, s.currency_code as currency, s.gross_net,
  s.sample_size, s.median_annual,
  s.p25_annual, s.p25_annual as percentile_25_annual,
  s.p75_annual, s.p75_annual as percentile_75_annual,
  s.source_month_from, s.source_month_from as submission_month_start,
  s.source_month_to, s.source_month_to as submission_month_end,
  s.confidence_label, s.confidence_label as confidence,
  s.rule_version_id, s.computed_at, s.computed_at as calculated_at,
  s.verification_mix,
  'first_party_contributions'::text as evidence_lane,
  'SalaryPadi community'::text as source_name,
  null::text as source_url,
  null::text as methodology_url,
  null::text as source_role_label,
  null::app.pay_period as source_pay_period,
  null::numeric as source_median_amount,
  'Privacy-thresholded approved contributions'::text as provenance_label
from app.salary_aggregate_snapshots s
join app.role_families r on r.id = s.role_family_id
left join app.companies c on c.id = s.company_id
where s.is_current and s.is_released
union all
select
  benchmark.id, null::uuid, null::text,
  benchmark.role_family_id, role.slug, role.name,
  benchmark.country_code, benchmark.seniority,
  benchmark.engagement_type::text, benchmark.engagement_type,
  benchmark.currency_code, benchmark.currency_code, benchmark.gross_net,
  benchmark.sample_size, benchmark.median_annual,
  benchmark.p25_annual, benchmark.p25_annual,
  benchmark.p75_annual, benchmark.p75_annual,
  date_trunc('month', benchmark.effective_from)::date,
  date_trunc('month', benchmark.effective_from)::date,
  date_trunc('month', benchmark.effective_to)::date,
  date_trunc('month', benchmark.effective_to)::date,
  case when benchmark.sample_size is not null and benchmark.sample_size >= 100
    then 'high'::text else 'medium'::text end,
  case when benchmark.sample_size is not null and benchmark.sample_size >= 100
    then 'high'::text else 'medium'::text end,
  null::uuid, benchmark.retrieved_at, benchmark.retrieved_at,
  jsonb_build_object('official_or_licensed', 1),
  'verified_online_benchmark'::text,
  source.display_name,
  benchmark.source_url,
  coalesce(benchmark.methodology_url, source.methodology_url),
  benchmark.source_role_label,
  benchmark.pay_period,
  benchmark.median_amount,
  concat('Reviewed ', source.source_kind, ' published by ', source.publisher_name)
from app.salary_benchmarks benchmark
join app.salary_data_sources source on source.id = benchmark.source_id
join app.role_families role on role.id = benchmark.role_family_id
where benchmark.is_current
  and benchmark.review_status = 'approved'
  and source.status = 'enabled'
  and source.reviewed_at is not null
  and source.review_due_at > now();

grant select on api.salary_aggregates to anon, authenticated;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values (
  'salary_source_sync', interval '1 day', interval '36 hours',
  'SalaryPadi salary data operations'
)
on conflict (task_key) do update set
  expected_interval = excluded.expected_interval,
  stale_after = excluded.stale_after,
  owner_label = excluded.owner_label;

comment on table app.salary_data_sources is
  'Reviewed official, licensed, or employer-authorized salary benchmark sources. Draft records are not public or runnable.';
comment on table app.salary_benchmarks is
  'Reviewed external aggregate benchmarks. These rows never satisfy first-party contribution privacy cohorts.';
comment on table private.salary_source_sync_runs is
  'Private operational evidence for source refresh attempts; never public salary evidence.';
comment on table private.salary_source_rejections is
  'Text-free rejection diagnostics for normalized salary source records; raw source values are not retained here.';
