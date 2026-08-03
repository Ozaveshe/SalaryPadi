-- Enable full job-description storage for the Workable boards.
--
-- STAGE 1 APPLIED TO PRODUCTION 2026-08-03. Stage 2 (indexing) is deliberately
-- not part of this file; see the note at the bottom.
--
-- Workable was excluded from the 2026-07-31 rights expansion for a technical
-- reason, not a legal one: its widget API appeared to carry no description, and
-- a per-posting detail fetch would have exhausted a four-request daily budget.
-- That was wrong. The widget account endpoint takes `details=true` and returns
-- the description inside the same single call, which shipped in the adapter
-- before this script ran.
--
-- The legal basis is therefore the same one the owner accepted on 2026-07-31:
-- stored descriptions are required for the platform to be credible, and the
-- employer's own public board is the authorization basis. Nothing about that
-- reasoning distinguished Workable from Greenhouse or Ashby.
--
-- Scale: 51 of the 60 authorized boards, 105 published jobs, every one of them
-- currently holding the metadata-only placeholder.
--
-- Note the trap, unchanged since July: expanding rights on app.job_sources
-- auto-revokes authorization and pauses the source (fail-closed by design), so
-- the re-authorization below is part of the same transaction. Fetch claims are
-- then cleared so each board refetches on its next worker tick rather than
-- waiting out its interval.

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
  and c.provider = 'workable';

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
  and c.provider = 'workable';

-- Rights expansion pauses the sources; re-authorize them (review basis: owner
-- decision 2026-07-31, extended to Workable by this file).
update app.job_sources s
set authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    authorization_reviewed_at = now(),
    terms_reviewed_at = now(),
    status = 'active'
from private.ats_source_configs c
where c.source_id = s.id
  and c.provider = 'workable'
  and s.status = 'paused'
  and s.may_store_full_description;

delete from private.source_fetch_claims
where source_id in (
  select s.id from app.job_sources s
  join private.ats_source_configs c on c.source_id = s.id
  where c.provider = 'workable' and s.status = 'active'
);

commit;

-- STAGE 2 — NOT APPLIED. Indexing rights for these boards wait until they have
-- actually backfilled real descriptions, exactly as Greenhouse and Ashby did in
-- July. `hasIndexableDescription` keeps any straggler placeholder page noindex
-- regardless, but flipping may_index_jobs before the text exists would put 105
-- title-only pages in front of Google, which is the opposite of the point.
-- Re-run the July file's stage 2 with provider = 'workable' once the boards
-- report real descriptions.
