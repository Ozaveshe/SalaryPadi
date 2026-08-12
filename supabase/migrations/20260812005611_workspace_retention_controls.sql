-- User-controlled retention for the candidate workspace.
--
-- The preference deliberately covers only records the candidate manages as a
-- workspace: saved jobs, applications (and their cascading history), and job
-- alerts. CV objects, contribution evidence, moderation records and public
-- aggregates have different deletion obligations and are not silently folded
-- into this policy.

begin;

alter type app.notification_kind
  add value if not exists 'retention_warning';

alter table private.profiles
  add column if not exists workspace_retention_policy text not null default 'manual',
  add column if not exists workspace_retention_changed_at timestamptz not null default now(),
  add column if not exists workspace_retention_grace_until timestamptz;

alter table private.profiles
  drop constraint if exists profiles_workspace_retention_policy;
alter table private.profiles
  add constraint profiles_workspace_retention_policy check (
    workspace_retention_policy in ('manual', 'days_90', 'days_365')
  );

alter table private.profiles
  drop constraint if exists profiles_workspace_retention_grace;
alter table private.profiles
  add constraint profiles_workspace_retention_grace check (
    (workspace_retention_policy = 'manual'
      and workspace_retention_grace_until is null)
    or (workspace_retention_policy <> 'manual'
      and workspace_retention_grace_until is not null)
  );

comment on column private.profiles.workspace_retention_policy is
  'Owner choice for saved jobs, applications/history and job alerts only: manual, days_90 or days_365.';
comment on column private.profiles.workspace_retention_grace_until is
  'Finite retention cannot delete anything before this 30-day warning window ends.';

create or replace function security.workspace_retention_interval(p_policy text)
returns interval
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_policy
    when 'days_90' then interval '90 days'
    when 'days_365' then interval '365 days'
    else null
  end
$$;

