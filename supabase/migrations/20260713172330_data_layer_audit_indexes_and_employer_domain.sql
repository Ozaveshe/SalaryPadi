-- Data-layer audit follow-up: support the two read shapes that outgrow their
-- original broad indexes, and derive employer-domain evidence at the database
-- trust boundary instead of accepting a caller assertion.

create index if not exists salary_submissions_market_cell
  on private.salary_submissions (role_family_id, country_code)
  where company_id is null;

comment on index private.salary_submissions_market_cell is
  'Supports company-agnostic salary cells keyed by role family then country without scanning employer-specific submissions.';

-- api.jobs and its public RLS policy require published, non-fixture rows and
-- apply valid_through as a request-time residual predicate. clock_timestamp()
-- is not immutable and therefore cannot appear in a partial-index predicate;
-- keep the public sort keys first and include validity plus join keys.
create index if not exists jobs_public_active_listing_order
  on app.jobs (posted_at desc, id)
  include (valid_through, company_id, source_id)
  where status = 'published' and not is_fixture;

comment on index app.jobs_public_active_listing_order is
  'Supports api.jobs active-listing scans in posted_at order while carrying validity and source/company join keys.';

-- pg_trgm intentionally remains unused here. security.find_company_by_name
-- returns a UUID directly into contribution normalization, so a similarity
-- fallback would make fuzzy text alone an automatic identity merge. Add a
-- reviewed candidate workflow before introducing trigram matching.

