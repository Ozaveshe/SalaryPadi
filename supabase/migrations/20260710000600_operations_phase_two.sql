-- SalaryPadi phase-two operational controls: tracked workers, alert delivery,
-- first-party analytics aggregation, and licensed currency-rate provenance.

alter table app.currency_rate_sets
  add column if not exists provider_key text,
  add column if not exists license_url text,
  add column if not exists attribution_text text,
  add column if not exists terms_reviewed_at timestamptz,
  add column if not exists data_period date;

update app.currency_rate_sets
set provider_key = coalesce(provider_key, lower(regexp_replace(provider_name, '[^a-z0-9]+', '_', 'g'))),
    data_period = coalesce(data_period, date_trunc('month', observed_at)::date)
where provider_key is null or data_period is null;

alter table app.currency_rate_sets
  alter column provider_key set not null,
  alter column data_period set not null;

alter table app.currency_rate_sets
  add constraint currency_rate_sets_provider_key_format
    check (provider_key ~ '^[a-z0-9_]+$'),
  add constraint currency_rate_sets_license_https
    check (license_url is null or license_url ~* '^https://'),
  add constraint currency_rate_sets_terms_review_pair
    check (terms_reviewed_at is null or license_url is not null),
  add constraint currency_rate_sets_data_period_month
    check (data_period = date_trunc('month', data_period)::date);

create unique index if not exists currency_rate_sets_provider_period
  on app.currency_rate_sets (provider_key, data_period);

create table if not exists private.worker_schedules (
  task_key text primary key,
  expected_interval interval not null,
  stale_after interval not null,
  owner_label text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_schedules_task_format check (task_key ~ '^[a-z0-9_]+$'),
  constraint worker_schedules_intervals_positive check (
    expected_interval > interval '0 seconds' and stale_after >= expected_interval
  ),
  constraint worker_schedules_owner_length check (char_length(owner_label) between 3 and 160)
);

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values
  ('job_source_sync', interval '3 hours', interval '8 hours', 'Oza - founder and interim source owner'),
  ('alert_delivery', interval '1 hour', interval '3 hours', 'Oza - founder and interim operations owner'),
  ('currency_rates', interval '24 hours', interval '36 hours', 'Oza - founder and interim data-quality owner'),
  ('operations_maintenance', interval '24 hours', interval '36 hours', 'Oza - founder and interim privacy owner')
on conflict (task_key) do update
set expected_interval = excluded.expected_interval,
    stale_after = excluded.stale_after,
    owner_label = excluded.owner_label,
    enabled = true,
    updated_at = clock_timestamp();

create table if not exists private.worker_runs (
  id uuid primary key default gen_random_uuid(),
  task_key text not null references private.worker_schedules(task_key) on delete restrict,
  run_key text not null,
  trigger_kind text not null default 'schedule',
  status text not null default 'running',
  scheduled_for timestamptz,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  deploy_id text,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  unique (task_key, run_key),
  constraint worker_runs_key_length check (char_length(run_key) between 1 and 160),
  constraint worker_runs_trigger check (trigger_kind in ('schedule', 'manual', 'recovery', 'test')),
  constraint worker_runs_status check (status in ('running', 'succeeded', 'failed', 'skipped')),
  constraint worker_runs_completion_pair check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  ),
  constraint worker_runs_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint worker_runs_summary_size check (octet_length(summary::text) <= 16384),
  constraint worker_runs_error_code_format check (
    error_code is null or error_code ~ '^[a-z0-9_]{2,80}$'
  )
);

create index if not exists worker_runs_health
  on private.worker_runs (task_key, started_at desc);

create table if not exists private.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references private.job_alerts(id) on delete cascade,
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  period_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  claim_token uuid,
  matched_job_count integer not null default 0,
  provider_message_id text,
  error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint alert_deliveries_period_unique unique (alert_id, period_key),
  constraint alert_deliveries_period_length check (char_length(period_key) between 8 and 32),
  constraint alert_deliveries_status check (
    status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'dead')
  ),
  constraint alert_deliveries_attempts check (attempt_count between 0 and 3),
  constraint alert_deliveries_match_count check (matched_job_count between 0 and 100),
  constraint alert_deliveries_claim_pair check (
    (status = 'processing' and claimed_at is not null and claim_token is not null)
    or status <> 'processing'
  ),
  constraint alert_deliveries_sent_pair check (
    (status = 'sent' and sent_at is not null) or status <> 'sent'
  ),
  constraint alert_deliveries_error_code_format check (
    error_code is null or error_code ~ '^[a-z0-9_]{2,80}$'
  )
);

