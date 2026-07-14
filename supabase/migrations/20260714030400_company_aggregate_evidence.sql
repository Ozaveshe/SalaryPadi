begin;

alter table app.salary_aggregate_snapshots
  add column if not exists verification_mix jsonb not null default '{}'::jsonb;
alter table app.company_rating_snapshots
  add column if not exists independent_contributors integer,
  add column if not exists country_scope text[] not null default '{}'::text[],
  add column if not exists source_month_from date,
  add column if not exists source_month_to date,
  add column if not exists verification_mix jsonb not null default '{}'::jsonb;

create table if not exists app.company_benefit_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  country_code text not null,
  benefit_code text not null,
  label text not null,
  sample_size integer not null,
  source_month_from date not null,
  source_month_to date not null,
  verification_mix jsonb not null default '{}'::jsonb,
  confidence_label text not null,
  is_current boolean not null default true,
  is_released boolean not null default false,
  computed_at timestamptz not null default now(),
  constraint company_benefit_snapshot_country check (country_code ~ '^[A-Z]{2}$'),
  constraint company_benefit_snapshot_code check (benefit_code in (
    'pension', 'hmo', 'transport', 'housing', 'data_power',
    'thirteenth_month', 'bonus'
  )),
  constraint company_benefit_snapshot_sample check (sample_size >= 5),
  constraint company_benefit_snapshot_dates check (source_month_to >= source_month_from),
  constraint company_benefit_snapshot_mix check (jsonb_typeof(verification_mix) = 'object'),
  constraint company_benefit_snapshot_confidence check (confidence_label in ('low', 'medium', 'high'))
);

create unique index if not exists company_benefit_snapshot_current
  on app.company_benefit_snapshots (company_id, country_code, benefit_code)
  where is_current;