create or replace function security.submit_employer_job(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_company_id uuid;
  v_salary_min numeric;
  v_salary_max numeric;
  v_authorized boolean;
  v_corporate_email text;
  v_company_website text;
  v_email_domain text;
  v_website_domain text;
  v_domain_matches boolean := false;
  v_pay_period app.pay_period;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 131072 then
    raise exception using errcode = '22023', message = 'invalid submission payload';
  end if;
  v_authorized := coalesce(nullif(p_payload ->> 'authorization_attested', '')::boolean, false)
    or coalesce(p_payload ->> 'authorization_attestation', '') = 'on';
  if not v_authorized then
    raise exception using errcode = '22023', message = 'publishing authorization must be attested';
  end if;
  if coalesce(p_payload ->> 'application_url', '') !~* '^https://' then
    raise exception using errcode = '22023', message = 'application URL must use HTTPS';
  end if;

  if nullif(p_payload ->> 'company_id', '') is not null then
    v_company_id := (p_payload ->> 'company_id')::uuid;
    if not (select security.can_manage_company(v_company_id)) then
      raise exception using errcode = '42501', message = 'verified company membership required';
    end if;
  end if;

  v_corporate_email := btrim(nullif(p_payload ->> 'corporate_email', ''));
  if v_corporate_email is null or position('@' in v_corporate_email) < 2 then
    raise exception using errcode = '22023', message = 'valid corporate email required';
  end if;
  v_company_website := btrim(nullif(p_payload ->> 'company_website', ''));
  if coalesce(v_company_website, '') !~* '^https://' then
    raise exception using errcode = '22023', message = 'company website must use HTTPS';
  end if;

  -- Match the public form's established normalization: compare the final
  -- email domain with the website hostname, strip only the conventional www
  -- prefix, allow a corporate email subdomain, and reject free providers.
  v_email_domain := lower(btrim(regexp_replace(v_corporate_email, '^.*@', '')));
  v_website_domain := substring(
    lower(v_company_website)
    from '^https://([^/?#]+)'
  );
  v_website_domain := regexp_replace(
    coalesce(v_website_domain, ''),
    '^.*@',
    ''
  );
  v_website_domain := regexp_replace(v_website_domain, ':[0-9]+$', '');
  v_website_domain := regexp_replace(v_website_domain, '^www\.', '');
  v_website_domain := rtrim(v_website_domain, '.');
  v_domain_matches :=
    v_email_domain <> ''
    and v_website_domain <> ''
    and v_email_domain not in (
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
      'icloud.com', 'proton.me', 'protonmail.com'
    )
    and (
      v_email_domain = v_website_domain
      or (
        char_length(v_email_domain) > char_length(v_website_domain) + 1
        and right(
          v_email_domain,
          char_length(v_website_domain) + 1
        ) = '.' || v_website_domain
      )
    );

  -- A reviewed public company may already own this unique website domain.
  -- Reuse that public identity for the pending submission so moderation does
  -- not try to create a duplicate company. This does not grant the submitter
  -- company-management privileges; it only records the target of moderation.
  if v_company_id is null and v_domain_matches then
    select company.id into v_company_id
    from app.companies as company
    where company.website_domain = v_website_domain::extensions.citext
      and company.record_status = 'published'
    limit 1;
  end if;

  v_salary_min := coalesce(
    nullif(p_payload ->> 'salary_min', '')::numeric,
    nullif(p_payload ->> 'salary_minimum', '')::numeric
  );
  v_salary_max := coalesce(
    nullif(p_payload ->> 'salary_max', '')::numeric,
    nullif(p_payload ->> 'salary_maximum', '')::numeric
  );
  if v_salary_min is not null and v_salary_min < 0
     or v_salary_max is not null and v_salary_max < coalesce(v_salary_min, 0) then
    raise exception using errcode = '22023', message = 'invalid salary range';
  end if;
  v_pay_period := case
    when nullif(p_payload ->> 'pay_period', '') in ('hourly', 'daily', 'weekly', 'monthly', 'annual')
      then (p_payload ->> 'pay_period')::app.pay_period
    else null
  end;

  perform security.consume_rate_limit('employer_job_submit', 5, interval '1 day');

  insert into private.employer_job_submissions (
    submitted_by, company_id, company_name, corporate_email,
    corporate_email_domain, company_website, corporate_domain_matches, title,
    country_code, location_text, work_arrangement, employment_type,
    engagement_type, experience_level, eligibility_scope, eligibility_evidence,
    included_countries, excluded_countries, timezone_overlap,
    work_authorization, visa_sponsorship, salary_min, salary_max,
    currency_code, pay_period, gross_net, description_text,
    requirements_text, benefits_text, application_url, deadline,
    authorization_attested, status
  ) values (
    (select auth.uid()), v_company_id, p_payload ->> 'company_name',
    v_corporate_email::extensions.citext,
    v_email_domain::extensions.citext,
    v_company_website,
    v_domain_matches,
    p_payload ->> 'title', upper(nullif(p_payload ->> 'country_code', '')),
    nullif(p_payload ->> 'location', ''),
    coalesce(p_payload ->> 'work_arrangement', p_payload ->> 'work_mode')::app.work_arrangement,
    (p_payload ->> 'employment_type')::app.employment_type,
    coalesce(p_payload ->> 'engagement_type', p_payload ->> 'arrangement')::app.engagement_type,
    coalesce(nullif(p_payload ->> 'experience_level', ''), 'unspecified')::app.experience_level,
    (p_payload ->> 'eligibility_scope')::app.eligibility_scope,
    p_payload ->> 'eligibility_evidence',
    nullif(p_payload ->> 'included_countries', ''),
    nullif(p_payload ->> 'excluded_countries', ''),
    nullif(p_payload ->> 'timezone_overlap', ''),
    nullif(p_payload ->> 'work_authorization', ''),
    case p_payload ->> 'visa_sponsorship'
      when 'yes' then true when 'no' then false else null end,
    v_salary_min, v_salary_max,
    upper(coalesce(nullif(p_payload ->> 'currency_code', ''), nullif(p_payload ->> 'currency', ''))),
    v_pay_period,
    case coalesce(p_payload ->> 'gross_net', 'unknown')
      when 'gross' then 'gross'::app.gross_net_classification
      when 'net' then 'net'::app.gross_net_classification
      else 'unspecified'::app.gross_net_classification end,
    coalesce(p_payload ->> 'description_text', p_payload ->> 'description'),
    p_payload ->> 'requirements', nullif(p_payload ->> 'benefits', ''),
    p_payload ->> 'application_url', nullif(p_payload ->> 'deadline', '')::date,
    true, 'pending'
  ) returning id into v_id;

  perform audit.write_event(
    'user', 'employer_job_submission.created', 'employer_job_submission', v_id,
    'submitted', null, jsonb_build_object('status', 'pending'), array['status']
  );
  return v_id;
end;
$$;

-- Preserve both public signatures while discarding the historical caller
-- assertion before it reaches the privileged implementation.
create or replace function api.submit_employer_job(p_payload jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select security.submit_employer_job(
    p_payload - 'corporate_domain_matches'
  )
$$;

create or replace function api.submit_employer_job(
  submission_payload jsonb,
  corporate_domain_matches boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select security.submit_employer_job(
    submission_payload - 'corporate_domain_matches'
  )
$$;

revoke all on function security.submit_employer_job(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function api.submit_employer_job(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function api.submit_employer_job(jsonb,boolean)
  from public, anon, authenticated, service_role;

grant execute on function security.submit_employer_job(jsonb)
  to authenticated;
grant execute on function api.submit_employer_job(jsonb)
  to authenticated;
grant execute on function api.submit_employer_job(jsonb,boolean)
  to authenticated;
