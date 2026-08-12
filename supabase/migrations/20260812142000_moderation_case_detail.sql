-- Give AAL2 moderators the source record, flag taxonomy and immutable action
-- history needed to make a case decision. User identities and flag detector
-- details stay private; source content is visible because it is the material
-- the moderator must review and, where necessary, redact.

create or replace function api.admin_get_moderation_case(p_case_id uuid)
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
    'case', jsonb_build_object(
      'id', mc.id,
      'state', mc.state,
      'priority', mc.priority,
      'version', mc.version,
      'opened_at', mc.opened_at,
      'closed_at', mc.closed_at
    ),
    'source_type', case
      when c.id is not null then c.kind::text
      when es.id is not null then 'employer_job'
      when rp.id is not null then 'report'
      when cc.id is not null then 'company_claim'
      when ers.id is not null then 'employer_response'
    end,
    'source_payload', case
      when c.kind = 'salary' then to_jsonb(sr) - 'contribution_id'
      when c.kind = 'review' then to_jsonb(cr) - 'contribution_id'
      when c.kind = 'interview' then to_jsonb(ie) - 'contribution_id'
      when c.kind = 'benefits' then to_jsonb(bs) - 'contribution_id'
      when c.kind = 'pay_reliability' then to_jsonb(prs) - 'contribution_id'
      when es.id is not null then to_jsonb(es) - 'submitted_by'
      when rp.id is not null then to_jsonb(rp) - 'reporter_user_id' - 'resolved_by'
      when cc.id is not null then to_jsonb(cc) - 'claimant_user_id' - 'reviewed_by'
      when ers.id is not null then to_jsonb(ers) - 'author_user_id'
      else null
    end,
    'flags', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'kind', f.kind,
          'source', f.source,
          'confidence', f.confidence,
          'created_at', f.created_at,
          'resolved_at', f.resolved_at
        ) order by f.created_at, f.id
      )
      from private.moderation_flags f
      where f.case_id = mc.id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'action', ma.action,
          'actor_role', ma.actor_role,
          'reason_code', ma.reason_code,
          'reason_note', ma.reason_note,
          'previous_state', ma.previous_state,
          'new_state', ma.new_state,
          'changed_fields', ma.changed_fields,
          'linked_case_id', ma.linked_case_id,
          'occurred_at', ma.occurred_at
        ) order by ma.occurred_at, ma.id
      )
      from private.moderation_actions ma
      where ma.case_id = mc.id
    ), '[]'::jsonb)
  )
  into result
  from private.moderation_cases mc
  left join private.contributions c on c.id = mc.contribution_id
  left join private.salary_submissions sr on sr.contribution_id = c.id
  left join private.company_reviews cr on cr.contribution_id = c.id
  left join private.interview_experiences ie on ie.contribution_id = c.id
  left join private.benefit_submissions bs on bs.contribution_id = c.id
  left join private.pay_reliability_submissions prs on prs.contribution_id = c.id
  left join private.employer_job_submissions es on es.id = mc.employer_submission_id
  left join private.reports rp on rp.id = mc.report_id
  left join private.company_claims cc on cc.id = mc.company_claim_id
  left join private.employer_response_submissions ers
    on ers.id = mc.employer_response_submission_id
  where mc.id = p_case_id;

  return result;
end;
$$;

comment on function api.admin_get_moderation_case(uuid) is
  'AAL2 moderator case detail. Returns reviewable source content without user identities or raw detector details.';

revoke all on function api.admin_get_moderation_case(uuid) from public, anon;
grant execute on function api.admin_get_moderation_case(uuid) to authenticated;
