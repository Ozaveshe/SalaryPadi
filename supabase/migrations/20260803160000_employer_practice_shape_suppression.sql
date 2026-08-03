-- Shape suppression for the employer-practice workers.
--
-- The salary worker got this gate on 2026-08-03. The other three publish
-- statements about a *named company* — its rating, its benefits, whether it
-- pays people on time — and each ran on the threshold table alone.
--
-- Every cell these workers emit names an employer, which under the slice rule
-- makes it a sensitive slice: it describes a group of colleagues who can
-- recognise themselves and each other in it. They now require
-- min_sensitive_contributors rather than the general count.
--
-- One rule does NOT carry across, and saying so is the point of writing the
-- mapping down: the salary rule refuses a slice with no role dimension,
-- because a median with no role answers no question. A company rating has no
-- role to carry. Applying the pay rule to it would suppress every rating for
-- a reason that has nothing to do with privacy. See SliceSubject in
-- src/lib/contributions/slice-privacy.ts.
--
-- Also fixed here, found while reading the workplace worker: it kept no run
-- record at all. It sets is_current = false on every benefit and
-- pay-reliability snapshot before recomputing, and wrote nothing to
-- app.aggregate_runs — so there was no way to tell whether it had run, what
-- it released, or what it suppressed. The salary and rating workers both
-- record a run; this one now does too, one per metric, with an audit event.
--
-- Effect on live data: none. Production holds zero contributions, zero
-- benefit and pay-reliability submissions, zero review publications and zero
-- snapshots of any kind.

begin;

update app.privacy_rule_versions
set methodology_note = 'Distinct-account threshold. Every cell names an employer and is therefore a sensitive slice, requiring min_sensitive_contributors. Office- and team-scoped cells are never released.'
where metric in (
  'company_overall_rating', 'company_benefit_aggregate', 'pay_reliability_aggregate'
) and is_active;

create or replace function security.refresh_company_ratings()
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
  where metric = 'company_overall_rating' and is_active;
  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_rule.metric, v_rule.id) returning id into v_run_id;
  update app.company_rating_snapshots set is_current = false where is_current;

  with ranked as (
    select p.company_id, p.overall_rating, c.contributor_user_id,
      row_number() over (
        partition by p.company_id, c.contributor_user_id
        order by coalesce(c.decided_at, c.submitted_at) desc, c.id desc
      ) as rn
    from app.review_publications p
    join private.contributions c on c.id = p.source_contribution_id
    where p.publication_status = 'published'
      and c.state = 'approved'
      and coalesce(c.decided_at, c.submitted_at)
        <= clock_timestamp() - v_rule.minimum_publication_lag
      and c.submitted_at >= clock_timestamp() - make_interval(months => v_rule.max_age_months)
  ), latest as (
    select company_id, overall_rating, contributor_user_id
    from ranked where rn = 1
  )
  insert into app.company_rating_snapshots (
    aggregate_run_id, rule_version_id, company_id, sample_size,
    overall_rating, confidence_label, is_released, is_current
  )
  select
    v_run_id, v_rule.id, latest.company_id,
    count(*)::integer,
    round(avg(latest.overall_rating), 2),
    case when count(*) >= 20 then 'high'
         when count(*) >= 10 then 'medium' else 'low' end,
    true, true
  from latest
  group by latest.company_id
  -- A rating names the company it is about, so it is a sensitive slice.
  having count(*) >= v_rule.min_sensitive_contributors;
  get diagnostics v_released = row_count;

  select greatest(count(*)::integer - v_released, 0) into v_suppressed
  from (
    select p.company_id
    from app.review_publications p
    join private.contributions c on c.id = p.source_contribution_id
    where p.publication_status = 'published' and c.state = 'approved'
    group by p.company_id
  ) eligible;

  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      released_cells = v_released, suppressed_cells = v_suppressed
  where id = v_run_id;
  update private.aggregate_refresh_queue set processed_at = clock_timestamp()
  where metric = v_rule.metric and processed_at is null;
  return v_run_id;
