begin;

create table if not exists private.employer_response_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  company_claim_id uuid not null references private.company_claims(id) on delete restrict,
  author_user_id uuid not null references private.profiles(user_id) on delete restrict,
  response_kind text not null,
  statement text not null,
  moderated_statement text,
  source_url text,
  state private.contribution_state not null default 'pending',
  version integer not null default 1,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint employer_response_kind check (response_kind in ('factual_correction', 'right_of_reply')),
  constraint employer_response_statement_length check (char_length(statement) between 20 and 3000),
  constraint employer_response_moderated_length check (
    moderated_statement is null or char_length(moderated_statement) between 20 and 3000
  ),
  constraint employer_response_source_https check (source_url is null or source_url ~* '^https://'),
  constraint employer_response_version_positive check (version > 0)
);

create index if not exists employer_response_submissions_queue
  on private.employer_response_submissions (state, submitted_at)
  where state in ('pending', 'in_review', 'revision_requested', 'escalated');

create table if not exists app.employer_responses (
  id uuid primary key default gen_random_uuid(),
  source_submission_id uuid not null unique references private.employer_response_submissions(id) on delete restrict,
  company_id uuid not null references app.companies(id) on delete cascade,
  response_kind text not null,
  statement text not null,
  source_url text,
  publication_status app.record_status not null default 'published',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_responses_kind check (response_kind in ('factual_correction', 'right_of_reply')),
  constraint employer_responses_statement_length check (char_length(statement) between 20 and 3000),
  constraint employer_responses_source_https check (source_url is null or source_url ~* '^https://')
);

alter table private.moderation_cases
  add column if not exists company_claim_id uuid references private.company_claims(id) on delete cascade,
  add column if not exists employer_response_submission_id uuid references private.employer_response_submissions(id) on delete cascade;
alter table private.moderation_cases drop constraint if exists moderation_cases_one_target;
alter table private.moderation_cases
  add constraint moderation_cases_one_target check (
    num_nonnulls(
      contribution_id, report_id, employer_submission_id,
      company_claim_id, employer_response_submission_id
    ) = 1
  );

create unique index if not exists moderation_case_open_company_claim
  on private.moderation_cases (company_claim_id)
  where company_claim_id is not null and state <> 'closed';
create unique index if not exists moderation_case_open_employer_response
  on private.moderation_cases (employer_response_submission_id)
  where employer_response_submission_id is not null and state <> 'closed';

create or replace function security.queue_company_claim_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.moderation_cases (company_claim_id, priority)
  values (new.id, 2)
  on conflict (company_claim_id) where company_claim_id is not null and state <> 'closed'
  do nothing;
  return new;
end;
$$;

drop trigger if exists company_claim_moderation_queue on private.company_claims;
create trigger company_claim_moderation_queue
after insert on private.company_claims
for each row execute function security.queue_company_claim_case();

