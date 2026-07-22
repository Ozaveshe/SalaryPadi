-- The public-eligibility gate required work_arrangement = 'remote', so the
-- first employer-ATS onsite supply (Moniepoint's Lagos roles) published in
-- app.jobs but never surfaced through api.jobs or the public read policy.
-- Non-remote roles are anchored to their stated workplace: they are now
-- publicly eligible when that workplace is in an African country, under the
-- same evidence-freshness and work-authorization requirements as remote
-- roles. Declared-remote roles keep the existing eligibility proof.

begin;

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
      and security.work_authorization_allows_african_candidate(
        job.id,
        eligibility.work_authorization_requirement
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
  )
  or exists (
    select 1
    from app.jobs job
    join app.job_eligibility eligibility on eligibility.job_id = job.id
    where job.id = p_job_id
      and job.work_arrangement <> 'remote'
      and eligibility.provenance in ('source_provided', 'manually_verified')
      and eligibility.last_verified_at is not null
      and eligibility.last_verified_at >= clock_timestamp() - interval '30 days'
      and security.work_authorization_allows_african_candidate(
        job.id,
        eligibility.work_authorization_requirement
      )
      and exists (
        select 1
        from app.job_locations location
        where location.job_id = job.id
          and security.is_african_country_code(location.country_code)
      )
  );
$$;

commit;
