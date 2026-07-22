-- Align the country-distribution gate with the rest of the eligibility
-- policy: an EMEA-scoped remote role admits candidates in African market
-- countries, because Africa is part of EMEA. The worker classifier, the
-- public-eligibility gate (security.job_is_public_remote_eligible), and the
-- Jobicy EMEA feed lane already treat EMEA as Nigeria-eligible; this gate
-- was the one remaining layer that refused it, which held 83 EMEA-scoped
-- Canonical roles out of the public view. Generic "remote" wording without
-- region evidence still implies nothing.

begin;

create or replace function security.job_explicitly_allows_country(
  p_job_id uuid,
  p_country_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.job_eligibility eligibility
    where eligibility.job_id = p_job_id
      and not exists (
        select 1 from app.job_eligibility_countries excluded
        where excluded.job_id = p_job_id
          and excluded.country_code = upper(p_country_code)
          and excluded.rule = 'exclude'
      )
      and (
        exists (
          select 1 from app.job_eligibility_countries included
          where included.job_id = p_job_id
            and included.country_code = upper(p_country_code)
            and included.rule = 'include'
        )
        or eligibility.scope = 'worldwide'
        or (
          eligibility.scope in ('africa', 'emea')
          and exists (
            select 1 from app.market_countries country
            where country.iso2 = upper(p_country_code)
              and country.region_code = 'africa'
          )
        )
        or (eligibility.scope = 'nigeria' and upper(p_country_code) = 'NG')
      )
  );
$$;

comment on function security.job_explicitly_allows_country(uuid,text) is
  'Requires explicit country, worldwide, Africa, EMEA, or Nigeria evidence for African market countries. Generic remote wording never implies African-country eligibility.';

commit;
