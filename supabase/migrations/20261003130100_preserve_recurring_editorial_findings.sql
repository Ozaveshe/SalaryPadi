begin;

-- Completed findings are history. Only open findings should be unique.
-- A repeat incident previously collided with its historical resolved record
-- when the draft refresh worker tried to resolve it (SQLSTATE 23505).
-- Existing inserts use untargeted ON CONFLICT DO NOTHING and retain their
-- duplicate-open protection with this partial index. No history is deleted.
alter table editorial.audit_findings
  drop constraint audit_findings_audit_kind_article_id_code_status_key;
create unique index editorial_findings_unique_open
  on editorial.audit_findings (audit_kind, article_id, code)
  where status = 'open';

commit;
