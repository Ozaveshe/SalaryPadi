-- Enable full job-description storage for description-capable ATS providers
-- (Greenhouse + Ashby: 9 active boards incl. moniepoint, canonical, zipline,
-- jumia, oneacrefund, mkopa). Owner decision 2026-07-31: stored descriptions
-- are required for the platform to be credible; the employer's own public
-- board is the authorization basis. Workable boards are excluded — their
-- widget API carries no description (a detail-fetch build is required).
--
-- APPLIED TO PRODUCTION 2026-07-31 via supabase_salarypadi MCP execute_sql.
-- NOTE the trap encountered: expanding rights on app.job_sources auto-revokes
-- authorization and pauses the source (fail-closed by design). The second
-- statement below is the re-authorization that followed, per the standard
-- recipe. Fetch claims were then cleared to force refetch on next worker
-- ticks; each board's next sync replaces the metadata-only placeholder in
-- app.jobs.description_text with the provider's real text.

begin;

update app.job_sources s
set allowed_fields = case
      when 'description' = any(s.allowed_fields) then s.allowed_fields
      else s.allowed_fields || array['description']
    end,
    may_store_full_description = true
from private.ats_source_configs c
where c.source_id = s.id
  and s.status = 'active'
  and c.provider in ('greenhouse', 'ashby');

update app.source_country_rights r
set allowed_fields = case
      when 'description' = any(r.allowed_fields) then r.allowed_fields
      else r.allowed_fields || array['description']
    end,
    may_store_full_description = true
from app.job_sources s
join private.ats_source_configs c on c.source_id = s.id
where r.source_id = s.id
  and s.status = 'active'
  and c.provider in ('greenhouse', 'ashby');

-- Rights expansion pauses the sources; re-authorize them (review basis:
-- owner decision 2026-07-31, this file).
update app.job_sources s
set authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    authorization_reviewed_at = now(),
    terms_reviewed_at = now(),
    status = 'active'
from private.ats_source_configs c
where c.source_id = s.id
  and c.provider in ('greenhouse', 'ashby')
  and s.status = 'paused'
  and s.may_store_full_description;

delete from private.source_fetch_claims
where source_id in (
  select s.id from app.job_sources s
  join private.ats_source_configs c on c.source_id = s.id
  where c.provider in ('greenhouse', 'ashby') and s.status = 'active'
);

commit;

-- STAGE 2 — NOT YET APPLIED. Run only after (a) the placeholder guard in
-- src/lib/seo/job-posting.ts (hasIndexableDescription) is DEPLOYED to
-- production and (b) the boards have re-synced real descriptions (verify:
-- select count(*) from app.jobs where description_text not like
-- 'This listing is available as source metadata only%' and source_id in ...).
-- Flipping earlier would index placeholder-only pages.
--
-- begin;
-- update app.job_sources s
-- set may_index_jobs = true,
--     may_emit_jobposting_schema = true
-- from private.ats_source_configs c
-- where c.source_id = s.id
--   and s.status = 'active'
--   and c.provider in ('greenhouse', 'ashby')
--   and s.may_store_full_description;
-- update app.source_country_rights r
-- set may_index_jobs = true, may_emit_jobposting_schema = true
-- from app.job_sources s
-- join private.ats_source_configs c on c.source_id = s.id
-- where r.source_id = s.id and s.status = 'active'
--   and c.provider in ('greenhouse', 'ashby');
-- (then re-authorize again if the rights expansion pauses the sources, as above)
-- commit;
