-- Give moderators the safety evidence the queue says they are reviewing.
-- Only flag taxonomy and source are exposed here; matched text and flag details
-- remain in the private case record so the list cannot become a PII leak.

create or replace function api.admin_list_moderation()
returns table (
  id uuid,
  title text,
  secondary text,
  status text,
  updated_at timestamptz,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.can_moderate()) then
    raise exception using
      errcode = '42501',
      message = 'moderator role and AAL2 required';
  end if;

  return query
  select
    mc.id,
    left(
      case
        when c.kind = 'salary' then coalesce(sr.company_name_input, 'Private employer') || ' salary'
        when c.kind = 'review' then cr.company_name_input || ' review'
        when c.kind = 'interview' then ie.company_name_input || ' interview'
        when c.kind = 'benefits' then bs.company_name_input || ' benefits'
        when c.kind = 'pay_reliability' then prs.company_name_input || ' pay reliability'
        when es.id is not null then es.company_name || ' - ' || es.title
        when rp.id is not null then rp.category || ' report'
        else 'Moderation case'
      end,
      300
    ),
    left(
      concat_ws(
        ' | ',
        case
          when c.kind = 'salary' then sr.role_title || ' | ' || sr.country_code
          when c.kind = 'review' then cr.role_family_name_input || ' | ' || cr.country_code
          when c.kind = 'interview' then ie.role_family_name_input || ' | ' || ie.country_code
          when c.kind = 'benefits' then bs.country_code || ' | ' || bs.employment_status
          when c.kind = 'pay_reliability' then prs.country_code || ' | ' || prs.employment_status
          when es.id is not null then 'Employer submission | ' || es.status::text
          when rp.id is not null then rp.target_kind::text || ' | ' || rp.target_id
          else null
        end,
        case
          when flags.flag_kinds is null then 'No safety flags'
          else 'Flags: ' || flags.flag_kinds
        end
      ),
      500
    ),
    mc.state::text,
    coalesce(mc.closed_at, mc.opened_at),
    mc.version
  from private.moderation_cases mc
  left join private.contributions c on c.id = mc.contribution_id
  left join private.salary_submissions sr on sr.contribution_id = c.id
  left join private.company_reviews cr on cr.contribution_id = c.id
  left join private.interview_experiences ie on ie.contribution_id = c.id
  left join private.benefit_submissions bs on bs.contribution_id = c.id
  left join private.pay_reliability_submissions prs on prs.contribution_id = c.id
  left join private.employer_job_submissions es on es.id = mc.employer_submission_id
  left join private.reports rp on rp.id = mc.report_id
  left join lateral (
    select string_agg(distinct f.kind::text, ', ' order by f.kind::text) as flag_kinds
    from private.moderation_flags f
    where f.case_id = mc.id
  ) flags on true
  order by (mc.state = 'closed'), mc.priority, mc.opened_at, mc.id
  limit 200;
end;
$$;

comment on function api.admin_list_moderation() is
  'AAL2 moderator queue. Exposes contribution context and flag kinds, never matched text or private flag details.';

revoke all on function api.admin_list_moderation() from public, anon;
grant execute on function api.admin_list_moderation() to authenticated;
