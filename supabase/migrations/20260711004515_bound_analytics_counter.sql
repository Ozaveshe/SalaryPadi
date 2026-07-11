-- Bound the anonymous analytics counter.
--
-- api.capture_analytics_event is deliberately executable by anon (consented
-- first-party analytics with no PII), which means a scripted client can call
-- it directly and inflate daily counts. The key space is fixed (allow-listed
-- event names x route groups), so rows cannot explode, but the per-row count
-- was unbounded. Cap each daily counter at one million events: far above any
-- legitimate daily volume, low enough that scripted inflation cannot
-- overflow the integer column or produce absurd aggregates.

update private.analytics_daily_counts
set event_count = 1000000
where event_count > 1000000;

alter table private.analytics_daily_counts
  drop constraint if exists analytics_daily_count_bounded;
alter table private.analytics_daily_counts
  add constraint analytics_daily_count_bounded check (
    event_count between 1 and 1000000
  );

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
  set event_count = case
        when private.analytics_daily_counts.event_count >= 1000000
          then 1000000
        else private.analytics_daily_counts.event_count + 1
      end,
      updated_at = clock_timestamp();
end;
$$;
