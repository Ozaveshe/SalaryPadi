-- Keep anonymous analytics behind the consent-checking application route.
-- The route supplies only a daily HMAC of the client network address; raw
-- addresses never cross this boundary or enter the database.

create table private.anonymous_rate_limit_windows (
  scope text not null,
  network_key_hash text not null,
  window_started_at timestamptz not null,
  event_count integer not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (scope, network_key_hash, window_started_at),
  constraint anonymous_rate_limit_scope check (
    char_length(scope) between 2 and 80
  ),
  constraint anonymous_rate_limit_network_hash check (
    network_key_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint anonymous_rate_limit_event_count check (
    event_count between 1 and 1000
  ),
  constraint anonymous_rate_limit_window_aligned check (
    window_started_at = date_bin(
      interval '5 minutes',
      window_started_at,
      timestamptz '1970-01-01 00:00:00+00'
    )
  )
);

create index anonymous_rate_limit_windows_retention
  on private.anonymous_rate_limit_windows (window_started_at);

alter table private.anonymous_rate_limit_windows enable row level security;
alter table private.anonymous_rate_limit_windows force row level security;

comment on table private.anonymous_rate_limit_windows is
  'Short-lived fixed-window counters keyed by a server-generated daily HMAC; never stores raw network addresses.';

create or replace function security.consume_anonymous_rate_limit(
  p_scope text,
  p_network_key_hash text,
  p_window_started_at timestamptz,
  p_max_events integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_window timestamptz := date_bin(
    interval '5 minutes',
    clock_timestamp(),
    timestamptz '1970-01-01 00:00:00+00'
  );
  v_count integer;
begin
  perform security.require_service_role();

  if p_scope is null
     or p_scope <> 'analytics_event'
     or p_network_key_hash is null
     or p_network_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_events is null
     or p_max_events not between 1 and 1000
     or p_window_started_at is null
     or p_window_started_at not in (
       v_current_window,
       v_current_window - interval '5 minutes'
     ) then
    raise exception using
      errcode = '22023',
      message = 'invalid anonymous rate limit input';
  end if;

  -- Retain only the short operational window. The HMAC is also salted daily
  -- by the application, so rows cannot be linked across calendar days.
  delete from private.anonymous_rate_limit_windows
  where window_started_at < v_current_window - interval '2 days';

  insert into private.anonymous_rate_limit_windows as windows (
    scope,
    network_key_hash,
    window_started_at,
    event_count
  ) values (
    p_scope,
    p_network_key_hash,
    p_window_started_at,
    1
  )
  on conflict (scope, network_key_hash, window_started_at) do update
  set event_count = windows.event_count + 1,
      updated_at = clock_timestamp()
  where windows.event_count < p_max_events
  returning event_count into v_count;

  if v_count is null then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;
end;
$$;

-- Drift tripwire: src/lib/analytics/catalog.test.ts parses the marked SQL
-- allow-lists below and compares them with the exported TypeScript catalog.
create or replace function security.capture_analytics_event_internal(
  p_event_name text,
  p_route_group text,
  p_network_key_hash text,
  p_window_started_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();

  if p_event_name is null
     or p_route_group is null
     or p_event_name not in (
    -- ANALYTICS_EVENT_ALLOWLIST_BEGIN
    'page_view', 'job_search', 'job_filter_applied', 'job_view',
    'outbound_apply_click', 'job_saved', 'application_created',
    'application_status_changed', 'alert_created', 'salary_search',
    'company_view', 'tool_started', 'tool_completed',
    'contribution_started', 'contribution_submitted', 'content_reported'
    -- ANALYTICS_EVENT_ALLOWLIST_END
  ) or p_route_group not in (
    -- ANALYTICS_ROUTE_GROUP_ALLOWLIST_BEGIN
    '/', '/jobs', '/companies', '/salaries', '/tools', '/about',
    '/methodology', '/trust-and-safety', '/privacy', '/terms', '/auth',
    '/account', '/contribute', '/post-a-job', '/other'
    -- ANALYTICS_ROUTE_GROUP_ALLOWLIST_END
  ) then
    raise exception using errcode = '22023', message = 'analytics event not allowed';
  end if;

  perform security.consume_anonymous_rate_limit(
    'analytics_event',
    p_network_key_hash,
    p_window_started_at,
    120
  );

  insert into private.analytics_daily_counts (
    occurred_on, event_name, route_group, event_count
  ) values (current_date, p_event_name, p_route_group, 1)
  on conflict (occurred_on, event_name, route_group) do update
  set event_count = case
        when private.analytics_daily_counts.event_count >= 1000000
          then 1000000
        else private.analytics_daily_counts.event_count + 1
      end,
      updated_at = clock_timestamp();
end;
$$;

create or replace function api.capture_analytics_event(
  p_event_name text,
  p_route_group text,
  p_network_key_hash text,
  p_window_started_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select security.capture_analytics_event_internal(
    p_event_name,
    p_route_group,
    p_network_key_hash,
    p_window_started_at
  )
$$;

revoke all on table private.anonymous_rate_limit_windows
  from public, anon, authenticated, service_role;
revoke all on function security.consume_anonymous_rate_limit(text,text,timestamptz,integer)
  from public, anon, authenticated;
revoke all on function security.capture_analytics_event_internal(text,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function api.capture_analytics_event(text,text,text,timestamptz)
  from public, anon, authenticated;

-- The exposed wrapper is intentionally security invoker. The trusted service
-- role therefore needs schema resolution in addition to EXECUTE on the two
-- analytics routines; no unrelated routine execution is granted here.
grant usage on schema security to service_role;
grant execute on function security.consume_anonymous_rate_limit(text,text,timestamptz,integer)
  to service_role;
grant execute on function security.capture_analytics_event_internal(text,text,text,timestamptz)
  to service_role;
grant execute on function api.capture_analytics_event(text,text,text,timestamptz)
  to service_role;

revoke all on function api.capture_analytics_event(text,text)
  from public, anon, authenticated, service_role;
drop function api.capture_analytics_event(text,text);
revoke all on function security.capture_analytics_event_internal(text,text)
  from public, anon, authenticated, service_role;
drop function security.capture_analytics_event_internal(text,text);
