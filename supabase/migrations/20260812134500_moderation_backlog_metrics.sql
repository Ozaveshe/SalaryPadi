-- Give moderators a bounded, privacy-safe queue health receipt. Counts and
-- timestamps are operational evidence; no contribution or report text leaves
-- the private moderation boundary.

create or replace function api.admin_get_moderation_backlog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select security.can_moderate()) then
    raise exception using
      errcode = '42501',
      message = 'moderator role and AAL2 required';
  end if;

  select jsonb_build_object(
    'measured_at', statement_timestamp(),
    'active_count', count(*) filter (where state <> 'closed'),
    'open_count', count(*) filter (where state = 'open'),
    'in_review_count', count(*) filter (where state = 'in_review'),
    'escalated_count', count(*) filter (where state = 'escalated'),
    'unassigned_count', count(*) filter (
      where state <> 'closed' and assigned_to is null
    ),
    'priority_one_count', count(*) filter (
      where state <> 'closed' and priority = 1
    ),
    'older_than_24h_count', count(*) filter (
      where state <> 'closed'
        and opened_at < statement_timestamp() - interval '24 hours'
    ),
    'oldest_opened_at', min(opened_at) filter (where state <> 'closed')
  )
  into result
  from private.moderation_cases;

  return result;
end;
$$;

comment on function api.admin_get_moderation_backlog() is
  'AAL2 moderator queue-health counts and oldest-case timestamp. Returns no case payload or contributor identity.';

revoke all on function api.admin_get_moderation_backlog() from public, anon;
grant execute on function api.admin_get_moderation_backlog() to authenticated;
