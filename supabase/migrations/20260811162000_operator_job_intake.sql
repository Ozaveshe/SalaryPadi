-- Give AAL2 career-data staff a source-backed job-intake path that enters the
-- existing moderation queue. Intake never publishes directly; an AAL2 admin
-- must review the retained source evidence and approve the moderation case.

begin;

alter table private.employer_job_submissions
  add column if not exists submission_kind text not null default 'employer',
  add column if not exists source_url text,
  add column if not exists source_evidence text,
  add column if not exists authorization_evidence text,
  add column if not exists intake_reason text;

alter table private.employer_job_submissions
  drop constraint if exists employer_submission_kind_valid,
  add constraint employer_submission_kind_valid
    check (submission_kind in ('employer', 'operator')),
  drop constraint if exists employer_submission_source_https,
  add constraint employer_submission_source_https
    check (source_url is null or source_url ~* '^https://'),
  drop constraint if exists employer_submission_operator_evidence,
  add constraint employer_submission_operator_evidence check (
    submission_kind <> 'operator' or (
      source_url is not null
      and char_length(source_evidence) between 10 and 2000
      and char_length(authorization_evidence) between 10 and 2000
      and char_length(intake_reason) between 3 and 500
    )
  );

create index if not exists employer_submissions_operator_queue
  on private.employer_job_submissions (status, submitted_at desc)
  where submission_kind = 'operator';

