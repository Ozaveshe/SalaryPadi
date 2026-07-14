begin;

-- A missing/unspecified work arrangement is not evidence of a physical job.
-- Keep aggregate landing metrics aligned with the application matcher and the
-- page copy, which promise only explicit onsite or hybrid roles.
create or replace function security.job_matches_seo_landing(
  p_job_id uuid,
  p_landing_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_landing_key
      when 'remote_nigeria' then
        job.work_arrangement = 'remote'
        and (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
      when 'nigeria_local' then
        job.work_arrangement in ('onsite', 'hybrid')
        and exists (
          select 1 from app.job_locations location
          where location.job_id = job.id and location.country_code = 'NG'
        )
      when 'nigeria_graduate' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and (
          job.experience_level = 'entry'
          or job.employment_type = 'internship'
          or concat_ws(' ', job.title, job.description_text)
            ~* '\m(graduate|trainee|intern(ship)?|nysc)\M'
        )
      when 'visa_sponsorship_nigeria' then
        eligibility.visa_sponsorship is true
        and (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
      when 'nigeria_software' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, role.name)
          ~* '\m(software|developer|engineering|frontend|backend|devops|data engineer)\M'
      when 'nigeria_ngo' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, company.display_name, job.description_text)
          ~* '\m(ngo|nonprofit|non-profit|humanitarian|development organisation|development organization)\M'
      when 'role_software_engineering' then
        (
          eligibility.scope in ('worldwide', 'africa', 'nigeria')
          or exists (
            select 1 from app.job_locations location
            where location.job_id = job.id and location.country_code = 'NG'
          )
          or exists (
            select 1 from app.job_eligibility_countries country
            where country.job_id = job.id
              and country.country_code = 'NG'
              and country.rule = 'include'
          )
        )
        and concat_ws(' ', job.title, role.name)
          ~* '\m(software engineer|software developer|frontend engineer|backend engineer|full.?stack engineer)\M'
      when 'city_lagos' then
        job.work_arrangement in ('onsite', 'hybrid')
        and exists (
          select 1 from app.job_locations location
          where location.job_id = job.id
            and location.country_code = 'NG'
            and location.city ~* '^lagos$'
        )
      else false
    end
    from app.jobs job
    join app.companies company on company.id = job.company_id
    left join app.job_eligibility eligibility on eligibility.job_id = job.id
    left join app.role_families role on role.id = job.role_family_id
    where job.id = p_job_id
  ), false)
$$;

comment on function security.job_matches_seo_landing(uuid, text) is
  'Fail-closed job-to-landing matcher; physical landings require explicit onsite or hybrid evidence.';

commit;
