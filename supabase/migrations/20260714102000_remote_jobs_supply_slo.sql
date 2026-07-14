begin;

-- SalaryPadi's public jobs product is remote-first for African applicants.
-- A listing is public only when the source supplied current, affirmative
-- geography evidence. "Remote" by itself is deliberately not enough.
create or replace function security.is_african_country_code(p_country_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select upper(coalesce(p_country_code, '')) = any (array[
    'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI',
    'DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR',
    'LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN',
    'SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW'
  ]::text[]);
$$;

create or replace function security.job_is_public_remote_eligible(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.jobs job
    join app.job_eligibility eligibility on eligibility.job_id = job.id
    where job.id = p_job_id
      and job.work_arrangement = 'remote'
      and eligibility.provenance in ('source_provided', 'manually_verified')
      and eligibility.last_verified_at is not null
      and eligibility.last_verified_at >= clock_timestamp() - interval '30 days'
      and (
        eligibility.work_authorization_requirement is null
        or eligibility.work_authorization_requirement ~* (
          'country (where|in which) you (live|reside)|your country of residence'
        )
        or exists (
          select 1
          from app.job_eligibility_countries authorization_country
          join app.market_countries market
            on market.iso2 = authorization_country.country_code
          where authorization_country.job_id = job.id
            and authorization_country.rule = 'include'
            and security.is_african_country_code(authorization_country.country_code)
            and (
              eligibility.work_authorization_requirement ~* (
                '(^|[^[:alnum:]])' || market.iso2 || '([^[:alnum:]]|$)'
              )
              or eligibility.work_authorization_requirement ~* (
                '(^|[^[:alnum:]])' || market.name || '([^[:alnum:]]|$)'
              )
            )
        )
      )
      and (
        eligibility.scope in ('worldwide', 'africa', 'emea', 'nigeria')
        or (
          eligibility.scope = 'named_countries'
          and exists (
            select 1
            from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.rule = 'include'
              and security.is_african_country_code(country.country_code)
          )
        )
      )
  );
$$;

revoke all on function security.is_african_country_code(text)
from public, anon, authenticated, service_role;
revoke all on function security.job_is_public_remote_eligible(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.job_is_public_remote_eligible(uuid)
to anon, authenticated;

-- The product goal is distinct, validated canonical jobs, not raw fetches.
update private.job_supply_targets
set target_daily_new_canonical = 500,
    updated_at = clock_timestamp()
where id;

create or replace function security.public_job_provenance(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'source_adapter_key', source.adapter_key,
    'external_source_id', job.external_source_id,
    'canonical_job_id', job.id,
    'lifecycle_state', job.lifecycle_state,
    'lifecycle_reason', coalesce(job.lifecycle_reason, 'source_observed_open'),
    'why_still_open', case when job.valid_through is null
      then 'current source occurrence and no authoritative closure evidence'
      else 'source deadline has not elapsed' end,
    'last_seen_at', job.last_seen_at,
    'last_checked_at', job.last_checked_at,
    'last_verified_at', coalesce(job.last_verified_at, job.last_seen_at),
    'verification_basis', case when job.last_verified_at is null
      then 'source_occurrence_seen' else 'source_verified' end,
    'source_policy_review_due_at', source.policy_review_due_at,
    'public_display_permitted',
      security.job_country_distribution_allowed(job.id, 'public'),
    'search_index_permitted',
      source.may_index_jobs
      and security.job_country_distribution_allowed(job.id, 'index'),
    'google_jobposting_permitted',
      source.may_emit_jobposting_schema
      and security.job_country_distribution_allowed(job.id, 'jobposting'),
    'remote_africa_eligible', true,
    'country_rights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'country_code', rights.country_code,
        'review_due_at', rights.review_due_at,
        'public_display', rights.allow_public_display,
        'search_index', rights.allow_search_index,
        'google_jobposting', rights.allow_google_jobposting
      ) order by rights.country_code)
      from app.source_country_rights rights
      join app.market_countries country on country.iso2 = rights.country_code
      where rights.source_id = job.source_id
        and country.public_routes_enabled
        and security.job_source_country_policy_is_runnable(
          rights.source_id, rights.country_code
        )
    ), '[]'::jsonb),
    'occurrence_count', (
      select count(*)
      from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    ),
    'latest_occurrence_at', (
      select max(occurrence.observed_at)
      from ingest.job_occurrence_links link
      join ingest.job_source_occurrences occurrence
        on occurrence.id = link.occurrence_id
      where link.canonical_job_id = job.id
    )
  )
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where job.id = p_job_id
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and security.is_public_job_source(job.source_id)
    and security.job_is_public_remote_eligible(job.id)
    and security.job_country_distribution_allowed(job.id, 'public')
    and exists (
      select 1 from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    );
$$;

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and (select security.is_public_job_source(source_id))
  and (select security.job_is_public_remote_eligible(id))
  and (select security.job_country_distribution_allowed(id, 'public'))
  and (select security.public_job_provenance(id)) is not null
);

create or replace function api.get_job_supply_canary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visible integer;
  v_target integer;
  v_capacity integer;
  v_last_created timestamptz;
  v_state text;
begin
  select count(*)::integer
  into v_visible
  from app.jobs job
  join app.companies company on company.id = job.company_id
  where job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > clock_timestamp())
    and company.record_status = 'published'
    and security.is_public_job_source(job.source_id)
    and security.job_is_public_remote_eligible(job.id)
    and security.public_job_provenance(job.id) is not null;

  select target_daily_new_canonical
  into v_target
  from private.job_supply_targets
  where id;

  select coalesce(sum(source.expected_daily_new_canonical), 0)::integer
  into v_capacity
  from app.job_sources source
  where security.job_source_policy_is_runnable(source.id)
    and source.expected_capacity_evidence_ref is not null;

  select max(event.created_at)
  into v_last_created
  from audit.canonical_job_events event
  join app.jobs job on job.id = event.canonical_job_id
  where event.event_type = 'canonical_created'
    and security.job_is_public_remote_eligible(job.id);

  v_state := case
    when v_visible = 0 then 'unavailable'
    when v_capacity < v_target then 'capacity_unproven'
    when v_last_created is null
      or v_last_created < clock_timestamp() - interval '36 hours' then 'stale'
    else 'ready'
  end;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'visible_remote_jobs', v_visible,
    'target_daily_new_canonical', v_target,
    'authorized_daily_capacity', v_capacity,
    'last_canonical_created_at', v_last_created,
    'state', v_state
  );
end;
$$;

revoke all on function api.get_job_supply_canary()
from public, anon, authenticated, service_role;
grant execute on function api.get_job_supply_canary() to anon, authenticated;

commit;