create or replace function api.get_my_workspace_retention()
returns table (
  policy text,
  retention_days integer,
  grace_until timestamptz,
  next_deletion_at timestamptz,
  affected_records integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.workspace_retention_policy,
    case profile.workspace_retention_policy
      when 'days_90' then 90
      when 'days_365' then 365
      else null
    end,
    profile.workspace_retention_grace_until,
    case
      when profile.workspace_retention_policy = 'manual'
        or records.oldest_at is null then null
      else greatest(
        profile.workspace_retention_grace_until,
        records.oldest_at
          + security.workspace_retention_interval(
              profile.workspace_retention_policy
            )
      )
    end,
    case when profile.workspace_retention_policy = 'manual'
      then 0 else records.record_count end
  from private.profiles profile
  cross join lateral (
    select min(recorded_at) as oldest_at, count(*)::integer as record_count
    from (
      select saved.created_at as recorded_at
      from private.saved_jobs saved
      where saved.user_id = profile.user_id
      union all
      select application.updated_at
      from private.applications application
      where application.user_id = profile.user_id
      union all
      select alert.updated_at
      from private.job_alerts alert
      where alert.user_id = profile.user_id
    ) workspace_records
  ) records
  where profile.user_id = (select auth.uid())
    and profile.account_status = 'active'
$$;

create or replace function api.set_my_workspace_retention(p_policy text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous text;
begin
  if p_policy not in ('manual', 'days_90', 'days_365') then
    raise exception using errcode = '22023',
      message = 'invalid workspace retention policy';
  end if;

  select profile.workspace_retention_policy into v_previous
  from private.profiles profile
  where profile.user_id = v_user_id
    and profile.account_status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'active account required';
  end if;
  if v_previous = p_policy then return false; end if;

  update private.profiles profile
  set workspace_retention_policy = p_policy,
      workspace_retention_changed_at = clock_timestamp(),
      workspace_retention_grace_until = case
        when p_policy = 'manual' then null
        else clock_timestamp() + interval '30 days'
      end,
      updated_at = clock_timestamp()
  where profile.user_id = v_user_id;

  perform audit.write_event(
    'user', 'workspace_retention.changed', 'profile', v_user_id,
    'owner_preference',
    jsonb_build_object('policy', v_previous),
    jsonb_build_object('policy', p_policy),
    array['workspace_retention_policy'],
    p_actor_user_id => v_user_id
  );
  return true;
end;
$$;

create or replace function api.worker_run_workspace_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warnings integer := 0;
  v_saved_deleted integer := 0;
  v_applications_deleted integer := 0;
  v_alerts_deleted integer := 0;
  v_snapshots_deleted integer := 0;
begin
  perform security.require_service_role();

  with candidate_deletions as (
    select profile.user_id,
      greatest(
        profile.workspace_retention_grace_until,
        records.oldest_at
          + security.workspace_retention_interval(
              profile.workspace_retention_policy
            )
      ) as purge_at
    from private.profiles profile
    cross join lateral (
      select min(recorded_at) as oldest_at
      from (
        select saved.created_at as recorded_at
        from private.saved_jobs saved
        where saved.user_id = profile.user_id
        union all
        select application.updated_at
        from private.applications application
        where application.user_id = profile.user_id
        union all
        select alert.updated_at
        from private.job_alerts alert
        where alert.user_id = profile.user_id
      ) workspace_records
    ) records
    where profile.account_status = 'active'
      and profile.workspace_retention_policy <> 'manual'
      and records.oldest_at is not null
  )
  insert into private.notifications (
    user_id, kind, title, body, href, dedupe_key
  )
  select candidate.user_id, 'retention_warning'::app.notification_kind,
    'Workspace records scheduled for deletion',
    'Your retention setting will delete eligible saved jobs, application history and job alerts on '
      || to_char(candidate.purge_at at time zone 'UTC', 'DD Mon YYYY')
      || '. Change the setting before then if you want to keep them.',
    '/account',
    'workspace-retention:'
      || to_char(candidate.purge_at at time zone 'UTC', 'YYYY-MM-DD')
  from candidate_deletions candidate
  where candidate.purge_at > clock_timestamp()
    and candidate.purge_at <= clock_timestamp() + interval '30 days'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_warnings = row_count;

  delete from private.saved_jobs saved
  using private.profiles profile
  where profile.user_id = saved.user_id
    and profile.workspace_retention_policy <> 'manual'
    and profile.workspace_retention_grace_until <= clock_timestamp()
    and saved.created_at <= clock_timestamp()
      - security.workspace_retention_interval(
          profile.workspace_retention_policy
        );
  get diagnostics v_saved_deleted = row_count;

  delete from private.applications application
  using private.profiles profile
  where profile.user_id = application.user_id
    and profile.workspace_retention_policy <> 'manual'
    and profile.workspace_retention_grace_until <= clock_timestamp()
    and application.updated_at <= clock_timestamp()
      - security.workspace_retention_interval(
          profile.workspace_retention_policy
        );
  get diagnostics v_applications_deleted = row_count;

  delete from private.job_alerts alert
  using private.profiles profile
  where profile.user_id = alert.user_id
    and profile.workspace_retention_policy <> 'manual'
    and profile.workspace_retention_grace_until <= clock_timestamp()
    and alert.updated_at <= clock_timestamp()
      - security.workspace_retention_interval(
          profile.workspace_retention_policy
        );
  get diagnostics v_alerts_deleted = row_count;

  delete from private.external_job_snapshots snapshot
  using private.profiles profile
  where profile.user_id = snapshot.owner_user_id
    and profile.workspace_retention_policy <> 'manual'
    and profile.workspace_retention_grace_until <= clock_timestamp()
    and snapshot.updated_at <= clock_timestamp()
      - security.workspace_retention_interval(
          profile.workspace_retention_policy
        )
    and not exists (
      select 1 from private.saved_jobs saved
      where saved.external_job_id = snapshot.id
    )
    and not exists (
      select 1 from private.applications application
      where application.external_job_id = snapshot.id
    );
  get diagnostics v_snapshots_deleted = row_count;

  return jsonb_build_object(
    'retention_warnings_created', v_warnings,
    'retention_saved_jobs_deleted', v_saved_deleted,
    'retention_applications_deleted', v_applications_deleted,
    'retention_alerts_deleted', v_alerts_deleted,
    'retention_orphan_snapshots_deleted', v_snapshots_deleted
  );
end;
$$;

revoke all on function security.workspace_retention_interval(text)
  from public, anon, authenticated, service_role;
revoke all on function api.get_my_workspace_retention()
  from public, anon;
grant execute on function api.get_my_workspace_retention()
  to authenticated;
revoke all on function api.set_my_workspace_retention(text)
  from public, anon;
grant execute on function api.set_my_workspace_retention(text)
  to authenticated;
revoke all on function api.worker_run_workspace_retention()
  from public, anon, authenticated;
grant execute on function api.worker_run_workspace_retention()
  to service_role;

commit;
