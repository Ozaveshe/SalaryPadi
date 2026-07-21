-- Grant the Moniepoint board Nigeria country-pack rights, derived from its
-- reviewed source policy exactly as the country-pack architecture migration
-- derives rights for the other active sources. Without this row the worker
-- country-rights guard refuses every fetch for the source.

begin;

insert into app.source_country_rights (
  source_id, country_code, policy_state, permission_basis,
  evidence_reference, terms_url, reviewed_at, review_due_at, allowed_fields,
  may_store_full_description, attribution_required, attribution_text,
  minimum_poll_interval, retention_period, allow_public_display,
  allow_search_index, allow_google_jobposting, missing_dependencies
)
select source.id, 'NG', 'enabled'::app.source_policy_state,
  source.authorization_basis, source.authorization_evidence_ref,
  source.terms_url, source.authorization_reviewed_at,
  source.policy_review_due_at, source.allowed_fields,
  source.may_store_full_description, source.attribution_required,
  source.attribution_text, source.minimum_poll_interval,
  source.raw_retention, source.allow_public_listing,
  source.may_index_jobs, source.may_emit_jobposting_schema,
  '{}'::text[]
from app.job_sources source
where source.adapter_key = 'moniepoint_greenhouse'
  and not exists (
    select 1 from app.source_country_rights rights
    where rights.source_id = source.id and rights.country_code = 'NG'
  );

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select s.id, dep.key, 'verified',
  case dep.key
    when 'employer_application_destination' then 'ATS destination policy allows only job-boards greenhouse hosts under /moniepoint; required_destination_kind=employer_application_url'
    when 'clickable_source_attribution' then 'Job Truth Card renders clickable source attribution and the original source link for every ATS job'
  end,
  clock_timestamp()
from app.job_sources s
cross join (values
  ('employer_application_destination'), ('clickable_source_attribution')
) dep(key)
where s.adapter_key = 'moniepoint_greenhouse'
  and not exists (
    select 1 from private.job_source_dependencies d
    where d.source_id = s.id and d.dependency_key = dep.key
  );

commit;
