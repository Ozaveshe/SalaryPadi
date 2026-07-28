begin;

-- Adds the attached CV to the application list contract.
--
-- SEPARATED FROM THE CV MIGRATION ON PURPOSE: this changes the shape of a
-- contract the running application already consumes. The repository parses
-- application rows with a strict schema, so a deployed build that predates
-- these two columns rejects every row the moment they appear and the tracker
-- degrades for live users.
--
-- Apply this one WITH the deploy that ships the widened schema, not before it.

-- The application list now names which CV was attached. Adding a column to a
-- `returns table` signature is a new signature, so the old pair is dropped
-- first; both are recreated in full below.
drop function if exists api.get_my_applications();
drop function if exists security.get_my_applications();

create or replace function security.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status private.application_status, private_notes text,
  next_action_at timestamptz, updated_at timestamptz,
  cv_id uuid, cv_file_name text
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
    a.next_action_at, a.updated_at, a.cv_id, cv.file_name
  from private.applications a
  left join private.external_job_snapshots x on x.id = a.external_job_id
  left join app.jobs j on j.id = a.job_id
  left join app.companies c on c.id = j.company_id
  left join private.candidate_cvs cv on cv.id = a.cv_id
  where a.user_id = (select auth.uid())
  order by a.updated_at desc;
end;
$$;

create or replace function api.get_my_applications()
returns table (
  id uuid, job_slug text, title text, company_name text,
  status text, private_notes text,
  next_action_at timestamptz, updated_at timestamptz,
  cv_id uuid, cv_file_name text
)
language sql stable security invoker set search_path = ''
as $$
  select
    a.id, a.job_slug, a.title, a.company_name, a.status::text,
    a.private_notes, a.next_action_at, a.updated_at, a.cv_id, a.cv_file_name
  from security.get_my_applications() a
$$;

revoke all on function security.get_my_applications() from public, anon, authenticated;
revoke all on function api.get_my_applications() from public, anon, authenticated;
grant execute on function security.get_my_applications() to authenticated;
grant execute on function api.get_my_applications() to authenticated;


commit;
