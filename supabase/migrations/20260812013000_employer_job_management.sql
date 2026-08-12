-- Give an employer a private, owner-scoped way to see the listing created
-- from their moderated submission and close it when hiring ends. Closing is
-- terminal: reopening still requires moderation.

create or replace view api.my_employer_job_submissions
with (security_invoker = true, security_barrier = true)
as
select
  submission.id, submission.company_id, submission.company_name,
  submission.title, submission.country_code, submission.work_arrangement,
  submission.employment_type, submission.engagement_type,
  submission.eligibility_scope, submission.salary_min,
  submission.salary_max, submission.currency_code, submission.pay_period,
  submission.application_url, submission.status, submission.submitted_at,
  submission.updated_at, public_job.slug as public_job_slug
from private.employer_job_submissions submission
left join app.job_sources source
  on source.adapter_key = 'salarypadi_employer_submissions'
left join app.jobs public_job
  on public_job.source_id = source.id
 and public_job.external_source_id = submission.id::text
 and public_job.status = 'published'
 and public_job.lifecycle_state <> 'closed'
where submission.submitted_by = (select auth.uid())
  and submission.submission_kind = 'employer';

create or replace function security.close_own_employer_job(
  p_submission_id uuid, p_reason text
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_submission private.employer_job_submissions%rowtype;
  v_job app.jobs%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'closure reason must be between 10 and 500 characters';
  end if;
  select submission.* into v_submission
  from private.employer_job_submissions submission
  where submission.id = p_submission_id
    and submission.submitted_by = (select auth.uid())
    and submission.submission_kind = 'employer'
  for update;
  if not found then return false; end if;
  if v_submission.status <> 'approved' then
    raise exception using errcode = '23514', message = 'only an approved employer listing can be closed';
  end if;
  select job.* into v_job
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where source.adapter_key = 'salarypadi_employer_submissions'
    and job.external_source_id = v_submission.id::text
    and job.status = 'published' and job.lifecycle_state <> 'closed'
  for update of job;
  if not found then return false; end if;
  update app.jobs
  set status = 'expired', lifecycle_state = 'closed',
      lifecycle_reason = 'employer_confirmed_closed',
      updated_at = clock_timestamp()
  where id = v_job.id;
  update private.employer_job_submissions set status = 'removed'
  where id = v_submission.id;
  perform audit.write_event(
    'user', 'employer_job.closed', 'employer_job_submission',
    v_submission.id, 'employer_confirmed_closed',
    jsonb_build_object('submission_status', 'approved', 'job_status', v_job.status),
    jsonb_build_object('submission_status', 'removed', 'job_status', 'expired'),
    array['status', 'lifecycle_state'], null, null,
    jsonb_build_object('job_id', v_job.id, 'reason', v_reason)
  );
  return true;
end;
$$;

create or replace function api.close_my_employer_job(
  p_submission_id uuid, p_reason text
)
returns boolean language sql security definer set search_path = ''
as $$ select security.close_own_employer_job(p_submission_id, p_reason) $$;

revoke all on function security.close_own_employer_job(uuid, text) from public, anon, authenticated;
revoke all on function api.close_my_employer_job(uuid, text) from public, anon;
grant execute on function api.close_my_employer_job(uuid, text) to authenticated;
grant select on api.my_employer_job_submissions to authenticated;
