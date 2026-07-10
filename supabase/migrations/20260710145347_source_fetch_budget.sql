begin;

create table if not exists private.source_fetch_claims (
  request_key uuid primary key,
  source_id uuid not null references app.job_sources(id) on delete cascade,
  purpose text not null,
  claimed_at timestamptz not null default clock_timestamp(),
  constraint source_fetch_claims_purpose_format check (
    purpose ~ '^[a-z0-9_]{2,80}$'
  )
);

create index if not exists source_fetch_claims_source_time
  on private.source_fetch_claims (source_id, claimed_at desc);

alter table private.source_fetch_claims enable row level security;
alter table private.source_fetch_claims force row level security;
revoke all on private.source_fetch_claims from public, anon, authenticated;

comment on table private.source_fetch_claims is
  'Short-retention provider-request claims. A claim is consumed before any Remotive network request, including failed requests.';

create or replace function api.worker_claim_remotive_fetch(
  p_request_key uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_recent_count integer;
begin
  perform security.require_service_role();
  if p_request_key is null
     or p_purpose is null
     or p_purpose !~ '^[a-z0-9_]{2,80}$' then
    raise exception using errcode = '22023', message = 'invalid source fetch claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('salarypadi:source-fetch:remotive', 0)
  );

  select s.id into v_source_id
  from app.job_sources s
  where s.adapter_key = 'remotive'
    and s.source_type = 'permitted_api'
    and s.status = 'active'
    and s.allow_public_listing
    and s.attribution_required
    and not s.may_store_full_description
    and not s.may_index_jobs
    and not s.may_emit_jobposting_schema
    and s.required_destination_kind = 'source_url'
    and s.refresh_interval = interval '12 hours'
    and s.terms_url = 'https://github.com/remotive-com/remote-jobs-api'
    and s.terms_version = 'remotive-public-api-repository-reviewed-2026-07-10'
    and s.terms_reviewed_at is not null
  for key share;

  if v_source_id is null then return false; end if;
  if exists (
    select 1 from private.source_fetch_claims c
    where c.request_key = p_request_key
  ) then return false; end if;

  if exists (
    select 1 from private.source_fetch_claims c
    where c.source_id = v_source_id
      and c.claimed_at > clock_timestamp() - interval '1 minute'
  ) then return false; end if;

  delete from private.source_fetch_claims
  where claimed_at < clock_timestamp() - interval '30 days';

  select count(*)::integer into v_recent_count
  from private.source_fetch_claims c
  where c.source_id = v_source_id
    and c.claimed_at > clock_timestamp() - interval '24 hours';
  if v_recent_count >= 4 then return false; end if;

  insert into private.source_fetch_claims (
    request_key, source_id, purpose
  ) values (
    p_request_key, v_source_id, p_purpose
  );
  return true;
end;
$$;

comment on function api.worker_claim_remotive_fetch(uuid,text) is
  'Service-role-only rolling budget. At most one provider request per minute and four requests per 24-hour window.';

revoke all on function api.worker_claim_remotive_fetch(uuid,text)
from public, anon, authenticated;
grant execute on function api.worker_claim_remotive_fetch(uuid,text)
to service_role;

commit;
