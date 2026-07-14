begin;

-- A country-specific work authorization is compatible with this product when
-- it still leaves at least one African applicant market eligible. Non-African
-- restrictions remain fail-closed.
create or replace function security.work_authorization_allows_african_candidate(
  p_job_id uuid,
  p_requirement text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_requirement is null
    or p_requirement ~* (
      'country (where|in which) you (live|reside)|your country of residence'
    )
    or exists (
      select 1
      from app.job_eligibility eligibility
      where eligibility.job_id = p_job_id
        and (
          (
            eligibility.scope in ('africa', 'emea')
            and p_requirement ~* '\m(Africa|African)\M'
          )
          or (
            eligibility.scope = 'nigeria'
            and p_requirement ~* '\mNigeria(n)?\M'
          )
          or exists (
            select 1
            from (
              values
                ('DZ','Algeria'), ('AO','Angola'), ('BJ','Benin'),
                ('BW','Botswana'), ('BF','Burkina[ -]Faso'), ('BI','Burundi'),
                ('CV','Cabo[ -]Verde|Cape[ -]Verde'), ('CM','Cameroon'),
                ('CF','Central[ -]African[ -]Republic'), ('TD','Chad'),
                ('KM','Comoros'), ('CG','Congo[ -]Brazzaville|Republic[ -]of[ -]the[ -]Congo'),
                ('CD','DRC|DR[ -]Congo|Democratic[ -]Republic[ -]of[ -](the[ -])?Congo'),
                ('CI','Cote[ -]d.Ivoire|Ivory[ -]Coast'), ('DJ','Djibouti'),
                ('EG','Egypt'), ('GQ','Equatorial[ -]Guinea'), ('ER','Eritrea'),
                ('SZ','Eswatini|Swaziland'), ('ET','Ethiopia'), ('GA','Gabon'),
                ('GM','(The[ -])?Gambia'), ('GH','Ghana'), ('GN','Guinea'),
                ('GW','Guinea[ -]Bissau'), ('KE','Kenya'), ('LS','Lesotho'),
                ('LR','Liberia'), ('LY','Libya'), ('MG','Madagascar'),
                ('MW','Malawi'), ('ML','Mali'), ('MR','Mauritania'),
                ('MU','Mauritius'), ('MA','Morocco'), ('MZ','Mozambique'),
                ('NA','Namibia'), ('NE','Niger'), ('NG','Nigeria'),
                ('RW','Rwanda'), ('ST','Sao[ -]Tome'), ('SN','Senegal'),
                ('SC','Seychelles'), ('SL','Sierra[ -]Leone'), ('SO','Somalia'),
                ('ZA','South[ -]Africa'), ('SS','South[ -]Sudan'), ('SD','Sudan'),
                ('TZ','Tanzania'), ('TG','Togo'), ('TN','Tunisia'),
                ('UG','Uganda'), ('ZM','Zambia'), ('ZW','Zimbabwe')
            ) as country_name(country_code, name_pattern)
            where p_requirement ~* (
                '\m(' || country_name.name_pattern || ')(n)?\M'
              )
              and (
                eligibility.scope in ('worldwide', 'africa', 'emea')
                or exists (
                  select 1
                  from app.job_eligibility_countries country
                  where country.job_id = eligibility.job_id
                    and country.rule = 'include'
                    and country.country_code = country_name.country_code
                    and security.is_african_country_code(country.country_code)
                )
              )
          )
        )
    );
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
  and (select security.job_country_distribution_allowed(id, 'public'))
  and (select security.job_is_public_remote_eligible(id))
  and (select security.public_job_provenance(id)) is not null
);

revoke all on function security.work_authorization_allows_african_candidate(uuid,text)
from public, anon, authenticated, service_role;
revoke all on function security.job_is_public_remote_eligible(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.job_is_public_remote_eligible(uuid)
to anon, authenticated;

commit;
