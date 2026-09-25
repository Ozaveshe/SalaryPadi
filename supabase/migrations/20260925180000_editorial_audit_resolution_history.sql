-- A recurring finding can be resolved more than once. Closed findings are
-- historical evidence; only simultaneous open findings should deduplicate.
-- The old status-inclusive constraint aborted draft refresh with SQLSTATE
-- 23505 when a previous resolved finding already existed for the same audit.
alter table editorial.audit_findings
  drop constraint audit_findings_audit_kind_article_id_code_status_key;

create unique index editorial_audit_findings_open_unique
  on editorial.audit_findings (audit_kind, article_id, code)
  where status = 'open';

comment on index editorial.editorial_audit_findings_open_unique is
  'Deduplicate active findings while retaining every resolved or dismissed occurrence.';
