-- Public cohort-suppression floors must track the privacy policy table, not a
-- literal. api.pay_reliability_aggregates and the company_benefit_snapshots
-- read policy both hard-coded `sample_size >= 5`. That matched the active
-- policy (min_distinct_contributors = 5 for both metrics) only by coincidence:
-- a policy tightening would have silently left these two public surfaces
-- exposing cohorts the policy now considers too small.
--
-- Both now read the active minimum through a SECURITY DEFINER accessor. The
-- policy table (app.privacy_rule_versions) carries its own RLS, and a
-- security_invoker view / an anon RLS policy must not have its suppression floor
-- decided by whether the reader can see that table — so the read is done with
-- definer rights and a fail-safe default of 5, which can only tighten.
--
-- Apply timing: standalone and code-independent. Safe before or after deploy.

begin;

create or replace function security.min_public_contributors(p_metric text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select min(min_distinct_contributors)
      from app.privacy_rule_versions
      where metric = p_metric and is_active
    ),
    5
  )
$$;

comment on function security.min_public_contributors(text) is
  'Active minimum distinct-contributor threshold for a public aggregate metric, '
  'read from app.privacy_rule_versions with definer rights. Falls back to 5 when '
  'no active rule exists, so a missing policy row can only tighten suppression, '
  'never loosen it.';

revoke all on function security.min_public_contributors(text) from public;
grant execute on function security.min_public_contributors(text)
  to anon, authenticated, service_role;

-- Recreate the view with the same columns, options and grants (CREATE OR
-- REPLACE preserves the anon/authenticated SELECT grant), swapping only the
-- literal floor for the policy-driven one. The subquery form pins it to a
-- one-time initplan rather than a per-row call.
create or replace view api.pay_reliability_aggregates
with (security_invoker = true, security_barrier = true)
as
select
  s.id, c.slug as company_slug, s.country_code, s.sample_size,
  s.dominant_pattern, s.source_month_from, s.source_month_to,
  s.verification_mix, s.confidence_label, s.computed_at
from app.pay_reliability_snapshots s
join app.companies c on c.id = s.company_id
where s.is_current and s.is_released
  and s.sample_size
    >= (select security.min_public_contributors('pay_reliability_aggregate'));

comment on view api.pay_reliability_aggregates is
  'Coarse cohort output only; no individual pay-reliability submission is public.';

drop policy if exists company_benefit_snapshots_public_read
  on app.company_benefit_snapshots;
create policy company_benefit_snapshots_public_read
  on app.company_benefit_snapshots
  for select to anon, authenticated
  using (
    is_current
    and is_released
    and sample_size
      >= (select security.min_public_contributors('company_benefit_aggregate'))
  );

commit;
