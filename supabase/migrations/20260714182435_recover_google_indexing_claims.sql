create index if not exists google_indexing_outbox_processing_claim
  on private.google_indexing_outbox (claimed_at)
  where status = 'processing';

create or replace function api.google_indexing_claim_notifications(p_limit integer default 1)
returns table (
  outbox_id uuid,
  job_id uuid,
  job_slug text,
  notification_kind text,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid indexing claim limit';
  end if;

  update private.google_indexing_outbox outbox
  set status = 'dead',
      completed_at = clock_timestamp(),
      claimed_at = null,
      error_code = 'stale_claim_attempts_exhausted',
      updated_at = clock_timestamp()
  where outbox.status = 'processing'
    and coalesce(outbox.claimed_at, outbox.updated_at, outbox.created_at)
      <= clock_timestamp() - interval '10 minutes'
    and outbox.attempts >= 5;

  update private.google_indexing_outbox outbox
  set status = 'pending',
      available_at = clock_timestamp(),
      claimed_at = null,
      provider_http_status = null,
      error_code = 'stale_claim_recovered',
      updated_at = clock_timestamp()
  where outbox.status = 'processing'
    and coalesce(outbox.claimed_at, outbox.updated_at, outbox.created_at)
      <= clock_timestamp() - interval '10 minutes'
    and outbox.attempts < 5;

  update private.google_indexing_outbox outbox
  set status = 'dead',
      error_code = 'ineligible_before_delivery',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where outbox.status = 'pending'
    and outbox.notification_kind = 'URL_UPDATED'
    and not security.google_indexing_job_is_eligible(outbox.job_id);

  return query
  with claimed as (
    select pending.id
    from private.google_indexing_outbox pending
    where pending.status = 'pending'
      and pending.available_at <= clock_timestamp()
    order by pending.available_at, pending.created_at
    limit p_limit
    for update skip locked
  )
  update private.google_indexing_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from claimed
  where outbox.id = claimed.id
  returning outbox.id, outbox.job_id, outbox.job_slug,
    outbox.notification_kind, outbox.attempts::integer;
end;
$$;
