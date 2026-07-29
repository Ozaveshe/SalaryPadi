begin;

-- Serve ATS sources least-recently-claimed first.
--
-- `worker_list_authorized_ats_sources` ordered by `adapter_key`, and the
-- scheduled worker walks that list from the top on every run, claiming the
-- first source that is due and stopping at one claim per invocation. With more
-- authorized sources than the head of the list ever exhausts, the tail is never
-- reached: on 2026-07-29, 74 of 104 authorized sources had never been claimed
-- once, the alphabetical cut-off sitting at `division50_workable`. Everything
-- from "d" onward had never been fetched at all.
--
-- The visible cost was inventory. A job is only publishable once
-- `security.public_job_provenance` can attest that it was observed in a source
-- feed, and that attestation needs an `ingest.job_occurrence_links` row. Boards
-- that are never claimed are never observed, so their roles sit `published` in
-- `app.jobs` and are correctly withheld from every public surface — 62
-- Moniepoint, 11 Kuda and 7 FairMoney roles among them, all Nigeria-located and
-- otherwise fully eligible.
--
-- Ordering now by the most recent claim, nulls first, makes the walk fair: a
-- source that has never been fetched sorts ahead of every source that has, and
-- a source that was just claimed sorts to the back. `adapter_key` remains the
-- tie-breaker so the order stays deterministic.
--
-- Deliberately keyed on `private.source_fetch_claims.claimed_at` — when the
-- source was last *attempted* — rather than on when a job was last observed
-- from it. A board that legitimately returns no roles records a claim but no
-- occurrence, so ordering on observations would pin that board to the front
-- for ever and reproduce the same starvation with a different victim.
--
-- This changes only which due source is picked first. Per-source cadence,
-- request spacing and the daily budget are all still enforced inside
-- `api.worker_claim_authorized_ats_source`, which returns `claimed: false` for
-- a source that is not yet due; nothing here fetches anything more often.

create or replace function api.worker_list_authorized_ats_sources()
returns table (
  source_id uuid,
  company_id uuid,
  adapter_key text,
  source_name text,
  employer_name text,
  provider text,
  provider_region text,
  tenant_identifier text,
  allowed_destination_hosts text[],
  allowed_destination_path_prefixes text[],
  fetch_interval_seconds integer,
  daily_request_budget smallint,
  minimum_request_spacing_seconds integer,
  publication_mode text,
  homepage_url text,
  terms_url text,
  terms_version text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  may_email_jobs boolean,
  required_destination_kind text,
  authorization_basis text,
  authorization_evidence_ref text,
  authorization_grantor text,
  authorization_reviewed_at timestamptz,
  authorization_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  return query
  select authorized.*
  from security.authorized_ats_source_config_rows() authorized
  order by
    (
      select max(claim.claimed_at)
      from private.source_fetch_claims claim
      where claim.source_id = authorized.source_id
    ) asc nulls first,
    authorized.adapter_key;
end;
$$;

-- Supports the ordering subquery above and the cadence check the claim itself
-- performs; both look up the newest claim for one source.
create index if not exists source_fetch_claims_source_recent
  on private.source_fetch_claims (source_id, claimed_at desc);

commit;
