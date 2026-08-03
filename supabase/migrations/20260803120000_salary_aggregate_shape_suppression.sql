-- Shape suppression for salary aggregates.
--
-- `api.privacy_thresholds` answers "are there enough people in this cell?".
-- It does not answer "does this cell describe so few people that naming it
-- identifies them, however many submissions it holds?". That second rule was
-- written in src/lib/contributions/slice-privacy.ts and never reached the
-- worker that actually publishes figures, which is this one.
--
-- Three gaps closed here, found by reading the worker against the rule:
--
--   1. A cell naming an employer used the same threshold as a national one.
--      Under the rule an employer cell is a *sensitive* slice and needs the
--      higher count.
--
--   2. A cell that does NOT name an employer could be drawn entirely from a
--      single employer. "Backend Engineer · Nigeria" where everyone works at
--      one company is that company's pay figure, published below the employer
--      threshold and without the employer's name attached to it. Nothing
--      stopped that.
--
--   3. app.salary_aggregate_snapshots carries an office_id column. The rule
--      lists `office` as never publishable at any count — an office names a
--      group of colleagues who already know each other's roles. The column
--      was an open slot with no gate on it.
--
-- Effect on live data: none. There are zero contributions, zero salary
-- submissions and zero aggregate runs in production today. This is a gate
-- built before the first figure is published rather than after.

begin;

alter table app.privacy_rule_versions
  add column if not exists min_sensitive_contributors integer not null default 10,
  add column if not exists min_distinct_employers integer not null default 2;

comment on column app.privacy_rule_versions.min_sensitive_contributors is
  'Distinct contributors required by a slice carrying a narrowing dimension (employer, city, seniority, employment type). Mirrors SENSITIVE_MIN_CONTRIBUTORS in src/lib/contributions/slice-privacy.ts. This table is the authority on the number; the module supplies the default.';

comment on column app.privacy_rule_versions.min_distinct_employers is
  'Distinct identified employers a cell must span when it does not name one. Below this the cell is an employer figure that happens not to say so.';

-- The salary metric adopts the module default. A national role+country cell
-- keeps its existing general threshold; naming an employer costs the higher
-- one, because a company median off three people is that company's pay
-- disclosed by three named colleagues.
update app.privacy_rule_versions
set min_sensitive_contributors = 10,
    min_distinct_employers = 2,
    methodology_note = 'Distinct-account threshold, with a higher bar for cells naming an employer. Cells that name no employer must span at least two identified employers. Office-scoped cells are never released. Sparse dimensions are suppressed and salary values are rounded.'
where metric = 'salary_employer_role_country' and is_active;

-- An office-scoped cell may be computed; it may never be released.
alter table app.salary_aggregate_snapshots
  drop constraint if exists salary_snapshot_office_never_released;
alter table app.salary_aggregate_snapshots
  add constraint salary_snapshot_office_never_released
  check (not (is_released and office_id is not null));

