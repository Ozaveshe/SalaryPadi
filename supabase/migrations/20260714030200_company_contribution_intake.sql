begin;

do $$
begin
  create type private.contribution_verification_level as enum (
    'account_verified',
    'work_domain_verified',
    'community_corroborated',
    'document_verified_later',
    'unverified_moderated'
  );
exception when duplicate_object then null;
end;
$$;

create table if not exists app.contribution_verification_programs (
  level private.contribution_verification_level primary key,
  enabled boolean not null,
  evidence_policy text not null,
  last_reviewed_at date not null,
  disabled_reason text,
  constraint contribution_verification_program_reason check (
    enabled or char_length(coalesce(disabled_reason, '')) >= 10
  )
);

insert into app.contribution_verification_programs (
  level, enabled, evidence_policy, last_reviewed_at, disabled_reason
)
values
  ('account_verified', true, 'Authenticated non-anonymous SalaryPadi account.', date '2026-07-14', null),
  ('work_domain_verified', true, 'Human-approved company claim plus matching official domain.', date '2026-07-14', null),
  ('community_corroborated', true, 'Independent approved submissions agree above the configured cohort.', date '2026-07-14', null),
  ('document_verified_later', false, 'No document upload or storage is accepted.', date '2026-07-14', 'Secure redaction, encryption, retention, deletion, access control and incident response are not reviewed.'),
  ('unverified_moderated', true, 'Human-moderated contribution without stronger evidence.', date '2026-07-14', null)
on conflict (level) do update
set enabled = excluded.enabled,
    evidence_policy = excluded.evidence_policy,
    last_reviewed_at = excluded.last_reviewed_at,
    disabled_reason = excluded.disabled_reason;

create table if not exists private.contribution_drafts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references private.profiles(user_id) on delete cascade,
  kind private.contribution_kind not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  unique (author_user_id, kind),
  constraint contribution_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint contribution_drafts_payload_size check (octet_length(payload::text) <= 65536),
  constraint contribution_drafts_retention check (expires_at <= created_at + interval '90 days')
);

create table if not exists private.contribution_verifications (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references private.contributions(id) on delete cascade,
  level private.contribution_verification_level not null,
  status text not null default 'active',
  evidence_reference text,
  verified_by uuid references private.profiles(user_id) on delete set null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contribution_id, level),
  constraint contribution_verification_status check (status in ('active', 'expired', 'revoked')),
  constraint contribution_verification_reference_length check (
    evidence_reference is null or char_length(evidence_reference) <= 300
  )
);

