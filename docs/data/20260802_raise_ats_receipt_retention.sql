-- Raise source-receipt retention on employer-owned ATS boards from 1 day to
-- 30 days.
--
-- APPLIED TO PRODUCTION 2026-08-02. 60 sources updated; all remained
-- authorized (verified via security.authorized_ats_source_config_rows()).
--
-- Why: the 1-day value dates from the metadata-only rights posture these
-- boards registered under. They gained full description-storage rights on
-- 2026-07-31 (docs/data/20260731_enable_ats_descriptions.sql), so a one-day
-- receipt life became a leftover rather than a rights constraint.
--
-- Two things it was costing us:
--   1. The audit trail was 24 hours deep. The oldest occurrence in the whole
--      table was the previous day, which does not satisfy "historical source
--      evidence remains auditable".
--   2. A board whose sync slipped past the purge lost its receipts, and the
--      public view requires a receipt link — so a source delay silently
--      un-published its jobs. That is the exact failure the serving work was
--      meant to prevent, arriving through the retention path instead.
--
-- Scope note: existing occurrences keep the retention_expires_at computed at
-- insert time, so this applies to receipts written from now on. Nothing is
-- retroactively extended and nothing already purged can be recovered.
--
-- Deliberately NOT touched: two paused Workable sources
-- (solution_sft_workable, tehora_workable) whose configs are disabled. They
-- were already paused before this change. Re-enabling them would be a rights
-- decision, not a retention fix.

update app.job_sources s
set raw_retention = interval '30 days'
from private.ats_source_configs c
where c.source_id = s.id
  and s.status = 'active'
  and s.raw_retention = interval '1 day'
  and c.provider in ('greenhouse', 'ashby', 'workable');