create or replace function security.refresh_salary_aggregates()
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rule app.privacy_rule_versions%rowtype;
  v_run_id uuid;
  v_released integer;
  v_suppressed integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not ((select security.can_manage_jobs()) and (select security.has_staff_role('admin'))) then
    raise exception using errcode = '42501', message = 'trusted aggregate worker required';
  end if;
  select * into strict v_rule from app.privacy_rule_versions
  where metric = 'salary_employer_role_country' and is_active;

  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_rule.metric, v_rule.id) returning id into v_run_id;
  update app.salary_aggregate_snapshots set is_current = false where is_current;

  with ranked as (
    select
      c.contributor_user_id, c.submitted_at as contribution_submitted_at, s.*,
      row_number() over (
        partition by c.contributor_user_id, s.company_id, s.role_family_id,
          s.country_code, s.currency_code, s.gross_net, s.engagement_type
        order by c.submitted_at desc, c.id desc
      ) as rn
    from private.contributions c
    join private.salary_submissions s on s.contribution_id = c.id
    where c.state = 'approved'
      and c.withdrawn_at is null
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_rule.minimum_publication_lag
      and s.reported_at >= current_date - make_interval(months => v_rule.max_age_months)
      and s.role_family_id is not null
      and s.annualized_amount > 0
  ), base as (
    select * from ranked where rn = 1
  ), company_cells as (
    select company_id, role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at,
      company_id as employer_id
    from base where company_id is not null
  ), broader_ranked as (
    select role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at,
      company_id as employer_id,
      row_number() over (
        partition by contributor_user_id, role_family_id, country_code,
          currency_code, gross_net, engagement_type
        order by contribution_submitted_at desc, contribution_id desc
      ) as broader_rn
    from base
  ), cells as (
    select * from company_cells
    union all
    select null::uuid, role_family_id, country_code, currency_code, gross_net,
      engagement_type, contributor_user_id, annualized_amount, reported_at,
      employer_id
    from broader_ranked where broader_rn = 1
  ), grouped as (
    select
      company_id, role_family_id, country_code, currency_code, gross_net,
      engagement_type, count(distinct contributor_user_id)::integer as sample_size,
      -- Contributions that name no employer cannot be shown to come from
      -- different ones, so they do not count towards the spread. A cell whose
      -- contributors are all anonymous as to employer fails closed.
      count(distinct employer_id)::integer as distinct_employers,
      percentile_cont(0.5) within group (order by annualized_amount)::numeric as median_value,
      percentile_cont(0.25) within group (order by annualized_amount)::numeric as p25_value,
      percentile_cont(0.75) within group (order by annualized_amount)::numeric as p75_value,
      min(reported_at) as source_from, max(reported_at) as source_to
    from cells
    group by company_id, role_family_id, country_code, currency_code, gross_net, engagement_type
  )
  insert into app.salary_aggregate_snapshots (
    aggregate_run_id, rule_version_id, company_id, role_family_id,
    country_code, currency_code, gross_net, engagement_type, sample_size,
    median_annual, p25_annual, p75_annual, source_month_from, source_month_to,
    confidence_label, is_released, is_current
  )
  select
    v_run_id, v_rule.id, g.company_id, g.role_family_id, g.country_code,
    g.currency_code, g.gross_net, g.engagement_type, g.sample_size,
    round(g.median_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1),
    case when g.sample_size >= v_rule.min_range_contributors
      then round(g.p25_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1)
      else null end,
    case when g.sample_size >= v_rule.min_range_contributors
      then round(g.p75_value / coalesce(rr.annual_increment, 1)) * coalesce(rr.annual_increment, 1)
      else null end,
    date_trunc('month', g.source_from)::date,
    date_trunc('month', g.source_to)::date,
    case when g.sample_size >= 10 then 'high'
         when g.sample_size >= 5 then 'medium' else 'low' end,
    true, true
  from grouped g
  left join app.currency_rounding_rules rr on rr.currency_code = g.currency_code
  where case
    -- Naming an employer makes the cell a sensitive slice: it describes a
    -- named group of colleagues, so it costs the higher contributor count.
    when g.company_id is not null
      then g.sample_size >= v_rule.min_sensitive_contributors
    -- A cell that names no employer must span several, or it is an employer
    -- figure wearing a national label.
    else g.sample_size >= v_rule.min_distinct_contributors
      and g.distinct_employers >= v_rule.min_distinct_employers
  end;
  get diagnostics v_released = row_count;

  with eligible_cells as (
    select count(*)::integer as total
    from (
      select s.company_id, s.role_family_id, s.country_code, s.currency_code,
        s.gross_net, s.engagement_type
      from private.contributions c
      join private.salary_submissions s on s.contribution_id = c.id
      where c.state = 'approved' and c.withdrawn_at is null and s.role_family_id is not null
      group by s.company_id, s.role_family_id, s.country_code, s.currency_code,
        s.gross_net, s.engagement_type
    ) x
  ) select greatest(total - v_released, 0) into v_suppressed from eligible_cells;

  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      released_cells = v_released, suppressed_cells = v_suppressed
  where id = v_run_id;
  update private.aggregate_refresh_queue
  set processed_at = clock_timestamp()
  where metric = v_rule.metric and processed_at is null;
  perform audit.write_event(
    'system', 'aggregate.refreshed', 'salary_aggregate_run', v_run_id,
    'scheduled_refresh', null,
    jsonb_build_object('released_cells', v_released, 'suppressed_cells', v_suppressed),
    array['released_cells', 'suppressed_cells'], null, null,
    jsonb_build_object('rule_version_id', v_rule.id), null
  );
  return v_run_id;
exception when others then
  if v_run_id is not null then
    update app.aggregate_runs
    set status = 'failed', completed_at = clock_timestamp(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$function$;

comment on function security.refresh_salary_aggregates() is
  'Publishes salary aggregates under both the threshold table and the slice shape rule: employer cells are sensitive, cells that name no employer must span several, and office-scoped cells are never released.';

grant execute on function security.refresh_salary_aggregates() to service_role;

commit;
