-- Explicit owner request: enable private metadata job alerts for active,
-- reviewed public employer boards and Jobicy's newsletter-permitting feed.
-- No descriptions are emailed; every role carries its original source link.
-- Run only after 20261022120000_reliable_country_job_alerts.
begin;
create temporary table alert_source_activation on commit drop as
select id,authorization_reviewed_by from app.job_sources
where status='active' and authorization_revoked_at is null
  and authorization_basis='documented_public_api'
  and (source_type='employer_ats' or adapter_key='jobicy')
  and security.job_source_policy_is_runnable(id);
update app.job_sources set may_email_jobs=true
where id in(select id from alert_source_activation);
-- Permission edits intentionally revoke the previous review; explicitly
-- re-review only this captured set, within the same transaction.
update app.job_sources s set authorization_reviewed_at=clock_timestamp(),
  authorization_reviewed_by=a.authorization_reviewed_by,
  authorization_revoked_at=null,authorization_revoked_by=null,
  authorization_revocation_reason=null
from alert_source_activation a where s.id=a.id;
update app.job_sources set status='active'
where id in(select id from alert_source_activation);
commit;
