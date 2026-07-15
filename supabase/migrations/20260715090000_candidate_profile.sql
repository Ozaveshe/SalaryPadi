begin;

-- Candidate-side profile.
--
-- Every value in this table is a claim the candidate makes about themselves.
-- Nothing here is derived, inferred, or generated. `attested_at` records when
-- the owner last confirmed their own claims; match scoring treats a stale or
-- absent attestation as missing data rather than as a negative signal.
--
-- Skills are deliberately not modelled here yet. `app.skills` carries no
-- vocabulary and `app.job_skills` is never populated, so a candidate-side skill
-- table would have nothing to join against and no valid value to accept. Skills
-- arrive in the change that gives them a truthful source on the job side.

create table if not exists private.candidate_profiles (
  user_id uuid primary key references private.profiles(user_id) on delete cascade,
  headline text,
  summary text,
  years_experience smallint,
  experience_level app.experience_level not null default 'unspecified',
  desired_work_arrangement app.work_arrangement not null default 'unspecified',
  desired_salary_min numeric(14, 2),
  desired_salary_max numeric(14, 2),
  desired_currency_code text,
  desired_pay_period app.pay_period,
  location_country text,
  open_to_relocation boolean not null default false,
  attested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_headline_length check (
    headline is null or char_length(headline) between 2 and 160
  ),
  constraint candidate_summary_length check (
    summary is null or char_length(summary) <= 5000
  ),
  constraint candidate_years_range check (
    years_experience is null or years_experience between 0 and 60
  ),
  constraint candidate_currency_format check (
    desired_currency_code is null or desired_currency_code ~ '^[A-Z]{3}$'
  ),
  constraint candidate_country_format check (
    location_country is null or location_country ~ '^[A-Z]{2}$'
  ),
  constraint candidate_salary_non_negative check (
    (desired_salary_min is null or desired_salary_min >= 0)
    and (desired_salary_max is null or desired_salary_max >= 0)
  ),
  constraint candidate_salary_order check (
    desired_salary_min is null
    or desired_salary_max is null
    or desired_salary_min <= desired_salary_max
  ),
  -- A salary expectation is only interpretable with both a currency and a period.
  constraint candidate_salary_needs_units check (
    (desired_salary_min is null and desired_salary_max is null)
    or (desired_currency_code is not null and desired_pay_period is not null)
  )
);

alter table private.candidate_profiles enable row level security;
alter table private.candidate_profiles force row level security;

drop policy if exists candidate_profiles_owner_all on private.candidate_profiles;
create policy candidate_profiles_owner_all on private.candidate_profiles
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

create or replace function security.get_my_candidate_profile()
returns table (
  headline text,
  summary text,
  years_experience smallint,
  experience_level app.experience_level,
  desired_work_arrangement app.work_arrangement,
  desired_salary_min numeric,
  desired_salary_max numeric,
  desired_currency_code text,
  desired_pay_period app.pay_period,
  location_country text,
  open_to_relocation boolean,
  attested_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select
    p.headline, p.summary, p.years_experience, p.experience_level,
    p.desired_work_arrangement, p.desired_salary_min, p.desired_salary_max,
    p.desired_currency_code, p.desired_pay_period, p.location_country,
    p.open_to_relocation, p.attested_at, p.updated_at
  from private.candidate_profiles p
  where p.user_id = (select auth.uid());
end;
$$;

-- Saving the profile is itself the act of attestation: the owner is confirming
-- these claims are true of them, so `attested_at` advances on every write.
create or replace function security.save_my_candidate_profile(profile_payload jsonb)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_attested_at timestamptz := clock_timestamp();
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if profile_payload is null or jsonb_typeof(profile_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  insert into private.candidate_profiles as cp (
    user_id, headline, summary, years_experience, experience_level,
    desired_work_arrangement, desired_salary_min, desired_salary_max,
    desired_currency_code, desired_pay_period, location_country,
    open_to_relocation, attested_at, updated_at
  )
  values (
    v_user_id,
    nullif(btrim(profile_payload ->> 'headline'), ''),
    nullif(btrim(profile_payload ->> 'summary'), ''),
    (profile_payload ->> 'years_experience')::smallint,
    coalesce(
      (profile_payload ->> 'experience_level')::app.experience_level,
      'unspecified'
    ),
    coalesce(
      (profile_payload ->> 'desired_work_arrangement')::app.work_arrangement,
      'unspecified'
    ),
    (profile_payload ->> 'desired_salary_min')::numeric,
    (profile_payload ->> 'desired_salary_max')::numeric,
    nullif(btrim(upper(profile_payload ->> 'desired_currency_code')), ''),
    (profile_payload ->> 'desired_pay_period')::app.pay_period,
    nullif(btrim(upper(profile_payload ->> 'location_country')), ''),
    coalesce((profile_payload ->> 'open_to_relocation')::boolean, false),
    v_attested_at,
    v_attested_at
  )
  on conflict (user_id) do update set
    headline = excluded.headline,
    summary = excluded.summary,
    years_experience = excluded.years_experience,
    experience_level = excluded.experience_level,
    desired_work_arrangement = excluded.desired_work_arrangement,
    desired_salary_min = excluded.desired_salary_min,
    desired_salary_max = excluded.desired_salary_max,
    desired_currency_code = excluded.desired_currency_code,
    desired_pay_period = excluded.desired_pay_period,
    location_country = excluded.location_country,
    open_to_relocation = excluded.open_to_relocation,
    attested_at = excluded.attested_at,
    updated_at = excluded.updated_at
  where cp.user_id = v_user_id;

  return v_attested_at;
end;
$$;

create or replace function api.get_my_candidate_profile()
returns table (
  headline text,
  summary text,
  years_experience smallint,
  experience_level text,
  desired_work_arrangement text,
  desired_salary_min numeric,
  desired_salary_max numeric,
  desired_currency_code text,
  desired_pay_period text,
  location_country text,
  open_to_relocation boolean,
  attested_at timestamptz,
  updated_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select
    p.headline, p.summary, p.years_experience, p.experience_level::text,
    p.desired_work_arrangement::text, p.desired_salary_min, p.desired_salary_max,
    p.desired_currency_code, p.desired_pay_period::text, p.location_country,
    p.open_to_relocation, p.attested_at, p.updated_at
  from security.get_my_candidate_profile() p
$$;

create or replace function api.save_my_candidate_profile(profile_payload jsonb)
returns timestamptz
language sql volatile security invoker set search_path = ''
as $$ select security.save_my_candidate_profile(profile_payload) $$;

grant execute on function security.get_my_candidate_profile() to authenticated;
grant execute on function security.save_my_candidate_profile(jsonb) to authenticated;

grant execute on function api.get_my_candidate_profile() to authenticated;
grant execute on function api.save_my_candidate_profile(jsonb) to authenticated;

commit;
