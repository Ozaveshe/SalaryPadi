-- Wire the application job snapshot end to end.
--
-- 20260802120000_application_job_snapshot added the columns and the
-- application layer gained src/lib/career/application-snapshot.ts, but
-- nothing ever wrote or read them: security.upsert_application still
-- inserted only the status fields, and security.get_my_applications still
-- rendered every application from the live job row — the exact behaviour
-- the snapshot exists to stop. This migration completes the write path
-- (capture once at recording time, never overwrite) and the read path
-- (return the stored snapshot beside the live values).
--
-- DEPLOY COUPLING — same rule as 20260728190000_application_cv_in_list:
-- the repository parses application rows with a strict schema, so apply
-- this WITH the deploy that ships the widened schema, not before it. The
-- new web build is safe ahead of this migration: it passes the snapshot
-- argument only after probing, and its schema treats the new columns as
-- optional.

begin;

-- Adding a parameter changes the function signature; drop the old pair so
-- the new defaulted parameter cannot create an ambiguous overload.
drop function if exists api.upsert_application(uuid, text, text, timestamptz);
drop function if exists security.upsert_application(
  uuid, private.application_status, text, timestamptz);

create function security.upsert_application(
  p_job_id uuid,
  p_status private.application_status,
  p_private_notes text default null,
  p_next_action_at timestamptz default null,
  p_job_snapshot jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old_status private.application_status;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_private_notes is not null and char_length(p_private_notes) > 10000 then
    raise exception using errcode = '22023', message = 'private notes are too long';
  end if;
  if p_job_snapshot is not null and (
    jsonb_typeof(p_job_snapshot) <> 'object'
    or octet_length(p_job_snapshot::text) > 16384
  ) then
    raise exception using errcode = '22023', message = 'invalid job snapshot';
  end if;
  if not exists (select 1 from app.jobs where id = p_job_id) then
    raise exception using errcode = '22023', message = 'job does not exist';
  end if;

  select a.id, a.status into v_id, v_old_status
  from private.applications a
  where a.user_id = (select auth.uid()) and a.job_id = p_job_id
  for update;

  if v_id is null then
    insert into private.applications (
      user_id, job_id, status, private_notes, next_action_at, applied_at,
      job_snapshot, snapshot_captured_at
    ) values (
      (select auth.uid()), p_job_id, p_status, p_private_notes, p_next_action_at,
      case when p_status = 'applied' then clock_timestamp() else null end,
      p_job_snapshot,
      case when p_job_snapshot is not null then clock_timestamp() else null end
    ) returning id into v_id;

    insert into private.application_history (
      application_id, user_id, previous_status, new_status
    ) values (v_id, (select auth.uid()), null, p_status);
  else
    update private.applications
    set status = p_status,
        private_notes = p_private_notes,
        next_action_at = p_next_action_at,
        applied_at = case
          when applied_at is null and p_status = 'applied' then clock_timestamp()
          else applied_at
        end,
        -- The snapshot is written once and never updated: a record of what
        -- the person saw must not be refreshed into what the posting says
        -- now. Only an application that never captured one may gain one.
        job_snapshot = coalesce(job_snapshot, p_job_snapshot),
        snapshot_captured_at = case
          when snapshot_captured_at is null and p_job_snapshot is not null
            then clock_timestamp()
          else snapshot_captured_at
        end
    where id = v_id;

    if v_old_status <> p_status then
      insert into private.application_history (
        application_id, user_id, previous_status, new_status
      ) values (v_id, (select auth.uid()), v_old_status, p_status);
    end if;
  end if;
  return v_id;
end;
$$;

create function api.upsert_application(
  p_job_id uuid,
  p_status text,
  p_private_notes text default null,
  p_next_action_at timestamptz default null,
  p_job_snapshot jsonb default null
)
returns uuid language sql security invoker set search_path = ''
as $$
  select security.upsert_application(
    p_job_id, p_status::private.application_status, p_private_notes,
    p_next_action_at, p_job_snapshot
  )
$$;

-- Adding columns to a `returns table` signature is a new signature; drop the
-- old pair first, then recreate in full (pattern of 20260728190000).
drop function if exists api.get_my_applications();
drop function if exists security.get_my_applications();

create function security.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status private.application_status, private_notes text,
  next_action_at timestamptz, updated_at timestamptz,
  cv_id uuid, cv_file_name text,
  job_snapshot jsonb, snapshot_captured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select
    a.id, coalesce(x.job_slug, j.slug), coalesce(x.job_title, j.title),
    coalesce(x.company_name, c.display_name), a.status, a.private_notes,
    a.next_action_at, a.updated_at, a.cv_id, cv.file_name,
    a.job_snapshot, a.snapshot_captured_at
  from private.applications a
  left join private.external_job_snapshots x on x.id = a.external_job_id
  left join app.jobs j on j.id = a.job_id
  left join app.companies c on c.id = j.company_id
  left join private.candidate_cvs cv on cv.id = a.cv_id
  where a.user_id = (select auth.uid())
  order by a.updated_at desc;
end;
$$;

create function api.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status text, private_notes text,
  next_action_at timestamptz, updated_at timestamptz,
  cv_id uuid, cv_file_name text,
  job_snapshot jsonb, snapshot_captured_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select
    a.id, a.job_slug, a.title, a.company_name, a.status::text,
    a.private_notes, a.next_action_at, a.updated_at, a.cv_id, a.cv_file_name,
    a.job_snapshot, a.snapshot_captured_at
  from security.get_my_applications() a
$$;

revoke all on function security.upsert_application(
  uuid, private.application_status, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function api.upsert_application(uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function security.get_my_applications() from public, anon, authenticated;
revoke all on function api.get_my_applications() from public, anon, authenticated;
grant execute on function security.upsert_application(
  uuid, private.application_status, text, timestamptz, jsonb) to authenticated;
grant execute on function api.upsert_application(uuid, text, text, timestamptz, jsonb)
  to authenticated;
grant execute on function security.get_my_applications() to authenticated;
grant execute on function api.get_my_applications() to authenticated;

commit;
