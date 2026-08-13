-- Re-review the two public secondary feeds before their 2026-08-14 policy
-- horizon. The evidence was checked on 2026-08-13 against the providers'
-- current official API pages:
--
-- * Jobicy explicitly permits websites, job boards, newsletters and other
--   normal integrations, requires canonical-source attribution, and limits
--   automated polling to no more than hourly. SalaryPadi remains at 6 hours.
-- * Himalayas explicitly permits its API to backfill other job boards,
--   requires visible Himalayas attribution, and prohibits downstream
--   submission to third-party job platforms. SalaryPadi remains noindex,
--   excluded from JobPosting/email redistribution, and polls daily.
--
-- Changing a reviewed terms version deliberately pauses and revokes the old
-- authorization through security.enforce_job_source_authorization(). The
-- second update records the new review and re-activates only these two exact
-- secondary sources with no expansion of fields or distribution rights.

begin;

do $$
declare
  v_changed integer;
begin
  update app.job_sources
  set terms_version = case adapter_key
        when 'jobicy' then 'jobicy-public-api-reviewed-2026-08-13'
        when 'himalayas' then 'himalayas-public-api-reviewed-2026-08-13'
      end,
      authorization_evidence_ref = case adapter_key
        when 'jobicy' then 'https://jobicy.com/jobs-rss-feed'
        when 'himalayas' then 'https://himalayas.app/api'
      end
  where adapter_key in ('jobicy', 'himalayas')
    and source_type = 'permitted_api';

  get diagnostics v_changed = row_count;
  if v_changed <> 2 then
    raise exception using errcode = '23514',
      message = 'expected exactly two reviewed secondary sources';
  end if;
end
$$;

do $$
declare
  v_reactivated integer;
begin
  update app.job_sources
  set status = 'active',
      terms_reviewed_at = timestamptz '2026-08-13 00:00:00+00',
      terms_reviewed_by = null,
      authorization_reviewed_at = timestamptz '2026-08-13 00:00:00+00',
      authorization_reviewed_by = null,
      authorization_revoked_at = null,
      authorization_revoked_by = null,
      authorization_revocation_reason = null,
      policy_state = 'enabled',
      policy_review_due_at = timestamptz '2026-09-13 00:00:00+00'
  where adapter_key in ('jobicy', 'himalayas')
    and source_type = 'permitted_api'
    and terms_version in (
      'jobicy-public-api-reviewed-2026-08-13',
      'himalayas-public-api-reviewed-2026-08-13'
    )
    and allow_public_listing
    and not may_store_full_description
    and not may_index_jobs
    and not may_emit_jobposting_schema
    and not may_email_jobs;

  get diagnostics v_reactivated = row_count;
  if v_reactivated <> 2 then
    raise exception using errcode = '23514',
      message = 'secondary source re-review did not preserve the reviewed rights boundary';
  end if;
end
$$;

update private.job_source_dependencies dependency
set state = 'verified',
    evidence_reference = source.authorization_evidence_ref,
    reviewed_at = source.authorization_reviewed_at
from app.job_sources source
where dependency.source_id = source.id
  and source.adapter_key in ('jobicy', 'himalayas')
  and dependency.dependency_key = any(source.required_dependencies);

commit;