create index if not exists alert_deliveries_claimable
  on private.alert_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');

create table if not exists private.analytics_daily_counts (
  occurred_on date not null,
  event_name text not null,
  route_group text not null,
  event_count bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (occurred_on, event_name, route_group),
  constraint analytics_daily_event_format check (event_name ~ '^[a-z0-9_]+$'),
  constraint analytics_daily_route_format check (route_group ~ '^/[a-z0-9/-]*$'),
  constraint analytics_daily_count_positive check (event_count > 0)
);

alter table private.worker_schedules enable row level security;
alter table private.worker_runs enable row level security;
alter table private.alert_deliveries enable row level security;
alter table private.analytics_daily_counts enable row level security;

comment on table private.worker_runs is
  'PII-free operational run evidence. Summaries must contain counts and stable codes only.';
comment on table private.alert_deliveries is
  'Idempotent alert-delivery state. Recipient addresses remain in auth.users and are returned only to service-role claims.';
comment on table private.analytics_daily_counts is
  'Consent-gated, aggregate-only first-party analytics. No user, device, IP, salary, text, or email identifiers.';

insert into app.job_sources (
  adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, allow_public_listing,
  required_destination_kind, refresh_interval, terms_reviewed_at, terms_version
) values (
  'remotive', 'Remotive', 'permitted_api', 'active',
  'https://remotive.com/remote-jobs',
  'https://github.com/remotive-com/remote-jobs-api',
  true, 'Source: Remotive', false, false, false, true,
  'source_url', interval '6 hours',
  timestamptz '2026-07-10 00:00:00+00',
  'remotive-public-api-repository-reviewed-2026-07-10'
)
on conflict (adapter_key) do update
set name = excluded.name,
    source_type = excluded.source_type,
    homepage_url = excluded.homepage_url,
    terms_url = excluded.terms_url,
    attribution_required = excluded.attribution_required,
    attribution_text = excluded.attribution_text,
    may_store_full_description = excluded.may_store_full_description,
    may_index_jobs = excluded.may_index_jobs,
    may_emit_jobposting_schema = excluded.may_emit_jobposting_schema,
    allow_public_listing = excluded.allow_public_listing,
    required_destination_kind = excluded.required_destination_kind,
    refresh_interval = excluded.refresh_interval,
    terms_reviewed_at = excluded.terms_reviewed_at,
    terms_version = excluded.terms_version,
    updated_at = clock_timestamp();

create or replace function security.require_service_role()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
end;
$$;