create or replace function security.verification_mix_for_contributions(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with strongest as (
    select distinct on (v.contribution_id)
      v.contribution_id, v.level
    from private.contribution_verifications v
    where v.contribution_id = any(p_ids) and v.status = 'active'
    order by v.contribution_id,
      case v.level
        when 'work_domain_verified' then 1
        when 'community_corroborated' then 2
        when 'account_verified' then 3
        when 'unverified_moderated' then 4
        else 5
      end
  ), counts as (
    select level::text as level, count(*)::integer as contributors
    from strongest group by level
  )
  select coalesce(jsonb_object_agg(level, contributors), '{}'::jsonb)
  from counts
$$;

create or replace function security.decorate_company_rating_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids uuid[];
begin
  select
    array_agg(c.id),
    array_agg(distinct r.country_code order by r.country_code),
    date_trunc('month', min(c.submitted_at))::date,
    date_trunc('month', max(c.submitted_at))::date
  into v_ids, new.country_scope, new.source_month_from, new.source_month_to
  from app.review_publications r
  join private.contributions c on c.id = r.source_contribution_id
  where r.company_id = new.company_id
    and r.publication_status = 'published' and c.state = 'approved';
  new.independent_contributors := new.sample_size;
  new.verification_mix := security.verification_mix_for_contributions(coalesce(v_ids, '{}'::uuid[]));
  return new;
end;
$$;

drop trigger if exists decorate_company_rating_snapshot on app.company_rating_snapshots;
create trigger decorate_company_rating_snapshot
before insert on app.company_rating_snapshots
for each row execute function security.decorate_company_rating_snapshot();

create or replace function security.decorate_salary_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids uuid[];
begin
  select array_agg(c.id) into v_ids
  from private.contributions c
  join private.salary_submissions s on s.contribution_id = c.id
  where c.state = 'approved'
    and s.role_family_id = new.role_family_id
    and s.country_code = new.country_code
    and s.currency_code = new.currency_code
    and s.gross_net = new.gross_net
    and s.engagement_type = new.engagement_type
    and s.company_id is not distinct from new.company_id;
  new.verification_mix := security.verification_mix_for_contributions(coalesce(v_ids, '{}'::uuid[]));
  return new;
end;
$$;

drop trigger if exists decorate_salary_snapshot on app.salary_aggregate_snapshots;
create trigger decorate_salary_snapshot
before insert on app.salary_aggregate_snapshots
for each row execute function security.decorate_salary_snapshot();

create or replace function security.refresh_company_workplace_aggregates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_benefit_rule app.privacy_rule_versions%rowtype;
  v_reliability_rule app.privacy_rule_versions%rowtype;
  v_benefit_count integer := 0;
  v_reliability_count integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not ((select security.can_manage_jobs()) and (select security.has_staff_role('admin'))) then
    raise exception using errcode = '42501', message = 'trusted aggregate worker required';
  end if;
  select * into strict v_benefit_rule from app.privacy_rule_versions
  where metric = 'company_benefit_aggregate' and is_active;
  select * into strict v_reliability_rule from app.privacy_rule_versions
  where metric = 'pay_reliability_aggregate' and is_active;

  update app.company_benefit_snapshots set is_current = false where is_current;
  with ranked as (
    select
      c.id as contribution_id, c.contributor_user_id,
      b.company_id, b.country_code, b.benefits, b.observed_month,
      row_number() over (
        partition by c.contributor_user_id, b.company_id, b.country_code
        order by coalesce(c.decided_at, c.submitted_at) desc, c.id desc
      ) as rn
    from private.contributions c
    join private.benefit_submissions b on b.contribution_id = c.id
    where c.state = 'approved' and b.company_id is not null
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_benefit_rule.minimum_publication_lag
      and b.observed_month >= date_trunc('month', current_date - make_interval(months => v_benefit_rule.max_age_months))::date
  ), expanded as (
    select r.*, e.key as benefit_code
    from ranked r
    cross join lateral jsonb_each_text(r.benefits) e
    where r.rn = 1 and e.value = 'yes'
  ), grouped as (
    select
      company_id, country_code, benefit_code,
      count(*)::integer as sample_size,
      min(observed_month) as source_month_from,
      max(observed_month) as source_month_to,
      array_agg(contribution_id) as contribution_ids
    from expanded
    group by company_id, country_code, benefit_code
    having count(*) >= v_benefit_rule.min_distinct_contributors
  )
  insert into app.company_benefit_snapshots (
    company_id, country_code, benefit_code, label, sample_size,
    source_month_from, source_month_to, verification_mix,
    confidence_label, is_released, is_current
  )
  select
    g.company_id, g.country_code, g.benefit_code,
    case g.benefit_code
      when 'pension' then 'Pension'
      when 'hmo' then 'HMO or health cover'
      when 'transport' then 'Transport support'
      when 'housing' then 'Housing support'
      when 'data_power' then 'Data or power support'
      when 'thirteenth_month' then 'Thirteenth-month pay'
      else 'Bonus'
    end,
    g.sample_size, g.source_month_from, g.source_month_to,
    security.verification_mix_for_contributions(g.contribution_ids),
    case when g.sample_size >= 20 then 'high'
         when g.sample_size >= 10 then 'medium' else 'low' end,
    true, true
  from grouped g;
  get diagnostics v_benefit_count = row_count;

  update app.pay_reliability_snapshots set is_current = false where is_current;
  with ranked as (
    select
      c.id as contribution_id, c.contributor_user_id,
      p.company_id, p.country_code, p.on_time_frequency, p.observed_month,
      row_number() over (
        partition by c.contributor_user_id, p.company_id, p.country_code
        order by coalesce(c.decided_at, c.submitted_at) desc, c.id desc
      ) as rn
    from private.contributions c
    join private.pay_reliability_submissions p on p.contribution_id = c.id
    where c.state = 'approved' and p.company_id is not null
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_reliability_rule.minimum_publication_lag
      and p.observed_month >= date_trunc('month', current_date - make_interval(months => v_reliability_rule.max_age_months))::date
  ), grouped as (
    select
      company_id, country_code, count(*)::integer as sample_size,
      mode() within group (order by on_time_frequency) as dominant_pattern,
      min(observed_month) as source_month_from,
      max(observed_month) as source_month_to,
      array_agg(contribution_id) as contribution_ids
    from ranked where rn = 1
    group by company_id, country_code
    having count(*) >= v_reliability_rule.min_distinct_contributors
  )
  insert into app.pay_reliability_snapshots (
    company_id, country_code, sample_size, dominant_pattern,
    source_month_from, source_month_to, verification_mix,
    confidence_label, is_released, is_current
  )
  select
    g.company_id, g.country_code, g.sample_size, g.dominant_pattern,
    g.source_month_from, g.source_month_to,
    security.verification_mix_for_contributions(g.contribution_ids),
    case when g.sample_size >= 20 then 'high'
         when g.sample_size >= 10 then 'medium' else 'low' end,
    true, true
  from grouped g;
  get diagnostics v_reliability_count = row_count;

  insert into private.contribution_verifications (contribution_id, level)
  select distinct c.id, 'community_corroborated'::private.contribution_verification_level
  from private.contributions c
  left join private.benefit_submissions b on b.contribution_id = c.id
  left join private.pay_reliability_submissions p on p.contribution_id = c.id
  where c.state = 'approved' and (
    exists (
      select 1 from app.company_benefit_snapshots s
      where s.is_current and s.is_released
        and s.company_id = b.company_id and s.country_code = b.country_code
    ) or exists (
      select 1 from app.pay_reliability_snapshots s
      where s.is_current and s.is_released
        and s.company_id = p.company_id and s.country_code = p.country_code
    )
  )
  on conflict (contribution_id, level) do nothing;

  update private.aggregate_refresh_queue set processed_at = clock_timestamp()
  where metric in ('company_benefit_aggregate', 'pay_reliability_aggregate')
    and processed_at is null;
  return jsonb_build_object(
    'company_benefit_cells', v_benefit_count,
    'pay_reliability_cells', v_reliability_count
  );
end;
$$;

create or replace view api.company_ratings
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.company_id, s.sample_size, s.overall_rating, s.confidence_label,
  s.rule_version_id, s.computed_at, c.slug as company_slug,
  s.independent_contributors, s.country_scope,
  s.source_month_from, s.source_month_to, s.verification_mix
from app.company_rating_snapshots s
join app.companies c on c.id = s.company_id
where s.is_current and s.is_released and s.sample_size >= 5;

create or replace function security.company_evidence_cohort_met(
  p_company_id uuid,
  p_kind private.contribution_kind,
  p_role_family_id uuid default null,
  p_country_code text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'review' then (
      select count(distinct c.contributor_user_id) >=
        case when p_role_family_id is null and p_country_code is null then 5 else 3 end
      from app.review_publications p
      join private.contributions c on c.id = p.source_contribution_id
      where p.company_id = p_company_id
        and p.publication_status = 'published' and c.state = 'approved'
        and (p_role_family_id is null or p.role_family_id = p_role_family_id)
        and (p_country_code is null or p.country_code = p_country_code)
    )
    when 'interview' then (
      select count(distinct c.contributor_user_id) >= 3
      from app.interview_publications p
      join private.contributions c on c.id = p.source_contribution_id
      where p.company_id = p_company_id
        and p.publication_status = 'published' and c.state = 'approved'
        and (p_role_family_id is null or p.role_family_id = p_role_family_id)
        and (p_country_code is null or p.country_code = p_country_code)
    )
    else false
  end
$$;

create or replace view api.company_reviews
with (security_invoker = true, security_barrier = true)
as
select
  p.id, p.company_id,
  case when security.company_evidence_cohort_met(p.company_id, 'review', p.role_family_id, null)
    then p.role_family_id else null end as role_family_id,
  case when security.company_evidence_cohort_met(p.company_id, 'review', null, p.country_code)
    then p.country_code else 'WITHHELD' end as country_code,
  null::text as employment_status, null::text as employment_period_label,
  p.compensation_rating, p.pay_reliability_rating,
  p.management_rating, p.work_life_rating, p.career_growth_rating,
  p.overall_rating, p.pros, p.cons, p.advice_to_management, p.published_at,
  c.slug as company_slug,
  case when security.company_evidence_cohort_met(p.company_id, 'review', p.role_family_id, null)
    then r.slug else null end as role_slug,
  case when security.company_evidence_cohort_met(p.company_id, 'review', p.role_family_id, null)
    then r.name else null end as role_family,
  'First-party, moderated; identity withheld'::text as provenance_label
from app.review_publications p
join app.companies c on c.id = p.company_id
left join app.role_families r on r.id = p.role_family_id
where p.publication_status = 'published'
  and security.company_evidence_cohort_met(p.company_id, 'review', null, null);

create or replace view api.interview_experiences
with (security_invoker = true, security_barrier = true)
as
select
  p.id, p.company_id,
  case when security.company_evidence_cohort_met(p.company_id, 'interview', p.role_family_id, null)
    then p.role_family_id else null end as role_family_id,
  null::app.experience_level as seniority,
  case when security.company_evidence_cohort_met(p.company_id, 'interview', null, p.country_code)
    then p.country_code else 'WITHHELD' end as country_code,
  null::text as application_source, p.stages, p.approximate_duration_label,
  p.difficulty, null::boolean as feedback_received, null::text as outcome,
  p.question_themes, p.general_experience, p.published_at,
  c.slug as company_slug,
  case when security.company_evidence_cohort_met(p.company_id, 'interview', p.role_family_id, null)
    then r.slug else null end as role_slug,
  case when security.company_evidence_cohort_met(p.company_id, 'interview', p.role_family_id, null)
    then r.name else null end as role_family,
  'First-party, moderated; identity and rare attributes withheld'::text as provenance_label
from app.interview_publications p
join app.companies c on c.id = p.company_id
left join app.role_families r on r.id = p.role_family_id
where p.publication_status = 'published'
  and security.company_evidence_cohort_met(p.company_id, 'interview', null, null);

create or replace view api.salary_aggregates
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.company_id, c.slug as company_slug,
  s.role_family_id, r.slug as role_slug, r.name as role_family,
  s.country_code, 'all'::text as seniority,
  s.engagement_type::text as arrangement, s.engagement_type,
  s.currency_code, s.currency_code as currency, s.gross_net,
  s.sample_size, s.median_annual,
  s.p25_annual, s.p25_annual as percentile_25_annual,
  s.p75_annual, s.p75_annual as percentile_75_annual,
  s.source_month_from, s.source_month_from as submission_month_start,
  s.source_month_to, s.source_month_to as submission_month_end,
  s.confidence_label, s.confidence_label as confidence,
  s.rule_version_id, s.computed_at, s.computed_at as calculated_at,
  s.verification_mix
from app.salary_aggregate_snapshots s
join app.role_families r on r.id = s.role_family_id
left join app.companies c on c.id = s.company_id
where s.is_current and s.is_released;

create or replace view api.company_benefits
with (security_invoker = true, security_barrier = true)
as
select
  b.id, b.company_id, c.slug as company_slug, b.benefit_code, b.label,
  b.description, b.source_kind, b.sample_size,
  b.confidence_label, b.last_verified_at, null::text as country_code,
  b.source_month_from, b.source_month_to, b.verification_mix
from app.company_benefits b
join app.companies c on c.id = b.company_id
where b.record_status = 'published' and b.source_kind <> 'community_reported'
union all
select
  s.id, s.company_id, c.slug, s.benefit_code, s.label,
  null::text, 'community_reported'::app.intelligence_source_kind, s.sample_size,
  s.confidence_label, s.computed_at, s.country_code,
  s.source_month_from, s.source_month_to, s.verification_mix
from app.company_benefit_snapshots s
join app.companies c on c.id = s.company_id
where s.is_current and s.is_released and s.sample_size >= 5;

create or replace view api.pay_reliability_aggregates
with (security_invoker = true, security_barrier = true)
as
select
  s.id, c.slug as company_slug, s.country_code, s.sample_size,
  s.dominant_pattern, s.source_month_from, s.source_month_to,
  s.verification_mix, s.confidence_label, s.computed_at
from app.pay_reliability_snapshots s
join app.companies c on c.id = s.company_id
where s.is_current and s.is_released and s.sample_size >= 5;

alter table app.company_benefit_snapshots enable row level security;
alter table app.company_benefit_snapshots force row level security;
drop policy if exists company_benefit_snapshots_public_read on app.company_benefit_snapshots;
create policy company_benefit_snapshots_public_read on app.company_benefit_snapshots
for select to anon, authenticated using (is_current and is_released and sample_size >= 5);

grant select on app.company_benefit_snapshots to anon, authenticated;
grant select on api.company_ratings, api.salary_aggregates,
  api.company_reviews, api.company_benefits,
  api.pay_reliability_aggregates to anon, authenticated;
revoke all on function security.company_evidence_cohort_met(uuid, private.contribution_kind, uuid, text) from public;
revoke all on function security.verification_mix_for_contributions(uuid[]) from public, anon, authenticated, service_role;
revoke all on function security.decorate_company_rating_snapshot() from public, anon, authenticated, service_role;
revoke all on function security.decorate_salary_snapshot() from public, anon, authenticated, service_role;
revoke all on function security.refresh_company_workplace_aggregates() from public, anon, authenticated;
grant execute on function security.company_evidence_cohort_met(uuid, private.contribution_kind, uuid, text) to anon, authenticated;
grant execute on function security.refresh_company_workplace_aggregates() to service_role;

comment on view api.company_ratings is
  'Overall ratings require at least five independent approved reviews and expose cohort scope, date range, verification mix and confidence.';
comment on view api.pay_reliability_aggregates is
  'Coarse cohort output only; no individual pay-reliability submission is public.';

commit;