exception when others then
  if v_run_id is not null then
    update app.aggregate_runs set status = 'failed', completed_at = clock_timestamp(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$function$;

create or replace function security.refresh_company_workplace_aggregates()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_benefit_rule app.privacy_rule_versions%rowtype;
  v_reliability_rule app.privacy_rule_versions%rowtype;
  v_benefit_run_id uuid;
  v_reliability_run_id uuid;
  v_benefit_count integer := 0;
  v_reliability_count integer := 0;
  v_benefit_suppressed integer := 0;
  v_reliability_suppressed integer := 0;
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

  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_benefit_rule.metric, v_benefit_rule.id) returning id into v_benefit_run_id;
  insert into app.aggregate_runs (metric, rule_version_id)
  values (v_reliability_rule.metric, v_reliability_rule.id) returning id into v_reliability_run_id;

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
    -- A benefit cell names the company it is about, so it is a sensitive
    -- slice. The benefit code is what is being measured, not who the cohort
    -- is, and does not narrow it further.
    having count(*) >= v_benefit_rule.min_sensitive_contributors
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

  select greatest(count(*)::integer - v_benefit_count, 0) into v_benefit_suppressed
  from (
    select b.company_id, b.country_code, e.key
    from private.contributions c
    join private.benefit_submissions b on b.contribution_id = c.id
    cross join lateral jsonb_each_text(b.benefits) e
    where c.state = 'approved' and b.company_id is not null and e.value = 'yes'
    group by b.company_id, b.country_code, e.key
  ) eligible;

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
    -- Reports that an employer pays late are the most damaging thing on the
    -- platform if wrong and the most identifying if the cohort is small.
    having count(*) >= v_reliability_rule.min_sensitive_contributors
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

  select greatest(count(*)::integer - v_reliability_count, 0) into v_reliability_suppressed
  from (
    select p.company_id, p.country_code
    from private.contributions c
    join private.pay_reliability_submissions p on p.contribution_id = c.id
    where c.state = 'approved' and p.company_id is not null
    group by p.company_id, p.country_code
  ) eligible;

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

  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      released_cells = v_benefit_count, suppressed_cells = v_benefit_suppressed
  where id = v_benefit_run_id;
  update app.aggregate_runs
  set status = 'succeeded', completed_at = clock_timestamp(),
      released_cells = v_reliability_count, suppressed_cells = v_reliability_suppressed
  where id = v_reliability_run_id;

  update private.aggregate_refresh_queue set processed_at = clock_timestamp()
  where metric in ('company_benefit_aggregate', 'pay_reliability_aggregate')
    and processed_at is null;

  perform audit.write_event(
    'system', 'aggregate.refreshed', 'company_workplace_aggregate_run',
    v_reliability_run_id, 'scheduled_refresh', null,
    jsonb_build_object(
      'company_benefit_cells', v_benefit_count,
      'company_benefit_suppressed', v_benefit_suppressed,
      'pay_reliability_cells', v_reliability_count,
      'pay_reliability_suppressed', v_reliability_suppressed
    ),
    array['company_benefit_cells', 'pay_reliability_cells'], null, null,
    jsonb_build_object(
      'benefit_rule_version_id', v_benefit_rule.id,
      'reliability_rule_version_id', v_reliability_rule.id,
      'benefit_run_id', v_benefit_run_id
    ), null
  );

  return jsonb_build_object(
    'company_benefit_cells', v_benefit_count,
    'pay_reliability_cells', v_reliability_count
  );
end;
$function$;

comment on function security.refresh_company_workplace_aggregates() is
  'Publishes benefit and pay-reliability aggregates under the threshold table and the slice shape rule. Every cell names an employer and is held to the sensitive threshold. Records one aggregate run per metric.';

grant execute on function security.refresh_company_ratings() to service_role;
grant execute on function security.refresh_company_workplace_aggregates() to service_role;

commit;