create table if not exists private.contribution_abuse_signals (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  daily_network_key_hash text,
  content_hash text not null,
  submission_window_start timestamptz not null,
  signal_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint contribution_abuse_network_hash check (
    daily_network_key_hash is null or daily_network_key_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint contribution_abuse_content_hash check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint contribution_abuse_retention check (expires_at <= created_at + interval '30 days')
);

create index if not exists contribution_abuse_network_window
  on private.contribution_abuse_signals (daily_network_key_hash, submission_window_start)
  where daily_network_key_hash is not null;
create unique index if not exists moderation_flags_automatic_once
  on private.moderation_flags (case_id, kind, source)
  where source = 'automated';

create table if not exists private.benefit_submissions (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  company_name_input text not null,
  country_code text not null,
  employment_status text not null,
  benefits jsonb not null,
  overtime_expectation text not null,
  weekend_work text not null,
  observed_month date not null default date_trunc('month', current_date)::date,
  constraint benefit_submissions_company_length check (char_length(company_name_input) between 2 and 180),
  constraint benefit_submissions_country check (country_code ~ '^[A-Z]{2}$'),
  constraint benefit_submissions_status check (employment_status in ('current', 'former')),
  constraint benefit_submissions_benefits_object check (jsonb_typeof(benefits) = 'object'),
  constraint benefit_submissions_benefits_size check (octet_length(benefits::text) <= 8192),
  constraint benefit_submissions_overtime check (overtime_expectation in ('rare', 'sometimes', 'frequent', 'unclear')),
  constraint benefit_submissions_weekend check (weekend_work in ('never', 'sometimes', 'frequent', 'unclear'))
);

create table if not exists private.pay_reliability_submissions (
  contribution_id uuid primary key references private.contributions(id) on delete cascade,
  company_id uuid references app.companies(id) on delete set null,
  company_name_input text not null,
  country_code text not null,
  employment_status text not null,
  observation_window text not null,
  on_time_frequency text not null,
  longest_delay text not null,
  arrears_resolved text not null,
  fx_policy text,
  observed_month date not null default date_trunc('month', current_date)::date,
  constraint pay_reliability_company_length check (char_length(company_name_input) between 2 and 180),
  constraint pay_reliability_country check (country_code ~ '^[A-Z]{2}$'),
  constraint pay_reliability_status check (employment_status in ('current', 'former')),
  constraint pay_reliability_window check (observation_window in ('under_3_months', '3_to_6_months', '6_to_12_months', 'over_12_months')),
  constraint pay_reliability_frequency check (on_time_frequency in ('always_on_time', 'usually_on_time', 'sometimes_late', 'often_late')),
  constraint pay_reliability_delay check (longest_delay in ('none', 'under_1_week', '1_to_4_weeks', 'over_1_month')),
  constraint pay_reliability_arrears check (arrears_resolved in ('not_applicable', 'yes', 'partly', 'no', 'unclear')),
  constraint pay_reliability_fx_length check (fx_policy is null or char_length(fx_policy) <= 500)
);

alter table app.company_benefits
  add column if not exists source_month_from date,
  add column if not exists source_month_to date,
  add column if not exists verification_mix jsonb not null default '{}'::jsonb;

create table if not exists app.pay_reliability_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  country_code text not null,
  sample_size integer not null,
  dominant_pattern text not null,
  source_month_from date not null,
  source_month_to date not null,
  verification_mix jsonb not null default '{}'::jsonb,
  confidence_label text not null,
  is_current boolean not null default true,
  is_released boolean not null default false,
  computed_at timestamptz not null default now(),
  constraint pay_reliability_snapshot_country check (country_code ~ '^[A-Z]{2}$'),
  constraint pay_reliability_snapshot_sample check (sample_size >= 5),
  constraint pay_reliability_snapshot_pattern check (dominant_pattern in ('always_on_time', 'usually_on_time', 'sometimes_late', 'often_late')),
  constraint pay_reliability_snapshot_dates check (source_month_to >= source_month_from),
  constraint pay_reliability_snapshot_mix check (jsonb_typeof(verification_mix) = 'object')
);

create unique index if not exists pay_reliability_snapshot_current
  on app.pay_reliability_snapshots (company_id, country_code)
  where is_current;

insert into app.privacy_rule_versions (
  metric, version, min_distinct_contributors, min_range_contributors,
  max_age_months, minimum_publication_lag, effective_at, methodology_note, is_active
)
values
  ('company_benefit_aggregate', 1, 5, 5, 36, interval '24 hours', timestamptz '2026-07-14 00:00:00+00', 'Publish a benefit only after five independent approved first-party contributors report it.', true),
  ('pay_reliability_aggregate', 1, 5, 10, 24, interval '24 hours', timestamptz '2026-07-14 00:00:00+00', 'Publish a coarse dominant pattern only after five independent approved first-party contributors.', true)
on conflict (metric, version) do nothing;

create or replace function security.reject_document_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.level = 'document_verified_later' then
    raise exception using
      errcode = '23514',
      message = 'document verification is disabled pending reviewed secure handling controls';
  end if;
  return new;
end;
$$;

drop trigger if exists contribution_document_verification_disabled
  on private.contribution_verifications;
create trigger contribution_document_verification_disabled
before insert or update on private.contribution_verifications
for each row execute function security.reject_document_verification();

create or replace function security.contains_prohibited_company_evidence(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_payload::text ~* '"(payslip|pay_slip|document|attachment|verification_evidence|work_email)"[[:space:]]*:', false)
$$;