create or replace function api.worker_start(
  p_task_key text,
  p_run_key text,
  p_scheduled_for timestamptz default null,
  p_deploy_id text default null
)
returns table (run_id uuid, should_run boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform security.require_service_role();
  if char_length(p_run_key) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid run key';
  end if;

  insert into private.worker_runs (
    task_key, run_key, trigger_kind, scheduled_for, deploy_id
  ) values (
    p_task_key, p_run_key,
    case when p_run_key like 'manual:%' then 'manual' else 'schedule' end,
    p_scheduled_for, nullif(left(p_deploy_id, 160), '')
  )
  on conflict (task_key, run_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select r.id into strict v_id
  from private.worker_runs r
  where r.task_key = p_task_key and r.run_key = p_run_key;
  return query select v_id, false;
end;
$$;

create or replace function api.worker_finish(
  p_run_id uuid,
  p_status text,
  p_summary jsonb default '{}'::jsonb,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  perform security.require_service_role();
  if p_status not in ('succeeded', 'failed', 'skipped')
     or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 16384
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$') then
    raise exception using errcode = '22023', message = 'invalid worker result';
  end if;

  update private.worker_runs
  set status = p_status,
      completed_at = clock_timestamp(),
      summary = coalesce(p_summary, '{}'::jsonb),
      error_code = p_error_code
  where id = p_run_id and status = 'running';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create or replace function api.worker_record_source_import(
  p_adapter_key text,
  p_fetched_count integer,
  p_status text,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_import_id uuid;
begin
  perform security.require_service_role();
  if p_status not in ('succeeded', 'failed') or p_fetched_count < 0
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$') then
    raise exception using errcode = '22023', message = 'invalid source result';
  end if;
  select id into strict v_source_id
  from app.job_sources
  where adapter_key = p_adapter_key and status = 'active';

  insert into ingest.import_runs (
    source_id, status, triggered_by, started_at, completed_at,
    fetched_count, unchanged_count, error_count, error_summary
  ) values (
    v_source_id, p_status::ingest.import_status, 'netlify_schedule',
    clock_timestamp(), clock_timestamp(), p_fetched_count,
    case when p_status = 'succeeded' then p_fetched_count else 0 end,
    case when p_status = 'failed' then 1 else 0 end,
    case when p_error_code is null then '{}'::jsonb
         else jsonb_build_object('code', p_error_code) end
  ) returning id into v_import_id;

  if p_status = 'succeeded' then
    update app.job_sources
    set last_successful_import_at = clock_timestamp()
    where id = v_source_id;
  end if;
  return v_import_id;
end;
$$;

create or replace function api.worker_store_inforeuro_rates(
  p_observed_at timestamptz,
  p_source_url text,
  p_rates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id uuid;
  v_period date := date_trunc('month', p_observed_at)::date;
  v_count integer;
begin
  perform security.require_service_role();
  if p_source_url !~ '^https://ec[.]europa[.]eu/budg/inforeuro/'
     or jsonb_typeof(p_rates) <> 'array'
     or jsonb_array_length(p_rates) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'invalid currency source payload';
  end if;

  insert into app.currency_rate_sets (
    provider_key, provider_name, source_url, license_url, attribution_text,
    terms_reviewed_at, observed_at, fetched_at, data_period, status
  ) values (
    'european_commission_inforeuro', 'European Commission InforEuro',
    p_source_url, 'https://commission.europa.eu/legal-notice_en',
    'European Commission InforEuro monthly accounting rates; transformed into cross-rates by SalaryPadi.',
    timestamptz '2026-07-10 00:00:00+00', p_observed_at, clock_timestamp(),
    v_period, 'published'
  )
  on conflict (provider_key, data_period) do update
  set source_url = excluded.source_url,
      license_url = excluded.license_url,
      attribution_text = excluded.attribution_text,
      terms_reviewed_at = excluded.terms_reviewed_at,
      observed_at = excluded.observed_at,
      fetched_at = excluded.fetched_at,
      status = 'published'
  returning id into v_set_id;

  delete from app.currency_rates where rate_set_id = v_set_id;
  insert into app.currency_rates (rate_set_id, base_currency, quote_currency, rate)
  select v_set_id, upper(x.base_currency), upper(x.quote_currency), x.rate
  from jsonb_to_recordset(p_rates) as x(
    base_currency text, quote_currency text, rate numeric
  )
  where x.base_currency is not null and x.quote_currency is not null and x.rate is not null;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_rates) then
    raise exception using errcode = '22023', message = 'invalid currency rate rows';
  end if;
  return v_set_id;
end;
$$;

create or replace function api.worker_claim_alert_deliveries(p_limit integer default 10)
returns table (
  delivery_id uuid,
  claim_token uuid,
  alert_id uuid,
  recipient_email text,
  search_spec jsonb,
  cadence text,
  last_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit not between 1 and 25 then
    raise exception using errcode = '22023', message = 'invalid claim limit';
  end if;

  update private.alert_deliveries d
  set status = case when d.attempt_count >= 3 then 'dead' else 'failed' end,
      next_attempt_at = clock_timestamp(),
      claim_token = null,
      claimed_at = null,
      error_code = 'worker_timeout',
      updated_at = clock_timestamp()
  where d.status = 'processing'
    and d.claimed_at < clock_timestamp() - interval '15 minutes';

  insert into private.alert_deliveries (alert_id, user_id, period_key)
  select a.id, a.user_id,
    case when a.cadence = 'weekly'
      then to_char(date_trunc('week', clock_timestamp()), 'IYYY-"W"IW')
      else to_char(clock_timestamp(), 'YYYY-MM-DD') end
  from private.job_alerts a
  join private.profiles p on p.user_id = a.user_id and p.account_status = 'active'
  join auth.users u on u.id = a.user_id and u.email is not null
  where a.is_enabled
    and (
      a.last_sent_at is null
      or (a.cadence = 'daily' and a.last_sent_at <= clock_timestamp() - interval '23 hours')
      or (a.cadence = 'weekly' and a.last_sent_at <= clock_timestamp() - interval '6 days 23 hours')
    )
  on conflict on constraint alert_deliveries_period_unique do nothing;

  return query
  with candidates as (
    select d.id
    from private.alert_deliveries d
    where d.status in ('pending', 'failed')
      and d.next_attempt_at <= clock_timestamp()
      and d.attempt_count < 3
    order by d.next_attempt_at, d.created_at, d.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.alert_deliveries d
    set status = 'processing',
        attempt_count = d.attempt_count + 1,
        claimed_at = clock_timestamp(),
        claim_token = gen_random_uuid(),
        updated_at = clock_timestamp()
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select c.id, c.claim_token, a.id, u.email::text, a.search_spec,
    a.cadence, a.last_sent_at
  from claimed c
  join private.job_alerts a on a.id = c.alert_id
  join auth.users u on u.id = c.user_id;
end;
$$;

create or replace function api.worker_complete_alert_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_matched_job_count integer default 0,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert_id uuid;
  v_attempts integer;
begin
  perform security.require_service_role();
  if p_outcome not in ('sent', 'skipped', 'failed')
     or p_matched_job_count not between 0 and 100
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{2,80}$') then
    raise exception using errcode = '22023', message = 'invalid alert result';
  end if;

  select d.alert_id, d.attempt_count into v_alert_id, v_attempts
  from private.alert_deliveries d
  where d.id = p_delivery_id and d.status = 'processing'
    and d.claim_token = p_claim_token
  for update;
  if v_alert_id is null then return false; end if;

  update private.alert_deliveries
  set status = case
        when p_outcome = 'failed' and v_attempts >= 3 then 'dead'
        else p_outcome end,
      matched_job_count = p_matched_job_count,
      provider_message_id = case when p_outcome = 'sent'
        then left(p_provider_message_id, 240) else null end,
      error_code = case when p_outcome = 'failed'
        then coalesce(p_error_code, 'provider_error') else null end,
      sent_at = case when p_outcome = 'sent' then clock_timestamp() else null end,
      next_attempt_at = case
        when p_outcome = 'failed' and v_attempts = 1 then clock_timestamp() + interval '15 minutes'
        when p_outcome = 'failed' and v_attempts = 2 then clock_timestamp() + interval '1 hour'
        else next_attempt_at end,
      claim_token = null,
      claimed_at = null,
      updated_at = clock_timestamp()
  where id = p_delivery_id;

  if p_outcome in ('sent', 'skipped') then
    update private.job_alerts
    set last_sent_at = clock_timestamp()
    where id = v_alert_id;
  end if;
  return true;
end;
$$;

create or replace function api.capture_analytics_event(
  p_event_name text,
  p_route_group text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_name not in (
    'page_view', 'job_search', 'job_filter_applied', 'job_view',
    'outbound_apply_click', 'job_saved', 'application_created',
    'application_status_changed', 'alert_created', 'salary_search',
    'company_view', 'tool_started', 'tool_completed',
    'contribution_started', 'contribution_submitted', 'content_reported'
  ) or p_route_group not in (
    '/', '/jobs', '/companies', '/salaries', '/tools', '/about',
    '/methodology', '/trust-and-safety', '/privacy', '/terms', '/auth',
    '/account', '/contribute', '/post-a-job', '/other'
  ) then
    raise exception using errcode = '22023', message = 'analytics event not allowed';
  end if;

  insert into private.analytics_daily_counts (
    occurred_on, event_name, route_group, event_count
  ) values (current_date, p_event_name, p_route_group, 1)
  on conflict (occurred_on, event_name, route_group) do update
  set event_count = private.analytics_daily_counts.event_count + 1,
      updated_at = clock_timestamp();
end;
$$;

create or replace function api.worker_run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_analytics_deleted integer := 0;
  v_deliveries_deleted integer := 0;
  v_runs_deleted integer := 0;
  v_rates_deleted integer := 0;
  v_jobs_expired integer := 0;
  v_interview_queue integer := 0;
  v_salary_run uuid;
  v_company_run uuid;
begin
  perform security.require_service_role();

  delete from private.analytics_daily_counts
  where occurred_on < current_date - 90;
  get diagnostics v_analytics_deleted = row_count;

  delete from private.alert_deliveries
  where status in ('sent', 'skipped', 'dead')
    and updated_at < clock_timestamp() - interval '180 days';
  get diagnostics v_deliveries_deleted = row_count;

  delete from private.worker_runs
  where status <> 'running' and completed_at < clock_timestamp() - interval '180 days';
  get diagnostics v_runs_deleted = row_count;

  delete from app.currency_rate_sets
  where data_period < date_trunc('month', current_date - interval '24 months')::date;
  get diagnostics v_rates_deleted = row_count;

  update app.jobs
  set status = 'expired'
  where status = 'published' and valid_through < current_date;
  get diagnostics v_jobs_expired = row_count;

  if exists (
    select 1 from private.aggregate_refresh_queue
    where metric = 'salary_employer_role_country' and processed_at is null
  ) then
    v_salary_run := security.refresh_salary_aggregates();
  end if;
  if exists (
    select 1 from private.aggregate_refresh_queue
    where metric = 'company_overall_rating' and processed_at is null
  ) then
    v_company_run := security.refresh_company_ratings();
  end if;
  update private.aggregate_refresh_queue
  set processed_at = clock_timestamp()
  where metric = 'interview_aggregate' and processed_at is null;
  get diagnostics v_interview_queue = row_count;

  return jsonb_build_object(
    'analytics_deleted', v_analytics_deleted,
    'deliveries_deleted', v_deliveries_deleted,
    'worker_runs_deleted', v_runs_deleted,
    'rate_sets_deleted', v_rates_deleted,
    'jobs_expired', v_jobs_expired,
    'interview_queue_processed', v_interview_queue,
    'salary_aggregate_run', v_salary_run,
    'company_rating_run', v_company_run
  );
end;
$$;

create or replace function api.get_worker_health()
returns table (
  task_key text,
  owner_label text,
  last_status text,
  last_started_at timestamptz,
  last_success_at timestamptz,
  freshness text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.task_key, s.owner_label,
    latest.status,
    latest.started_at,
    success.completed_at,
    case
      when not s.enabled then 'disabled'
      when success.completed_at is null then 'never'
      when success.completed_at < clock_timestamp() - s.stale_after then 'stale'
      when latest.status = 'failed' then 'degraded'
      else 'healthy'
    end
  from private.worker_schedules s
  left join lateral (
    select r.status, r.started_at
    from private.worker_runs r
    where r.task_key = s.task_key
    order by r.started_at desc, r.id desc
    limit 1
  ) latest on true
  left join lateral (
    select r.completed_at
    from private.worker_runs r
    where r.task_key = s.task_key and r.status = 'succeeded'
    order by r.completed_at desc, r.id desc
    limit 1
  ) success on true
  order by s.task_key
$$;

create or replace view api.current_currency_rates
with (security_invoker = true, security_barrier = true)
as
select r.base_currency, r.quote_currency, r.rate,
  s.provider_key, s.provider_name, s.source_url, s.license_url,
  s.attribution_text, s.observed_at, s.fetched_at, s.data_period
from app.currency_rates r
join app.currency_rate_sets s on s.id = r.rate_set_id
where s.status = 'published'
  and s.id = (
    select x.id from app.currency_rate_sets x
    where x.status = 'published'
    order by x.observed_at desc, x.fetched_at desc, x.id desc
    limit 1
  );

revoke all on table private.worker_schedules from anon, authenticated;
revoke all on table private.worker_runs from anon, authenticated;
revoke all on table private.alert_deliveries from anon, authenticated;
revoke all on table private.analytics_daily_counts from anon, authenticated;

revoke all on function security.require_service_role() from public, anon, authenticated;
revoke all on function api.worker_start(text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function api.worker_finish(uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function api.worker_record_source_import(text,integer,text,text) from public, anon, authenticated;
revoke all on function api.worker_store_inforeuro_rates(timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function api.worker_claim_alert_deliveries(integer) from public, anon, authenticated;
revoke all on function api.worker_complete_alert_delivery(uuid,uuid,text,integer,text,text) from public, anon, authenticated;
revoke all on function api.worker_run_maintenance() from public, anon, authenticated;
revoke all on function api.capture_analytics_event(text,text) from public;
revoke all on function api.get_worker_health() from public;

grant usage on schema api to anon, authenticated, service_role;
grant execute on function security.require_service_role() to service_role;
grant execute on function api.worker_start(text,text,timestamptz,text) to service_role;
grant execute on function api.worker_finish(uuid,text,jsonb,text) to service_role;
grant execute on function api.worker_record_source_import(text,integer,text,text) to service_role;
grant execute on function api.worker_store_inforeuro_rates(timestamptz,text,jsonb) to service_role;
grant execute on function api.worker_claim_alert_deliveries(integer) to service_role;
grant execute on function api.worker_complete_alert_delivery(uuid,uuid,text,integer,text,text) to service_role;
grant execute on function api.worker_run_maintenance() to service_role;
grant execute on function api.capture_analytics_event(text,text) to anon, authenticated;
grant execute on function api.get_worker_health() to anon, authenticated;

grant select on api.current_currency_rates to anon, authenticated;