create or replace function security.queue_employer_response_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_case_id uuid;
begin
  insert into private.moderation_cases (employer_response_submission_id, priority)
  values (new.id, 2)
  returning id into v_case_id;

  if new.statement ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     or new.statement ~ '([+]?[0-9][0-9 .()/-]{7,}[0-9])' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'pii', 'automated', 0.950, '{"rule_version":"employer-response-v1"}'::jsonb);
  end if;
  if new.statement ~* '\m(home address|passport number|bvn|nin)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'doxxing', 'automated', 0.900, '{"rule_version":"employer-response-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if new.statement ~* '\m(kill|murder|bomb|shoot|stab|hurt you)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'threat', 'automated', 0.850, '{"rule_version":"employer-response-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if new.statement ~* '\m(fraud|bribery|embezzlement|assault|sexual harassment|theft|criminal)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'serious_allegation', 'automated', 0.800, '{"rule_version":"employer-response-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if new.statement ~* '(<script|javascript:|data:text/html|onerror\s*=)' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'malicious_text', 'automated', 0.990, '{"rule_version":"employer-response-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists employer_response_moderation_queue
  on private.employer_response_submissions;
create trigger employer_response_moderation_queue
after insert on private.employer_response_submissions
for each row execute function security.queue_employer_response_case();

create or replace function security.submit_company_claim(
  p_company_slug text,
  p_corporate_domain text,
  p_relationship text,
  p_job_title text,
  p_evidence_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_company_id uuid;
  v_domain text := lower(btrim(p_corporate_domain));
  v_email_domain text;
  v_domain_match boolean;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if v_domain !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
     or p_relationship not in ('owner', 'employee', 'authorised_representative')
     or char_length(btrim(p_job_title)) not between 2 and 120
     or char_length(coalesce(p_evidence_reference, '')) > 300 then
    raise exception using errcode = '22023', message = 'invalid company claim';
  end if;
  select c.id into v_company_id
  from app.companies c where c.slug = lower(btrim(p_company_slug))
    and c.record_status = 'published';
  if v_company_id is null then
    raise exception using errcode = 'P0002', message = 'company not found';
  end if;
  select split_part(lower(u.email), '@', 2) into v_email_domain
  from auth.users u where u.id = (select auth.uid());
  v_domain_match := v_email_domain = v_domain and exists (
    select 1 from app.company_domains d
    where d.company_id = v_company_id and d.domain = v_domain and d.is_official
  );
  if exists (
    select 1 from private.company_claims c
    where c.company_id = v_company_id
      and c.claimant_user_id = (select auth.uid())
      and c.status in ('pending', 'in_review', 'verified')
  ) then
    raise exception using errcode = '23505', message = 'an active company claim already exists';
  end if;
  perform security.consume_rate_limit('company_claim_submit', 3, interval '30 days');
  insert into private.company_claims (
    company_id, claimant_user_id, corporate_domain, evidence
  ) values (
    v_company_id, (select auth.uid()), v_domain,
    jsonb_build_object(
      'relationship', p_relationship,
      'job_title', btrim(p_job_title),
      'account_domain_matches_official_domain', v_domain_match,
      'evidence_reference', nullif(btrim(coalesce(p_evidence_reference, '')), '')
    )
  ) returning id into v_id;
  perform audit.write_event(
    'user', 'company_claim.submitted', 'company_claim', v_id,
    'claim_submitted', null, jsonb_build_object('status', 'pending'), array['status'],
    null, null, jsonb_build_object('company_id', v_company_id)
  );
  return v_id;
end;
$$;

create or replace function security.submit_employer_response(
  p_company_slug text,
  p_response_kind text,
  p_statement text,
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_company_id uuid; v_claim_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_response_kind not in ('factual_correction', 'right_of_reply')
     or char_length(btrim(p_statement)) not between 20 and 3000
     or (p_source_url is not null and p_source_url !~* '^https://') then
    raise exception using errcode = '22023', message = 'invalid employer response';
  end if;
  select c.id into v_company_id
  from app.companies c where c.slug = lower(btrim(p_company_slug))
    and c.record_status = 'published';
  select cc.id into v_claim_id
  from private.company_claims cc
  where cc.company_id = v_company_id
    and cc.claimant_user_id = (select auth.uid())
    and cc.status = 'verified'
  order by cc.reviewed_at desc nulls last limit 1;
  if v_claim_id is null then
    raise exception using errcode = '42501', message = 'verified company claim required';
  end if;
  perform security.consume_rate_limit('employer_response_submit', 5, interval '30 days');
  insert into private.employer_response_submissions (
    company_id, company_claim_id, author_user_id,
    response_kind, statement, source_url
  ) values (
    v_company_id, v_claim_id, (select auth.uid()),
    p_response_kind, btrim(p_statement), nullif(btrim(coalesce(p_source_url, '')), '')
  ) returning id into v_id;
  perform audit.write_event(
    'user', 'employer_response.submitted', 'employer_response', v_id,
    'response_submitted', null, jsonb_build_object('state', 'pending'), array['state'],
    null, encode(extensions.digest(btrim(p_statement), 'sha256'), 'hex'),
    jsonb_build_object('company_id', v_company_id)
  );
  return v_id;
end;
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
      )
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
    p_action, p_reason, v_claim.status, v_new, array['status']
  );
  perform audit.write_event(
    'staff', 'company_claim.' || p_action, 'company_claim', p_claim_id, p_action,
    jsonb_build_object('status', v_claim.status), jsonb_build_object('status', v_new),
    array['status'], null, null, jsonb_build_object('company_id', v_claim.company_id)
  );
  return true;
end;
$$;

create or replace function security.transition_employer_response(
  p_case_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text,
  p_public_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.moderation_cases%rowtype;
  v_response private.employer_response_submissions%rowtype;
  v_new private.contribution_state;
  v_statement text;
  v_role private.staff_role;
begin
  if not (select security.can_moderate()) then
    raise exception using errcode = '42501', message = 'moderator role and AAL2 required';
  end if;
  select r.role into v_role from private.user_roles r
  where r.user_id = (select auth.uid()) and r.revoked_at is null
    and r.role in ('moderator', 'admin')
  order by case r.role when 'admin' then 1 else 2 end limit 1;
  select * into v_case from private.moderation_cases where id = p_case_id for update;
  if not found or v_case.employer_response_submission_id is null then
    raise exception using errcode = 'P0002', message = 'employer response case not found';
  end if;
  select * into v_response from private.employer_response_submissions
  where id = v_case.employer_response_submission_id for update;
  if v_response.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale employer response version';
  end if;
  v_new := case
    when p_action = 'claim' and v_response.state = 'pending' then 'in_review'
    when p_action = 'redact' and v_response.state = 'in_review' then 'in_review'
    when p_action = 'approve' and v_response.state in ('in_review', 'escalated') then 'approved'
    when p_action = 'request_revision' and v_response.state = 'in_review' then 'revision_requested'
    when p_action = 'reject' and v_response.state in ('pending', 'in_review', 'escalated') then 'rejected'
    when p_action = 'escalate' and v_response.state = 'in_review' then 'escalated'
    when p_action = 'remove' and v_response.state = 'approved' then 'removed'
    when p_action = 'restore' and v_response.state = 'removed' then 'approved'
    else null
  end;
  if v_new is null then raise exception using errcode = '23514', message = 'invalid employer response transition'; end if;
  if p_action in ('restore') and v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin role required';
  end if;
  if p_action = 'redact' then
    v_statement := btrim(coalesce(p_public_payload ->> 'statement', ''));
    if char_length(v_statement) not between 20 and 3000 then
      raise exception using errcode = '22023', message = 'redacted statement required';
    end if;
  else
    v_statement := coalesce(v_response.moderated_statement, v_response.statement);
  end if;
  update private.employer_response_submissions
  set state = v_new,
      moderated_statement = case when p_action = 'redact' then v_statement else moderated_statement end,
      version = version + 1,
      decided_at = case when v_new in ('approved', 'rejected', 'removed') then clock_timestamp() else decided_at end,
      updated_at = clock_timestamp()
  where id = v_response.id;
  if p_action in ('approve', 'restore') then
    update private.moderation_flags
    set resolved_at = clock_timestamp(), resolved_by = (select auth.uid())
    where case_id = p_case_id and resolved_at is null;
    insert into app.employer_responses (
      source_submission_id, company_id, response_kind, statement,
      source_url, publication_status
    ) values (
      v_response.id, v_response.company_id, v_response.response_kind,
      v_statement, v_response.source_url, 'published'
    ) on conflict (source_submission_id) do update
    set statement = excluded.statement, source_url = excluded.source_url,
        publication_status = 'published', updated_at = clock_timestamp();
  elsif p_action = 'remove' then
    update app.employer_responses set publication_status = 'removed', updated_at = clock_timestamp()
    where source_submission_id = v_response.id;
  end if;
  update private.moderation_cases
  set state = case
        when v_new = 'in_review' then 'in_review'::private.moderation_case_state
        when v_new = 'escalated' then 'escalated'::private.moderation_case_state
        when v_new in ('approved', 'rejected', 'removed') then 'closed'::private.moderation_case_state
        else 'open'::private.moderation_case_state
      end,
      assigned_to = case when p_action = 'claim' then (select auth.uid()) else assigned_to end,
      version = version + 1,
      closed_at = case when v_new in ('approved', 'rejected', 'removed') then clock_timestamp() else null end
  where id = p_case_id;
  insert into private.moderation_actions (
    case_id, actor_user_id, actor_role, action, reason_code, reason_note,
    previous_state, new_state, changed_fields, before_hash, after_hash
  ) values (
    p_case_id, (select auth.uid()), v_role, p_action::private.moderation_action_kind,
    p_action, p_reason, v_response.state, v_new,
    case when p_action = 'redact' then array['statement'] else '{}'::text[] end,
    encode(extensions.digest(v_response.statement, 'sha256'), 'hex'),
    encode(extensions.digest(v_statement, 'sha256'), 'hex')
  );
  perform audit.write_event(
    'staff', 'employer_response.' || p_action, 'employer_response', v_response.id, p_action,
    jsonb_build_object('state', v_response.state), jsonb_build_object('state', v_new),
    case when p_action = 'redact' then array['statement'] else '{}'::text[] end,
    encode(extensions.digest(v_response.statement, 'sha256'), 'hex'),
    encode(extensions.digest(v_statement, 'sha256'), 'hex'),
    jsonb_build_object('company_id', v_response.company_id, 'case_id', p_case_id)
  );
  return true;
end;
$$;

create or replace function api.submit_company_claim(
  p_company_slug text, p_corporate_domain text, p_relationship text,
  p_job_title text, p_evidence_reference text default null
)
returns uuid language sql security definer set search_path = ''
as $$ select security.submit_company_claim(
  p_company_slug, p_corporate_domain, p_relationship, p_job_title, p_evidence_reference
) $$;

create or replace function api.submit_employer_response(
  p_company_slug text, p_response_kind text, p_statement text, p_source_url text default null
)
returns uuid language sql security definer set search_path = ''
as $$ select security.submit_employer_response(
  p_company_slug, p_response_kind, p_statement, p_source_url
) $$;

create or replace function api.admin_list_company_claims()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security definer set search_path = ''
as $$
  select cc.id, left(c.display_name, 300),
    left(concat_ws(' | ', cc.corporate_domain::text, cc.evidence ->> 'relationship'), 500),
    cc.status::text, coalesce(cc.reviewed_at, cc.submitted_at),
    coalesce((cc.evidence ->> 'admin_version')::integer, 1)
  from private.company_claims cc
  join app.companies c on c.id = cc.company_id
  where (select security.can_manage_jobs())
  order by cc.submitted_at desc, cc.id
  limit 200
$$;

create or replace function api.admin_list_employer_responses()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language sql stable security definer set search_path = ''
as $$
  select mc.id, left(c.display_name || ' employer response', 300),
    left(er.response_kind, 500), er.state::text, er.updated_at, er.version
  from private.employer_response_submissions er
  join app.companies c on c.id = er.company_id
  join private.moderation_cases mc on mc.employer_response_submission_id = er.id
  where (select security.can_moderate())
  order by (er.state in ('approved', 'rejected', 'removed')), er.submitted_at, er.id
  limit 200
$$;

create or replace function api.transition_company_claim(
  p_claim_id uuid, p_expected_version integer, p_action text, p_reason text
)
returns boolean language sql security definer set search_path = ''
as $$ select security.transition_company_claim(p_claim_id, p_expected_version, p_action, p_reason) $$;

create or replace function api.transition_employer_response(
  p_case_id uuid, p_expected_version integer, p_action text,
  p_reason text, p_public_payload jsonb default '{}'::jsonb
)
returns boolean language sql security definer set search_path = ''
as $$ select security.transition_employer_response(
  p_case_id, p_expected_version, p_action, p_reason, p_public_payload
) $$;

create or replace view api.employer_responses
with (security_invoker = true, security_barrier = true)
as
select
  er.id, c.slug as company_slug, er.response_kind, er.statement,
  er.source_url, er.published_at, er.updated_at,
  'Verified employer response; community ratings are unchanged'::text as provenance_label
from app.employer_responses er
join app.companies c on c.id = er.company_id
where er.publication_status = 'published' and c.record_status = 'published';

create or replace view api.my_employer_responses
with (security_invoker = true, security_barrier = true)
as
select er.id, c.slug as company_slug, er.response_kind, er.state,
  er.submitted_at, er.decided_at, er.updated_at
from private.employer_response_submissions er
join app.companies c on c.id = er.company_id
where er.author_user_id = (select auth.uid());

drop trigger if exists employer_responses_set_updated_at on app.employer_responses;
create trigger employer_responses_set_updated_at
before update on app.employer_responses
for each row execute function security.set_updated_at();

alter table private.employer_response_submissions enable row level security;
alter table private.employer_response_submissions force row level security;
alter table app.employer_responses enable row level security;
alter table app.employer_responses force row level security;

drop policy if exists employer_response_submissions_author_read on private.employer_response_submissions;
create policy employer_response_submissions_author_read on private.employer_response_submissions
for select to authenticated using (author_user_id = (select auth.uid()));
drop policy if exists employer_response_submissions_staff_read on private.employer_response_submissions;
create policy employer_response_submissions_staff_read on private.employer_response_submissions
for select to authenticated using ((select security.can_moderate()));
drop policy if exists employer_responses_public_read on app.employer_responses;
create policy employer_responses_public_read on app.employer_responses
for select to anon, authenticated using (publication_status = 'published');

grant select on private.employer_response_submissions to authenticated;
grant select on app.employer_responses to anon, authenticated;
grant select on api.employer_responses to anon, authenticated;
grant select on api.my_employer_responses to authenticated;
revoke all on function security.submit_company_claim(text, text, text, text, text) from public, anon, authenticated;
revoke all on function security.submit_employer_response(text, text, text, text) from public, anon, authenticated;
revoke all on function security.transition_company_claim(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function security.transition_employer_response(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function api.submit_company_claim(text, text, text, text, text) from public, anon;
revoke all on function api.submit_employer_response(text, text, text, text) from public, anon;
revoke all on function api.admin_list_company_claims() from public, anon;
revoke all on function api.admin_list_employer_responses() from public, anon;
revoke all on function api.transition_company_claim(uuid, integer, text, text) from public, anon;
revoke all on function api.transition_employer_response(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function api.submit_company_claim(text, text, text, text, text) to authenticated;
grant execute on function api.submit_employer_response(text, text, text, text) to authenticated;
grant execute on function api.admin_list_company_claims() to authenticated;
grant execute on function api.admin_list_employer_responses() to authenticated;
grant execute on function api.transition_company_claim(uuid, integer, text, text) to authenticated;
grant execute on function api.transition_employer_response(uuid, integer, text, text, jsonb) to authenticated;

comment on table app.employer_responses is
  'Moderated employer speech. It never includes author identity and cannot update community reviews, ratings or salary aggregates.';

commit;