create or replace function security.register_contribution_intake(
  p_contribution_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
  v_text text := '';
  v_network_hash text;
  v_client_flag text;
  v_content_hash text;
  v_company_id uuid;
  v_window timestamptz := date_trunc('hour', clock_timestamp());
begin
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid contribution intake payload';
  end if;
  if not exists (
    select 1 from private.contributions c
    where c.id = p_contribution_id and c.contributor_user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'contribution ownership required';
  end if;
  select c.content_hash into v_content_hash
  from private.contributions c where c.id = p_contribution_id;
  select mc.id into v_case_id
  from private.moderation_cases mc
  where mc.contribution_id = p_contribution_id and mc.state <> 'closed';
  if v_case_id is null then
    raise exception using errcode = 'P0002', message = 'contribution moderation case missing';
  end if;

  v_network_hash := nullif(p_payload #>> '{_intake,daily_network_key_hash}', '');
  if v_network_hash is not null and v_network_hash !~ '^[0-9a-f]{64}$' then
    v_network_hash := null;
  end if;
  insert into private.contribution_abuse_signals (
    contribution_id, daily_network_key_hash, content_hash,
    submission_window_start, signal_version
  ) values (
    p_contribution_id, v_network_hash, v_content_hash,
    v_window, 'company-intake-v1'
  )
  on conflict (contribution_id) do nothing;

  insert into private.contribution_verifications (contribution_id, level)
  values (p_contribution_id, 'account_verified')
  on conflict (contribution_id, level) do nothing;

  select coalesce(s.company_id, r.company_id, i.company_id, b.company_id, pr.company_id)
  into v_company_id
  from private.contributions c
  left join private.salary_submissions s on s.contribution_id = c.id
  left join private.company_reviews r on r.contribution_id = c.id
  left join private.interview_experiences i on i.contribution_id = c.id
  left join private.benefit_submissions b on b.contribution_id = c.id
  left join private.pay_reliability_submissions pr on pr.contribution_id = c.id
  where c.id = p_contribution_id;
  if v_company_id is not null and exists (
    select 1 from private.company_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = v_company_id and m.status = 'verified'
  ) then
    insert into private.contribution_verifications (contribution_id, level)
    values (p_contribution_id, 'work_domain_verified')
    on conflict (contribution_id, level) do nothing;
  end if;

  select coalesce(string_agg(value, ' '), '') into v_text
  from jsonb_each_text(p_payload - '_intake');

  if v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     or v_text ~ '([+]?[0-9][0-9 .()/-]{7,}[0-9])' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'pii', 'automated', 0.950, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '\m(home address|residential address|passport number|bank verification number|national identification number|bvn|nin)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'doxxing', 'automated', 0.900, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '\m(kill|murder|bomb|shoot|stab|hurt you|burn down)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'threat', 'automated', 0.850, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '\m(race|tribe|religion|ethnicity|nationality)\M.{0,40}\m(inferior|vermin|subhuman|animals)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'hate_speech', 'automated', 0.800, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '\m(confidential|nda|non-disclosure|password|secret key|exact test answer|proprietary answer)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'confidential_material', 'automated', 0.800, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '\m(fraud|bribery|embezzlement|assault|sexual harassment|stole|theft|criminal)\M' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'serious_allegation', 'automated', 0.800, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if v_text ~* '(<script|javascript:|data:text/html|onerror\s*=|onload\s*=)' then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'malicious_text', 'automated', 0.990, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;
  if exists (
    select 1 from private.contributions c
    where c.id <> p_contribution_id and c.content_hash = v_content_hash
      and c.state not in ('rejected', 'removed')
  ) then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'duplicate', 'automated', 1.000, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;

  if jsonb_typeof(p_payload #> '{_intake,flags}') = 'array' then
    for v_client_flag in
      select jsonb_array_elements_text(p_payload #> '{_intake,flags}')
    loop
      if v_client_flag in (
        'pii', 'doxxing', 'threat', 'hate_speech', 'duplicate',
        'coordinated_campaign', 'confidential_material',
        'serious_allegation', 'malicious_text'
      ) then
        insert into private.moderation_flags (case_id, kind, source, confidence, details)
        values (
          v_case_id, v_client_flag::private.moderation_flag_kind,
          'automated', 0.750, '{"rule_version":"company-intake-v1"}'::jsonb
        ) on conflict (case_id, kind, source) where source = 'automated' do nothing;
      end if;
    end loop;
  end if;

  if v_network_hash is not null and (
    select count(*) >= 4
    from private.contribution_abuse_signals s
    where s.daily_network_key_hash = v_network_hash
      and s.created_at >= clock_timestamp() - interval '24 hours'
  ) then
    insert into private.moderation_flags (case_id, kind, source, confidence, details)
    values (v_case_id, 'coordinated_campaign', 'automated', 0.700, '{"rule_version":"company-intake-v1"}'::jsonb)
    on conflict (case_id, kind, source) where source = 'automated' do nothing;
  end if;

  if exists (
    select 1 from private.moderation_flags f
    where f.case_id = v_case_id
      and f.kind in ('pii', 'doxxing', 'threat', 'hate_speech', 'serious_allegation', 'malicious_text')
  ) then
    update private.moderation_cases set priority = 1 where id = v_case_id;
  end if;
end;
$$;

create or replace function security.save_contribution_draft(
  p_kind private.contribution_kind,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_kind not in ('salary', 'review', 'interview', 'benefits', 'pay_reliability') then
    raise exception using errcode = '22023', message = 'invalid draft kind';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception using errcode = '22023', message = 'invalid draft payload';
  end if;
  if security.contains_prohibited_company_evidence(p_payload) then
    raise exception using errcode = '22023', message = 'documents and work email evidence are not accepted';
  end if;
  insert into private.contribution_drafts (author_user_id, kind, payload)
  values ((select auth.uid()), p_kind, p_payload)
  on conflict (author_user_id, kind) do update
  set payload = excluded.payload,
      updated_at = clock_timestamp(),
      expires_at = least(private.contribution_drafts.created_at + interval '90 days', clock_timestamp() + interval '90 days')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function security.load_contribution_draft(p_kind private.contribution_kind)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'payload', d.payload,
    'updated_at', d.updated_at, 'expires_at', d.expires_at
  )
  from private.contribution_drafts d
  where d.author_user_id = (select auth.uid())
    and d.kind = p_kind and d.expires_at > clock_timestamp()
$$;

create or replace function security.delete_contribution_draft(p_kind private.contribution_kind)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  delete from private.contribution_drafts
  where author_user_id = (select auth.uid()) and kind = p_kind;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function security.submit_benefits(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_company_name text := btrim(coalesce(p_payload ->> 'company', ''));
  v_company_id uuid;
  v_benefits jsonb;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536
     or char_length(v_company_name) not between 2 and 180 then
    raise exception using errcode = '22023', message = 'invalid benefits payload';
  end if;
  if coalesce(p_payload ->> 'accuracy_attestation', '') <> 'on' then
    raise exception using errcode = '22023', message = 'first-party accuracy attestation required';
  end if;
  v_company_id := security.find_company_by_name(v_company_name);
  v_benefits := jsonb_build_object(
    'pension', p_payload ->> 'pension',
    'hmo', p_payload ->> 'hmo',
    'transport', p_payload ->> 'transport',
    'housing', p_payload ->> 'housing',
    'data_power', p_payload ->> 'data_power',
    'thirteenth_month', p_payload ->> 'thirteenth_month',
    'bonus', p_payload ->> 'bonus'
  );
  perform security.consume_rate_limit('benefits_submit', 5, interval '30 days');
  insert into private.contributions (
    id, contributor_user_id, kind, state, content_hash,
    origin_kind, origin_attested_at, permission_basis
  ) values (
    v_id, (select auth.uid()), 'benefits', 'pending',
    encode(extensions.digest(p_payload::text, 'sha256'), 'hex'),
    'first_party_user', clock_timestamp(), 'salarypadi_first_party_terms'
  );
  insert into private.benefit_submissions (
    contribution_id, company_id, company_name_input, country_code,
    employment_status, benefits, overtime_expectation, weekend_work
  ) values (
    v_id, v_company_id, v_company_name,
    upper(coalesce(p_payload ->> 'country', 'NG')),
    p_payload ->> 'employment_status', v_benefits,
    p_payload ->> 'overtime_expectation', p_payload ->> 'weekend_work'
  );
  perform security.create_contribution_case(v_id);
  perform audit.write_event(
    'user', 'contribution.submitted', 'contribution', v_id, 'benefits',
    null, jsonb_build_object('kind', 'benefits', 'state', 'pending'), array['state']
  );
  return v_id;
end;
$$;

create or replace function security.submit_pay_reliability(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_company_name text := btrim(coalesce(p_payload ->> 'company', ''));
  v_company_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536
     or char_length(v_company_name) not between 2 and 180 then
    raise exception using errcode = '22023', message = 'invalid pay reliability payload';
  end if;
  if coalesce(p_payload ->> 'accuracy_attestation', '') <> 'on' then
    raise exception using errcode = '22023', message = 'first-party accuracy attestation required';
  end if;
  v_company_id := security.find_company_by_name(v_company_name);
  perform security.consume_rate_limit('pay_reliability_submit', 3, interval '30 days');
  insert into private.contributions (
    id, contributor_user_id, kind, state, content_hash,
    origin_kind, origin_attested_at, permission_basis
  ) values (
    v_id, (select auth.uid()), 'pay_reliability', 'pending',
    encode(extensions.digest(p_payload::text, 'sha256'), 'hex'),
    'first_party_user', clock_timestamp(), 'salarypadi_first_party_terms'
  );
  insert into private.pay_reliability_submissions (
    contribution_id, company_id, company_name_input, country_code,
    employment_status, observation_window, on_time_frequency,
    longest_delay, arrears_resolved, fx_policy
  ) values (
    v_id, v_company_id, v_company_name,
    upper(coalesce(p_payload ->> 'country', 'NG')),
    p_payload ->> 'employment_status', p_payload ->> 'observation_window',
    p_payload ->> 'on_time_frequency', p_payload ->> 'longest_delay',
    p_payload ->> 'arrears_resolved', nullif(p_payload ->> 'fx_policy', '')
  );
  perform security.create_contribution_case(v_id);
  perform audit.write_event(
    'user', 'contribution.submitted', 'contribution', v_id, 'pay_reliability',
    null, jsonb_build_object('kind', 'pay_reliability', 'state', 'pending'), array['state']
  );
  return v_id;
end;
$$;

create or replace function api.submit_contribution(
  contribution_kind text,
  contribution_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_content_payload jsonb := contribution_payload - '_intake';
begin
  if security.contains_prohibited_company_evidence(contribution_payload) then
    raise exception using
      errcode = '22023',
      message = 'documents and work email evidence are not accepted';
  end if;
  case lower(contribution_kind)
    when 'salary' then v_id := security.submit_salary(v_content_payload);
    when 'review' then v_id := security.submit_review(v_content_payload);
    when 'interview' then v_id := security.submit_interview(v_content_payload);
    when 'benefits' then v_id := security.submit_benefits(v_content_payload);
    when 'pay_reliability' then v_id := security.submit_pay_reliability(v_content_payload);
    else raise exception using errcode = '22023', message = 'invalid contribution kind';
  end case;
  perform security.register_contribution_intake(v_id, contribution_payload);
  delete from private.contribution_drafts
  where author_user_id = (select auth.uid())
    and kind::text = lower(contribution_kind);
  return v_id;
end;
$$;

create or replace function api.save_contribution_draft(p_kind text, p_payload jsonb)
returns uuid language sql security definer set search_path = ''
as $$ select security.save_contribution_draft(p_kind::private.contribution_kind, p_payload) $$;
create or replace function api.load_contribution_draft(p_kind text)
returns jsonb language sql stable security definer set search_path = ''
as $$ select security.load_contribution_draft(p_kind::private.contribution_kind) $$;
create or replace function api.delete_contribution_draft(p_kind text)
returns boolean language sql security definer set search_path = ''
as $$ select security.delete_contribution_draft(p_kind::private.contribution_kind) $$;

create or replace function security.queue_company_aggregate_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state is distinct from old.state
     and new.kind in ('benefits', 'pay_reliability')
     and new.state in ('approved', 'removed') then
    insert into private.aggregate_refresh_queue (metric, target_id, reason)
    values (
      case new.kind when 'benefits' then 'company_benefit_aggregate' else 'pay_reliability_aggregate' end,
      new.id, 'contribution ' || new.state::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists contribution_company_aggregate_refresh on private.contributions;
create trigger contribution_company_aggregate_refresh
after update of state on private.contributions
for each row execute function security.queue_company_aggregate_refresh();

create or replace function security.enforce_contribution_deletion_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'contribution_deletion' and (
    new.target_id is null or not exists (
      select 1 from private.contributions c
      where c.id = new.target_id and c.contributor_user_id = new.user_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'contribution deletion target must belong to the requester';
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_request_contribution_owner
  on private.privacy_requests;
create trigger privacy_request_contribution_owner
before insert or update of kind, target_id, user_id on private.privacy_requests
for each row execute function security.enforce_contribution_deletion_ownership();

alter table app.contribution_verification_programs enable row level security;
alter table app.contribution_verification_programs force row level security;
alter table private.contribution_drafts enable row level security;
alter table private.contribution_drafts force row level security;
alter table private.contribution_verifications enable row level security;
alter table private.contribution_verifications force row level security;
alter table private.contribution_abuse_signals enable row level security;
alter table private.contribution_abuse_signals force row level security;
alter table private.benefit_submissions enable row level security;
alter table private.benefit_submissions force row level security;
alter table private.pay_reliability_submissions enable row level security;
alter table private.pay_reliability_submissions force row level security;
alter table app.pay_reliability_snapshots enable row level security;
alter table app.pay_reliability_snapshots force row level security;

drop policy if exists verification_programs_public_read on app.contribution_verification_programs;
create policy verification_programs_public_read on app.contribution_verification_programs
for select to anon, authenticated using (true);
drop policy if exists contribution_drafts_owner_read on private.contribution_drafts;
create policy contribution_drafts_owner_read on private.contribution_drafts
for select to authenticated using (author_user_id = (select auth.uid()));
drop policy if exists contribution_verifications_moderator_read on private.contribution_verifications;
create policy contribution_verifications_moderator_read on private.contribution_verifications
for select to authenticated using ((select security.can_moderate()));
drop policy if exists contribution_abuse_moderator_read on private.contribution_abuse_signals;
create policy contribution_abuse_moderator_read on private.contribution_abuse_signals
for select to authenticated using ((select security.can_moderate()));
drop policy if exists benefit_submissions_moderator_read on private.benefit_submissions;
create policy benefit_submissions_moderator_read on private.benefit_submissions
for select to authenticated using ((select security.can_moderate()));
drop policy if exists pay_reliability_submissions_moderator_read on private.pay_reliability_submissions;
create policy pay_reliability_submissions_moderator_read on private.pay_reliability_submissions
for select to authenticated using ((select security.can_moderate()));
drop policy if exists pay_reliability_snapshots_public_read on app.pay_reliability_snapshots;
create policy pay_reliability_snapshots_public_read on app.pay_reliability_snapshots
for select to anon, authenticated using (is_current and is_released and sample_size >= 5);

revoke execute on function api.submit_salary(jsonb) from authenticated;
revoke execute on function api.submit_review(jsonb) from authenticated;
revoke execute on function api.submit_interview(jsonb) from authenticated;
revoke execute on function security.submit_salary(jsonb) from authenticated;
revoke execute on function security.submit_review(jsonb) from authenticated;
revoke execute on function security.submit_interview(jsonb) from authenticated;

revoke all on function security.submit_salary(jsonb) from public, anon, authenticated;
revoke all on function security.submit_review(jsonb) from public, anon, authenticated;
revoke all on function security.submit_interview(jsonb) from public, anon, authenticated;
revoke all on function security.submit_benefits(jsonb) from public, anon, authenticated;
revoke all on function security.submit_pay_reliability(jsonb) from public, anon, authenticated;
revoke all on function security.register_contribution_intake(uuid, jsonb) from public, anon, authenticated;
revoke all on function security.save_contribution_draft(private.contribution_kind, jsonb) from public, anon, authenticated;
revoke all on function security.load_contribution_draft(private.contribution_kind) from public, anon, authenticated;
revoke all on function security.delete_contribution_draft(private.contribution_kind) from public, anon, authenticated;
revoke all on function security.contains_prohibited_company_evidence(jsonb) from public, anon, authenticated;
revoke all on function api.submit_contribution(text, jsonb) from public, anon;
revoke all on function api.save_contribution_draft(text, jsonb) from public, anon;
revoke all on function api.load_contribution_draft(text) from public, anon;
revoke all on function api.delete_contribution_draft(text) from public, anon;

grant select on app.contribution_verification_programs,
  app.pay_reliability_snapshots to anon, authenticated;
grant select on private.contribution_drafts, private.contribution_verifications,
  private.contribution_abuse_signals, private.benefit_submissions,
  private.pay_reliability_submissions to authenticated;
grant execute on function api.submit_contribution(text, jsonb) to authenticated;
grant execute on function api.save_contribution_draft(text, jsonb) to authenticated;
grant execute on function api.load_contribution_draft(text) to authenticated;
grant execute on function api.delete_contribution_draft(text) to authenticated;

comment on table private.contribution_drafts is
  'Private 90-day drafts. Payslips, documents, work email, and verification evidence are rejected.';
comment on table private.contribution_abuse_signals is
  'Short-retention hashes only; no raw IP address, work email, identity evidence, or contribution text.';
comment on table private.contribution_verifications is
  'Private verification state. Public aggregates expose only a cohort-level verification mix.';

commit;
