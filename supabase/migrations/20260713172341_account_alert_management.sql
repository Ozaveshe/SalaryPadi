begin;

create or replace function security.update_job_alert(
  p_alert_id uuid,
  p_search_spec jsonb default null,
  p_cadence text default null,
  p_is_enabled boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
  v_cadence text := lower(nullif(btrim(coalesce(p_cadence, '')), ''));
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_search_spec is null and p_cadence is null and p_is_enabled is null then
    raise exception using errcode = '22023', message = 'empty alert update';
  end if;
  if p_search_spec is not null and (
    jsonb_typeof(p_search_spec) is distinct from 'object'
    or not (p_search_spec ? 'schema_version')
    or octet_length(p_search_spec::text) > 16384
  ) then
    raise exception using errcode = '22023', message = 'invalid alert';
  end if;
  if p_cadence is not null and (
    v_cadence is null or v_cadence not in ('daily', 'weekly')
  ) then
    raise exception using errcode = '22023', message = 'invalid alert';
  end if;

  update private.job_alerts as alert
  set name = case
        when p_search_spec is null then alert.name
        else left(
          coalesce(
            nullif(btrim(p_search_spec ->> 'q'), ''),
            'Saved search'
          ),
          120
        )
      end,
      search_spec = coalesce(p_search_spec, alert.search_spec),
      cadence = coalesce(v_cadence, alert.cadence),
      is_enabled = coalesce(p_is_enabled, alert.is_enabled)
  where alert.id = p_alert_id
    and alert.user_id = (select auth.uid());

  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

create or replace function api.update_job_alert(
  alert_id uuid,
  alert_query jsonb default null,
  alert_cadence text default null,
  alert_active boolean default null
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select security.update_job_alert(
    alert_id,
    case
      when alert_query is null then null
      else alert_query || jsonb_build_object('schema_version', 1)
    end,
    alert_cadence,
    alert_active
  )
$$;

create or replace function security.update_community_profile(
  p_display_name text,
  p_state_code text
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select security.upsert_community_member(p_display_name, p_state_code)
$$;

create or replace function api.update_community_profile(
  display_name text,
  state_code text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select security.update_community_profile(display_name, state_code)
$$;

revoke all on function security.update_job_alert(uuid, jsonb, text, boolean)
  from public, anon, authenticated;
revoke all on function security.update_community_profile(text, text)
  from public, anon, authenticated;
revoke all on function api.update_job_alert(uuid, jsonb, text, boolean)
  from public, anon, authenticated;
revoke all on function api.update_community_profile(text, text)
  from public, anon, authenticated;

grant execute on function security.update_job_alert(uuid, jsonb, text, boolean)
  to authenticated;
grant execute on function security.update_community_profile(text, text)
  to authenticated;
grant execute on function api.update_job_alert(uuid, jsonb, text, boolean)
  to authenticated;
grant execute on function api.update_community_profile(text, text)
  to authenticated;

comment on function security.update_job_alert(uuid, jsonb, text, boolean) is
  'Updates only the current active account owner alert; omitted fields retain their stored values.';
comment on function security.update_community_profile(text, text) is
  'Persists the current active account community identity through the existing validated profile upsert.';
comment on function api.update_community_profile(text, text) is
  'Authenticated wrapper for the existing validated community profile upsert.';

commit;
