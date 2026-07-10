-- Keep the two intentionally public operational RPCs out of the exposed
-- SECURITY DEFINER surface. The api schema contains invoker-only wrappers;
-- the minimum privileged implementation lives in the non-exposed security
-- schema with explicit grants.

create or replace function security.capture_analytics_event_internal(
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

create or replace function api.capture_analytics_event(
  p_event_name text,
  p_route_group text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select security.capture_analytics_event_internal(p_event_name, p_route_group)
$$;

create or replace function security.get_worker_health_internal()
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
security invoker
set search_path = ''
as $$
  select * from security.get_worker_health_internal()
$$;

revoke all on function security.capture_analytics_event_internal(text,text) from public, anon, authenticated;
revoke all on function security.get_worker_health_internal() from public, anon, authenticated;
revoke all on function api.capture_analytics_event(text,text) from public, anon, authenticated;
revoke all on function api.get_worker_health() from public, anon, authenticated;

grant execute on function security.capture_analytics_event_internal(text,text) to anon, authenticated;
grant execute on function security.get_worker_health_internal() to anon, authenticated;
grant execute on function api.capture_analytics_event(text,text) to anon, authenticated;
grant execute on function api.get_worker_health() to anon, authenticated;