create or replace function api.admin_submit_job_intake(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_company_id uuid;
  v_company_website text;
  v_company_domain text;
  v_salary_min numeric;
  v_salary_max numeric;
  v_pay_period app.pay_period;
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 131072
     or exists (
       select 1 from jsonb_object_keys(p_payload) as payload_key(key)
       where key <> all (array[
         'company_name', 'company_website', 'title', 'country_code', 'location',
         'work_mode', 'employment_type', 'arrangement', 'experience_level',
         'eligibility_scope', 'eligibility_evidence', 'included_countries',
         'excluded_countries', 'timezone_overlap', 'work_authorization',
         'visa_sponsorship', 'salary_minimum', 'salary_maximum', 'currency',
         'pay_period', 'gross_net', 'description', 'requirements', 'benefits',
         'application_url', 'deadline', 'source_url', 'source_evidence',
         'intake_reason', 'authorization_evidence', 'authorization_attestation'
       ])
     ) then
    raise exception using errcode = '22023', message = 'invalid operator intake payload';
  end if;

  if char_length(btrim(coalesce(p_payload ->> 'company_name', ''))) not between 2 and 200
     or char_length(btrim(coalesce(p_payload ->> 'title', ''))) not between 2 and 300
     or char_length(btrim(coalesce(p_payload ->> 'description', ''))) not between 100 and 20000
     or char_length(btrim(coalesce(p_payload ->> 'requirements', ''))) not between 20 and 10000
     or char_length(btrim(coalesce(p_payload ->> 'location', ''))) not between 2 and 200
     or upper(coalesce(p_payload ->> 'country_code', '')) !~ '^[A-Z]{2}$'
     or coalesce(p_payload ->> 'work_mode', '') not in ('remote', 'hybrid', 'onsite')
     or coalesce(p_payload ->> 'employment_type', '') not in (
       'full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance'
     )
     or coalesce(p_payload ->> 'arrangement', '') not in ('employee', 'contractor', 'freelance')
     or coalesce(p_payload ->> 'experience_level', '') not in (
       'entry', 'mid', 'senior', 'lead', 'executive'
     )
     or coalesce(p_payload ->> 'eligibility_scope', '') not in (
       'worldwide', 'africa', 'emea', 'nigeria', 'named_countries',
       'restricted_region', 'unclear'
     )
     or char_length(btrim(coalesce(p_payload ->> 'eligibility_evidence', ''))) not between 5 and 2000
     or coalesce(p_payload ->> 'visa_sponsorship', '') not in ('yes', 'no', 'unclear')
     or coalesce(p_payload ->> 'pay_period', '') not in (
       'hourly', 'daily', 'weekly', 'monthly', 'annual', 'unknown'
     )
     or coalesce(p_payload ->> 'gross_net', '') not in ('gross', 'net', 'unknown')
     or coalesce(p_payload ->> 'source_url', '') !~* '^https://'
     or coalesce(p_payload ->> 'application_url', '') !~* '^https://'
     or (nullif(p_payload ->> 'company_website', '') is not null
       and (p_payload ->> 'company_website') !~* '^https://')
     or char_length(btrim(coalesce(p_payload ->> 'source_evidence', ''))) not between 10 and 2000
     or char_length(btrim(coalesce(p_payload ->> 'authorization_evidence', ''))) not between 10 and 2000
     or coalesce(p_payload ->> 'authorization_attestation', '') <> 'on'
     or char_length(btrim(coalesce(p_payload ->> 'intake_reason', ''))) not between 3 and 500
     or char_length(coalesce(p_payload ->> 'included_countries', '')) > 1000
     or char_length(coalesce(p_payload ->> 'excluded_countries', '')) > 1000
     or char_length(coalesce(p_payload ->> 'timezone_overlap', '')) > 300
     or char_length(coalesce(p_payload ->> 'work_authorization', '')) > 500
     or char_length(coalesce(p_payload ->> 'benefits', '')) > 5000 then
    raise exception using errcode = '22023', message = 'invalid operator intake fields';
  end if;

  if nullif(p_payload ->> 'salary_minimum', '') is not null then
    if (p_payload ->> 'salary_minimum') !~ '^[0-9]+(?:\.[0-9]{1,2})?$' then
      raise exception using errcode = '22023', message = 'invalid minimum salary';
    end if;
    v_salary_min := (p_payload ->> 'salary_minimum')::numeric;
  end if;
  if nullif(p_payload ->> 'salary_maximum', '') is not null then
    if (p_payload ->> 'salary_maximum') !~ '^[0-9]+(?:\.[0-9]{1,2})?$' then
      raise exception using errcode = '22023', message = 'invalid maximum salary';
    end if;
    v_salary_max := (p_payload ->> 'salary_maximum')::numeric;
  end if;
  if v_salary_max is not null and v_salary_max < coalesce(v_salary_min, 0) then
    raise exception using errcode = '22023', message = 'invalid salary range';
  end if;
  if (v_salary_min is not null or v_salary_max is not null)
     and coalesce(p_payload ->> 'currency', '') !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'salary currency required';
  end if;
  v_pay_period := case when p_payload ->> 'pay_period' = 'unknown' then null
    else (p_payload ->> 'pay_period')::app.pay_period end;

  v_company_website := nullif(btrim(p_payload ->> 'company_website'), '');
  if v_company_website is not null then
    v_company_domain := substring(lower(v_company_website) from '^https://([^/?#]+)');
    v_company_domain := regexp_replace(coalesce(v_company_domain, ''), ':[0-9]+$', '');
    v_company_domain := regexp_replace(v_company_domain, '^www\.', '');
    v_company_domain := rtrim(v_company_domain, '.');
    select company.id into v_company_id
    from app.companies company
    where company.website_domain = v_company_domain::extensions.citext
      and company.record_status = 'published'
    limit 1;
  end if;

  insert into private.employer_job_submissions (
    submitted_by, company_id, company_name, company_website, title, country_code,
    location_text, work_arrangement, employment_type, engagement_type,
    experience_level, eligibility_scope, eligibility_evidence,
    included_countries, excluded_countries, timezone_overlap,
    work_authorization, visa_sponsorship, salary_min, salary_max,
    currency_code, pay_period, gross_net, description_text,
    requirements_text, benefits_text, application_url, deadline,
    authorization_attested, status, submission_kind, source_url,
    source_evidence, authorization_evidence, intake_reason
  ) values (
    (select auth.uid()), v_company_id, btrim(p_payload ->> 'company_name'),
    v_company_website, btrim(p_payload ->> 'title'),
    upper(p_payload ->> 'country_code'), nullif(btrim(p_payload ->> 'location'), ''),
    (p_payload ->> 'work_mode')::app.work_arrangement,
    (p_payload ->> 'employment_type')::app.employment_type,
    (p_payload ->> 'arrangement')::app.engagement_type,
    (p_payload ->> 'experience_level')::app.experience_level,
    (p_payload ->> 'eligibility_scope')::app.eligibility_scope,
    btrim(p_payload ->> 'eligibility_evidence'),
    nullif(btrim(p_payload ->> 'included_countries'), ''),
    nullif(btrim(p_payload ->> 'excluded_countries'), ''),
    nullif(btrim(p_payload ->> 'timezone_overlap'), ''),
    nullif(btrim(p_payload ->> 'work_authorization'), ''),
    case p_payload ->> 'visa_sponsorship'
      when 'yes' then true when 'no' then false else null end,
    v_salary_min, v_salary_max, nullif(p_payload ->> 'currency', ''),
    v_pay_period,
    case p_payload ->> 'gross_net' when 'gross' then 'gross'::app.gross_net_classification
      when 'net' then 'net'::app.gross_net_classification
      else 'unspecified'::app.gross_net_classification end,
    btrim(p_payload ->> 'description'), btrim(p_payload ->> 'requirements'),
    nullif(btrim(p_payload ->> 'benefits'), ''), p_payload ->> 'application_url',
    nullif(p_payload ->> 'deadline', '')::date, true, 'pending', 'operator',
    p_payload ->> 'source_url', btrim(p_payload ->> 'source_evidence'),
    btrim(p_payload ->> 'authorization_evidence'),
    btrim(p_payload ->> 'intake_reason')
  ) returning id into v_id;

  perform audit.write_event(
    'staff', 'job_intake.created', 'employer_job_submission', v_id, 'submitted',
    null, jsonb_build_object('status', 'pending', 'submission_kind', 'operator'),
    array['status', 'submission_kind'], null, null,
    jsonb_build_object('reason', btrim(p_payload ->> 'intake_reason'))
  );
  return v_id;
end;
$$;

create or replace function api.admin_list_job_intake(p_limit integer default 50)
returns table(
  id uuid, moderation_case_id uuid, title text, company_name text,
  source_url text, status text, submitted_at timestamptz, case_version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid intake limit';
  end if;
  return query
  select submission.id, moderation.id, left(submission.title, 300),
    left(submission.company_name, 200), submission.source_url,
    submission.status::text, submission.submitted_at, moderation.version
  from private.employer_job_submissions submission
  join private.moderation_cases moderation
    on moderation.employer_submission_id = submission.id
  where submission.submission_kind = 'operator'
  order by (submission.status in ('pending', 'in_review', 'revision_requested')) desc,
    submission.submitted_at desc, submission.id
  limit p_limit;
end;
$$;

create or replace function api.admin_get_job_intake_detail(p_submission_id uuid)
returns table(submission_data jsonb, moderation_data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;
  return query
  select jsonb_build_object(
    'id', submission.id, 'title', submission.title,
    'company_name', submission.company_name, 'company_website', submission.company_website,
    'country_code', submission.country_code, 'location', submission.location_text,
    'work_mode', submission.work_arrangement::text,
    'employment_type', submission.employment_type::text,
    'arrangement', submission.engagement_type::text,
    'experience_level', submission.experience_level::text,
    'eligibility_scope', submission.eligibility_scope::text,
    'eligibility_evidence', submission.eligibility_evidence,
    'included_countries', submission.included_countries,
    'excluded_countries', submission.excluded_countries,
    'timezone_overlap', submission.timezone_overlap,
    'work_authorization', submission.work_authorization,
    'visa_sponsorship', submission.visa_sponsorship,
    'salary_minimum', submission.salary_min, 'salary_maximum', submission.salary_max,
    'currency', submission.currency_code, 'pay_period', submission.pay_period::text,
    'gross_net', submission.gross_net::text, 'description', submission.description_text,
    'requirements', submission.requirements_text, 'benefits', submission.benefits_text,
    'application_url', submission.application_url, 'deadline', submission.deadline,
    'source_url', submission.source_url, 'source_evidence', submission.source_evidence,
    'authorization_evidence', submission.authorization_evidence,
    'intake_reason', submission.intake_reason, 'status', submission.status::text,
    'submitted_at', submission.submitted_at, 'updated_at', submission.updated_at
  ), jsonb_build_object(
    'case_id', moderation.id, 'state', moderation.state::text,
    'priority', moderation.priority, 'version', moderation.version,
    'opened_at', moderation.opened_at, 'closed_at', moderation.closed_at
  )
  from private.employer_job_submissions submission
  join private.moderation_cases moderation
    on moderation.employer_submission_id = submission.id
  where submission.id = p_submission_id and submission.submission_kind = 'operator';
end;
$$;

-- Preserve the retained source URL when moderation creates or updates the job.
create or replace function security.operator_submission_job_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source_url text;
begin
  if exists (
    select 1 from app.job_sources source
    where source.id = new.source_id
      and source.adapter_key = 'salarypadi_employer_submissions'
  ) then
    select submission.source_url into v_source_url
    from private.employer_job_submissions submission
    where submission.id::text = new.external_source_id;
    new.source_url := coalesce(v_source_url, new.source_url);
  end if;
  return new;
end;
$$;

drop trigger if exists a_operator_submission_job_source on app.jobs;
create trigger a_operator_submission_job_source
before insert or update on app.jobs
for each row execute function security.operator_submission_job_source();

-- A submitted eligibility statement remains source-provided after admin
-- moderation. Approval is not proof that SalaryPadi independently verified it.
create or replace function security.submission_eligibility_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from app.jobs job
    join app.job_sources source on source.id = job.source_id
    where job.id = new.job_id
      and source.adapter_key = 'salarypadi_employer_submissions'
  ) then
    new.provenance := 'source_provided';
    new.confidence := least(coalesce(new.confidence, 0.8), 0.8);
    new.verified_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists a_submission_eligibility_provenance on app.job_eligibility;
create trigger a_submission_eligibility_provenance
before insert or update on app.job_eligibility
for each row execute function security.submission_eligibility_provenance();

update app.job_eligibility eligibility
set provenance = 'source_provided',
    confidence = least(coalesce(eligibility.confidence, 0.8), 0.8),
    verified_by = null
from app.jobs job
join app.job_sources source on source.id = job.source_id
where eligibility.job_id = job.id
  and source.adapter_key = 'salarypadi_employer_submissions';

-- The first-party submission lane is authorized per record. Both employer and
-- operator submissions retain an authorization attestation, enter moderation,
-- and remain unpublished until approval. A reachable public URL alone is not
-- an authorization basis.
update app.job_sources
set status = 'paused',
    policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'title', 'company', 'description', 'application_url', 'location',
      'source_url', 'work_arrangement', 'eligibility', 'salary', 'deadline',
      'valid_through', 'employment_type', 'engagement_type'
    ],
    policy_review_due_at = timestamptz '2027-08-11 00:00:00+00',
    terms_reviewed_at = timestamptz '2026-08-11 00:00:00+00',
    authorization_reviewed_at = null,
    authorization_reviewed_by = null,
    required_dependencies = array[
      'moderated_employer_submission', 'authorization_attestation'
    ],
    missing_dependencies = '{}'::text[]
where adapter_key = 'salarypadi_employer_submissions';

-- Changing the source policy deliberately invalidates its prior authorization
-- in the policy-change trigger. Record the newly reviewed authorization in a
-- separate statement so that invalidation cannot overwrite this review.
update app.job_sources
set authorization_basis = 'first_party',
    authorization_evidence_ref =
      'repo:docs/JOB_SOURCE_POLICY_MATRIX.md:direct-employer-submissions:reviewed-2026-08-11',
    authorization_reviewed_at = timestamptz '2026-08-11 00:00:00+00',
    authorization_expires_at = null,
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    may_email_jobs = false
where adapter_key = 'salarypadi_employer_submissions';

update app.job_sources
set status = 'active'
where adapter_key = 'salarypadi_employer_submissions';

-- The direct-salary trigger records the disclosed numbers. Attach the retained
-- source reference after that trigger runs so the row is evidence-bearing,
-- rather than merely repeating the salary as its own citation.
create or replace function security.attach_direct_salary_source_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.salary_min is not null or new.salary_max is not null then
    update app.job_salary_evidence evidence
    set source_text = jsonb_strip_nulls(jsonb_build_object(
      'evidence_ref', new.source_url,
      'currency', new.currency_code, 'minimum', new.salary_min,
      'maximum', new.salary_max, 'period', new.pay_period,
      'gross_net', new.gross_net
    ))::text
    where evidence.job_id = new.id and evidence.occurrence_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists z_attach_direct_salary_source_reference on app.jobs;
create trigger z_attach_direct_salary_source_reference
after insert or update of salary_min, salary_max, currency_code, pay_period,
  gross_net, source_url on app.jobs
for each row execute function security.attach_direct_salary_source_reference();

update app.job_salary_evidence evidence
set source_text = jsonb_strip_nulls(jsonb_build_object(
  'evidence_ref', job.source_url,
  'currency', job.currency_code, 'minimum', job.salary_min,
  'maximum', job.salary_max, 'period', job.pay_period,
  'gross_net', job.gross_net
))::text
from app.jobs job
join app.job_sources source on source.id = job.source_id
where evidence.job_id = job.id and evidence.occurrence_id is null
  and source.source_type in ('direct_employer', 'manual');

revoke all on function api.admin_submit_job_intake(jsonb) from public, anon;
grant execute on function api.admin_submit_job_intake(jsonb) to authenticated;
revoke all on function api.admin_list_job_intake(integer) from public, anon;
grant execute on function api.admin_list_job_intake(integer) to authenticated;
revoke all on function api.admin_get_job_intake_detail(uuid) from public, anon;
grant execute on function api.admin_get_job_intake_detail(uuid) to authenticated;
revoke all on function security.operator_submission_job_source()
  from public, anon, authenticated, service_role;
revoke all on function security.submission_eligibility_provenance()
  from public, anon, authenticated, service_role;
revoke all on function security.attach_direct_salary_source_reference()
  from public, anon, authenticated, service_role;

commit;
