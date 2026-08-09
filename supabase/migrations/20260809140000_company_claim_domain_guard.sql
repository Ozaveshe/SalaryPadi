-- Make the account-domain evidence do its job in company-claim review.
--
-- submit_company_claim computes whether the claimant's signed-in email
-- domain matches an official company domain and stores the boolean in the
-- claim evidence — and nothing ever read it. The admin queue's secondary
-- line omitted it, and transition_company_claim allowed 'verify'
-- unconditionally, so a personal-email claim could be verified without the
-- reviewer ever seeing the one signal the product collects for exactly this
-- decision. Verification is what unlocks employer speech (responses,
-- corrections), so this is a trust gate, not cosmetics.
--
-- After this migration:
--   * the queue's secondary line states the match result in plain language;
--   * 'verify' on a claim without an official-domain match requires the
--     reason to begin with "override:domain_mismatch", and the override is
--     recorded in the claim evidence. The override path exists because
--     legitimate claims can arrive before the company's official domain is
--     registered — but it must be a deliberate, recorded decision, never
--     the default.
--
-- Apply timing: standalone; signatures unchanged. Safe before or after the
-- accompanying deploy.

begin;

create or replace function api.admin_list_company_claims()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security definer set search_path = ''
as $$
  select cc.id, left(c.display_name, 300),
    left(concat_ws(' | ',
      cc.corporate_domain::text,
      cc.evidence ->> 'relationship',
      case
        when coalesce((cc.evidence ->> 'account_domain_matches_official_domain')::boolean, false)
          then 'account email matches the official domain'
        else 'account email does NOT match an official domain'
      end
    ), 500),
    cc.status::text, coalesce(cc.reviewed_at, cc.submitted_at),
    coalesce((cc.evidence ->> 'admin_version')::integer, 1)
  from private.company_claims cc
  join app.companies c on c.id = cc.company_id
  where (select security.can_manage_jobs())
  order by cc.submitted_at desc, cc.id
  limit 200
$$;

create or replace function security.transition_company_claim(
  p_claim_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim private.company_claims%rowtype;
  v_new private.company_claim_status;
  v_case_id uuid;
  v_role private.staff_role;
  v_domain_match boolean;
  v_domain_override boolean := false;
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  select * into v_claim from private.company_claims where id = p_claim_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'claim not found'; end if;
  if coalesce((v_claim.evidence ->> 'admin_version')::integer, 1) <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale company claim version';
  end if;
  select mc.id into v_case_id
  from private.moderation_cases mc
  where mc.company_claim_id = p_claim_id and mc.state <> 'closed'
  order by mc.opened_at desc limit 1;
  if v_case_id is null then
    raise exception using errcode = 'P0002', message = 'company claim moderation case not found';
  end if;
  select r.role into v_role
  from private.user_roles r
  where r.user_id = (select auth.uid()) and r.revoked_at is null
    and r.role in ('data_quality', 'admin')
  order by case r.role when 'admin' then 1 else 2 end limit 1;

  v_domain_match := coalesce(
    (v_claim.evidence ->> 'account_domain_matches_official_domain')::boolean,
    false
  );
  if p_action = 'verify' and not v_domain_match then
    if p_reason !~* '^override:domain_mismatch' then
      raise exception using errcode = '23514', message =
        'claim account email does not match an official company domain; '
        'to verify anyway, begin the reason with override:domain_mismatch '
        'followed by the out-of-band evidence';
    end if;
    v_domain_override := true;
  end if;

  v_new := case
    when p_action = 'claim' and v_claim.status = 'pending' then 'in_review'
    when p_action = 'verify' and v_claim.status in ('pending', 'in_review') then 'verified'
    when p_action = 'reject' and v_claim.status in ('pending', 'in_review') then 'rejected'
    when p_action = 'revoke' and v_claim.status = 'verified' then 'revoked'
    else null
  end;
  if v_new is null then raise exception using errcode = '23514', message = 'invalid company claim transition'; end if;
  update private.company_claims
  set status = v_new,
      reviewed_at = case when v_new in ('verified', 'rejected', 'revoked') then clock_timestamp() else reviewed_at end,
      reviewed_by = case when v_new in ('verified', 'rejected', 'revoked') then (select auth.uid()) else reviewed_by end,
      resolution_note = p_reason,
      evidence = evidence || jsonb_build_object(
        'admin_version', p_expected_version + 1,
        'decision_reason_code', p_action
      ) || case when v_domain_override
        then jsonb_build_object('domain_match_override', true)
        else '{}'::jsonb
      end
  where id = p_claim_id;
  if v_new = 'verified' then
    insert into private.company_memberships (
      user_id, company_id, role, status, corporate_domain, verified_at, verified_by
    ) values (
      v_claim.claimant_user_id, v_claim.company_id, 'representative', 'verified',
      v_claim.corporate_domain, clock_timestamp(), (select auth.uid())
    ) on conflict (user_id, company_id, role) do update
    set status = 'verified', corporate_domain = excluded.corporate_domain,
        verified_at = excluded.verified_at, verified_by = excluded.verified_by,
        revoked_at = null;
  elsif v_new = 'revoked' then
    update private.company_memberships
    set status = 'revoked', revoked_at = clock_timestamp()
    where user_id = v_claim.claimant_user_id and company_id = v_claim.company_id;
  end if;
  update private.moderation_cases
  set state = case when v_new = 'in_review' then 'in_review'::private.moderation_case_state else 'closed'::private.moderation_case_state end,
      assigned_to = coalesce(assigned_to, (select auth.uid())), version = version + 1,
      closed_at = case when v_new in ('verified', 'rejected', 'revoked') then clock_timestamp() else null end
  where company_claim_id = p_claim_id and state <> 'closed';
  insert into private.moderation_actions (
    case_id, actor_user_id, actor_role, action, reason_code, reason_note,
    previous_state, new_state, changed_fields
  ) values (
    v_case_id, (select auth.uid()), v_role,
    case p_action
      when 'verify' then 'approve'::private.moderation_action_kind
      when 'revoke' then 'remove'::private.moderation_action_kind
      else p_action::private.moderation_action_kind
    end,
    p_action, p_reason, null, null, array['status']
  );
  perform audit.write_event(
    'staff', 'company_claim.' || p_action, 'company_claim', p_claim_id, p_action,
    jsonb_build_object('status', v_claim.status), jsonb_build_object('status', v_new),
    array['status'], null, null,
    jsonb_build_object(
      'company_id', v_claim.company_id,
      'domain_match_override', v_domain_override
    )
  );
  return true;
end;
$$;

commit;
