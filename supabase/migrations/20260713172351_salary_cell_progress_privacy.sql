begin;

create or replace function api.get_salary_cell_progress(
  p_role_slug text,
  p_country_code text
)
returns table (
  role_slug text,
  role_family text,
  country_code text,
  displayed_contributions integer,
  privacy_threshold integer,
  progress_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_rule as (
    select
      rule.min_distinct_contributors,
      rule.max_age_months,
      rule.minimum_publication_lag
    from app.privacy_rule_versions as rule
    where rule.metric = 'salary_employer_role_country'
      and rule.is_active
    limit 1
  ), target as (
    select
      role.id,
      role.slug,
      role.name,
      upper(btrim(p_country_code)) as country_code
    from app.role_families as role
    where role.is_active
      and role.slug = lower(btrim(p_role_slug))
      and lower(btrim(p_role_slug)) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and upper(btrim(p_country_code)) ~ '^[A-Z]{2}$'
  ), ranked as (
    select
      contribution.contributor_user_id,
      salary.currency_code,
      salary.gross_net,
      salary.engagement_type,
      row_number() over (
        partition by
          contribution.contributor_user_id,
          salary.role_family_id,
          salary.country_code,
          salary.currency_code,
          salary.gross_net,
          salary.engagement_type
        order by contribution.submitted_at desc, contribution.id desc
      ) as contributor_rank
    from target
    cross join active_rule as rule
    join private.salary_submissions as salary
      on salary.role_family_id = target.id
      and salary.country_code = target.country_code
    join private.contributions as contribution
      on contribution.id = salary.contribution_id
    where contribution.state = 'approved'
      and contribution.withdrawn_at is null
      and coalesce(contribution.decided_at, contribution.submitted_at)
        <= now() - rule.minimum_publication_lag
      and salary.reported_at
        >= current_date - make_interval(months => rule.max_age_months)
      and salary.annualized_amount > 0
  ), compatible_cells as (
    select count(*)::integer as contributor_count
    from ranked
    where contributor_rank = 1
    group by currency_code, gross_net, engagement_type
  ), best_cell as (
    select coalesce(max(contributor_count), 0)::integer as contributor_count
    from compatible_cells
  )
  select
    target.slug,
    target.name,
    target.country_code,
    case
      when best_cell.contributor_count = 0 then 0
      when best_cell.contributor_count >= rule.min_distinct_contributors
        then rule.min_distinct_contributors
      else null
    end as displayed_contributions,
    rule.min_distinct_contributors,
    case
      when best_cell.contributor_count = 0 then 'none'
      when best_cell.contributor_count < rule.min_distinct_contributors
        then 'fewer_than_threshold'
      else 'threshold_met'
    end as progress_status
  from target
  cross join active_rule as rule
  cross join best_cell
$$;

revoke all on function api.get_salary_cell_progress(text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.get_salary_cell_progress(text, text)
  to anon, authenticated;

comment on function api.get_salary_cell_progress(text, text) is
  'Returns only broad role-country salary progress. Exact sub-threshold counts and every company-level count are intentionally suppressed.';

commit;
