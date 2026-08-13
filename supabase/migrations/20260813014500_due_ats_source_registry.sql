begin;

/*
 * Return only ATS sources that are eligible for a claim now.
 *
 * The scheduled worker previously listed every authorized source, then called
 * `worker_claim_authorized_ats_source` once per row until it found a due one.
 * With 71 authorized boards, a no-op run inspected as many as 68 rows and used
 * its whole operation budget on rejected claim RPCs. The latest production
 * failure was exactly that shape: zero claims, 68 inspections and
 * `ats_source_sync_time_budget_exhausted`.
 *
 * This function applies the same cadence and rolling daily-budget predicates
 * as the atomic claim before returning rows. The claim RPC still rechecks
 * every condition under its advisory/row locks, so this is an optimization,
 * not a new authorization decision and not a way around request limits.
 */
create or replace function api.worker_list_due_authorized_ats_sources()
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
  left join lateral (
    select
      max(claim.claimed_at) as last_claimed_at,
      count(*) filter (
        where claim.claimed_at > statement_timestamp() - interval '24 hours'
      )::integer as claims_last_24_hours
    from private.source_fetch_claims claim
    where claim.source_id = authorized.source_id
  ) claim_state on true
  where (
      claim_state.last_claimed_at is null
      or claim_state.last_claimed_at <= statement_timestamp()
        - pg_catalog.make_interval(
            secs => greatest(
              authorized.fetch_interval_seconds,
              authorized.minimum_request_spacing_seconds
            )
          )
    )
    and coalesce(claim_state.claims_last_24_hours, 0)
      < authorized.daily_request_budget
  order by claim_state.last_claimed_at asc nulls first, authorized.adapter_key;
end;
$$;

revoke all on function api.worker_list_due_authorized_ats_sources()
from public, anon, authenticated;
grant execute on function api.worker_list_due_authorized_ats_sources()
to service_role;

comment on function api.worker_list_due_authorized_ats_sources() is
  'Service-only ATS registry prefiltered to sources currently inside their reviewed cadence and rolling request budget. The atomic claim remains authoritative.';

commit;
