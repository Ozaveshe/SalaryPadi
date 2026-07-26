-- Authorization and audit for employer CSV import.
--
-- DECISION: operator-authorized import, with the verified-employer chain wired
-- in as an ADDITIONAL grant rather than the sole basis.
--
-- security.can_manage_company() and the claim -> moderation -> membership chain
-- are fully implemented, but as of 2026-07-26 production holds 0 company claims
-- and 0 company memberships, and no application code calls the predicate. It is
-- sufficient in principle and unexercised in practice, so the first
-- employer-facing write path is not staked on it alone.
--
-- One predicate accepts EITHER branch. Today only the operator branch can be
-- true. When the first employer is genuinely verified, self-service works
-- through the same audited path with no redesign — and the audit row records
-- which branch authorized each import, so the transition is observable rather
-- than assumed.
--
-- This is labelled "operator-authorized employer CSV import". It is NOT
-- employer self-service, and no UI may describe it as such until a verified
-- membership has actually authorized an import.

begin;

/* ---------------------------------------------------------------------------
 * 1. Who may import for a feed.
 * ------------------------------------------------------------------------ */
create or replace function security.employer_feed_import_grant(p_feed_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Operator branch: a staff admin at AAL2. The only branch reachable today.
    when (select security.has_staff_role('admin'))
     and (select security.is_aal2())
      then 'operator'
    -- Verified-employer branch: a current, unrevoked membership for the
    -- company this feed belongs to. Reachable only once a company claim has
    -- actually been verified.
    when exists (
      select 1
      from app.job_sources s
      join private.ats_source_configs cfg on cfg.source_id = s.id
      where s.adapter_key = p_feed_key
        and s.source_type = 'direct_employer'
        and cfg.provider = 'employer_csv_import'
        and (select security.can_manage_company(cfg.company_id))
    ) then 'verified_employer'
    else null
  end
$$;

create or replace function api.can_import_employer_feed(p_feed_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select security.employer_feed_import_grant(p_feed_key) is not null
$$;

revoke all on function security.employer_feed_import_grant(text)
  from public, anon, authenticated;
revoke all on function api.can_import_employer_feed(text) from public, anon;
grant execute on function security.employer_feed_import_grant(text)
  to authenticated;
grant execute on function api.can_import_employer_feed(text) to authenticated;

/* ---------------------------------------------------------------------------
 * 2. Audit. Every import attempt is recorded, accepted or refused.
 *
 * A refused attempt is the one most worth keeping: it is how an unauthorized
 * actor or a wrong employer/feed association becomes visible.
 * ------------------------------------------------------------------------ */
create table if not exists private.employer_feed_imports (
  id uuid primary key default gen_random_uuid(),
  feed_key text not null check (feed_key ~ '^[a-z0-9_]{1,80}$'),
  actor_user_id uuid not null,
  -- Which branch authorized it, or null when the attempt was refused.
  grant_kind text check (grant_kind in ('operator', 'verified_employer')),
  outcome text not null check (outcome in (
    'previewed', 'imported', 'refused_unauthorized', 'refused_policy',
    'refused_invalid_payload', 'failed'
  )),
  payload_sha256 text check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_bytes integer check (payload_bytes >= 0),
  record_count integer check (record_count >= 0),
  accepted_count integer check (accepted_count >= 0),
  reason_code text,
  import_run_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists employer_feed_imports_feed_created_idx
  on private.employer_feed_imports (feed_key, created_at desc);

alter table private.employer_feed_imports enable row level security;
alter table private.employer_feed_imports force row level security;

/* ---------------------------------------------------------------------------
 * 3. Recording an attempt.
 *
 * Deliberately callable by an authenticated user so a REFUSED attempt can be
 * recorded — the caller has by definition failed authorization at that point.
 * The function stamps the actor and re-derives the grant itself, so a caller
 * cannot claim a grant it does not hold or attribute the attempt to someone
 * else.
 * ------------------------------------------------------------------------ */
create or replace function api.record_employer_feed_import(
  p_feed_key text,
  p_outcome text,
  p_payload_sha256 text default null,
  p_payload_bytes integer default null,
  p_record_count integer default null,
  p_accepted_count integer default null,
  p_reason_code text default null,
  p_import_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_feed_key is null or p_feed_key !~ '^[a-z0-9_]{1,80}$' then
    raise exception using errcode = '22023', message = 'invalid feed key';
  end if;

  insert into private.employer_feed_imports (
    feed_key, actor_user_id, grant_kind, outcome, payload_sha256,
    payload_bytes, record_count, accepted_count, reason_code, import_run_id
  ) values (
    p_feed_key,
    v_actor,
    -- Re-derived, never taken from the caller.
    (select security.employer_feed_import_grant(p_feed_key)),
    p_outcome,
    p_payload_sha256,
    p_payload_bytes,
    p_record_count,
    p_accepted_count,
    left(p_reason_code, 120),
    p_import_run_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function api.record_employer_feed_import(
  text, text, text, integer, integer, integer, text, uuid
) from public, anon;
grant execute on function api.record_employer_feed_import(
  text, text, text, integer, integer, integer, text, uuid
) to authenticated;

commit;
