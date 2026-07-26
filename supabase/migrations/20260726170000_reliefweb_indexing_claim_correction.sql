-- Set ReliefWeb's may_index_jobs back to false, to match reality.
--
-- The operator chose to allow search indexing. Verified on the live site, that
-- choice has no effect: canIndexJobDetail requires a databaseId, ReliefWeb jobs
-- are served live from the API and never stored canonically, and the pages
-- render <meta name="robots" content="noindex, follow"> regardless.
--
-- So the flag asserted a right that was not being exercised. Worse, it was
-- latent: if ReliefWeb jobs were ever persisted canonically, indexing would
-- switch on silently and publish hundreds of pages carrying no description at
-- all. Thin pages at that volume damage a site's overall search standing, and
-- that must never arrive as a side effect of an unrelated change.
--
-- Turning indexing on for this source requires description rights from
-- ReliefWeb first, which is a separate permission.
--
-- may_index_jobs is watched by security.enforce_job_source_authorization, so
-- changing it on an active source pauses it, revokes the authorization and
-- voids the review. This performs the re-review the guard requires, in the
-- three steps it permits — the same pattern as 20260726160000.

begin;

update app.job_sources
set status = 'paused',
    allow_public_listing = false,
    authorization_reviewed_at = null,
    authorization_revoked_at = clock_timestamp(),
    authorization_revocation_reason = 'indexing_claim_correction'
where adapter_key = 'reliefweb';

update app.job_sources
set may_index_jobs = false
where adapter_key = 'reliefweb';

update app.job_sources
set terms_reviewed_at = timestamptz '2026-07-14T00:00:00+00:00',
    authorization_reviewed_at = timestamptz '2026-07-26T00:00:00+00:00',
    authorization_revoked_at = null,
    authorization_revocation_reason = null,
    allow_public_listing = true,
    status = 'active',
    policy_state = 'enabled'
where adapter_key = 'reliefweb';

commit;
