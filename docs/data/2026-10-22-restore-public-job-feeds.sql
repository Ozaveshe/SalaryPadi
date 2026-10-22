-- Production data operation, separate from schema replay.
-- Reviewed public API documentation on 2026-10-22:
-- https://himalayas.app/api and https://himalayas.app/terms
-- https://jobicy.com/jobs-rss-feed
-- Restore only sources paused by the former internal review deadline.
-- Preserve their recorded integration contract, provider rights and evidence.
begin;
update app.job_sources
set status = 'active', policy_state = 'enabled'
where adapter_key in ('jobicy', 'himalayas')
  and source_type = 'permitted_api'
  and status = 'paused' and policy_state = 'expired'
  and authorization_basis = 'documented_public_api'
  and authorization_reviewed_at is not null
  and authorization_revoked_at is null
  and (authorization_expires_at is null or authorization_expires_at > statement_timestamp())
  and allow_public_listing
  and missing_dependencies = '{}'::text[];
commit;

