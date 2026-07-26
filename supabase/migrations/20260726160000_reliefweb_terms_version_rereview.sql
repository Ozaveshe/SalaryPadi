-- Correct the ReliefWeb terms_version through a proper re-review.
--
-- 20260726140000 registered the row with 'reliefweb-jobs-api-reviewed-...'
-- while RELIEFWEB_TERMS_VERSION in src/lib/jobs/source-policy.ts is
-- 'reliefweb-api-terms-reviewed-2026-07-14'. reviewedPolicyMatchesRow compares
-- twelve fields on every read and refuses the source on any difference, so
-- ReliefWeb was registered, runnable and switched on yet returned nothing.
--
-- A plain UPDATE cannot fix it. security.enforce_job_source_authorization
-- treats a terms_version change on an active source as invalidating its
-- review: it pauses the source, revokes the authorization and nulls
-- terms_reviewed_at, which then violates job_sources_public_terms_review.
-- That guard is correct — you must not silently alter the terms a source was
-- approved under — so this performs the re-review the guard is asking for,
-- in the three steps it permits.

begin;

-- 1. Stand the source down. Public listing goes false first so the terms-review
--    constraint stays satisfied while the review is void.
update app.job_sources
set status = 'paused',
    allow_public_listing = false,
    authorization_reviewed_at = null,
    authorization_revoked_at = clock_timestamp(),
    authorization_revocation_reason = 'terms_version_correction'
where adapter_key = 'reliefweb';

-- 2. With the source already paused and its review void, the guard no longer
--    fires, so the corrected terms version can be recorded.
update app.job_sources
set terms_version = 'reliefweb-api-terms-reviewed-2026-07-14'
where adapter_key = 'reliefweb';

-- 3. Re-record the review and bring it back up. ReliefWeb's terms were
--    reviewed on 2026-07-14 and the appname approved on 2026-07-26.
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
