-- Collapse superseded Google indexing notifications before claiming one.
--
-- The outbox holds one row per change to an indexable job, which is right: the
-- trigger cannot know whether the previous notification was sent yet. What was
-- missing is the other half — a notification is only worth sending if it is
-- still the latest thing we have to say about that URL.
--
-- Measured 2026-08-03: 3,092 pending rows describing 214 distinct jobs, so
-- about fourteen redundant notifications each. The claim takes the oldest row
-- first and the worker sends one every fifteen minutes, so enabling delivery
-- would have spent roughly a month re-announcing the same handful of jobs
-- while the rest waited, against a Google quota of 200 URLs a day.
--
-- Two rules, both about saying the true thing once:
--
--   * Of several pending notifications of the same kind for one job, only the
--     newest carries information. The rest are superseded.
--   * A pending URL_DELETED supersedes any URL_UPDATED for the same job that
--     preceded it. Telling Google a page changed and then that it is gone is
--     at best wasted quota; sending them out of order would be wrong.
--
-- Superseded rows are marked dead with a reason rather than deleted, so the
-- outbox stays an auditable record of what changed and what was suppressed.

begin;

create or replace function api.google_indexing_claim_notifications(p_limit integer default 1)
 returns table(outbox_id uuid, job_id uuid, job_slug text, notification_kind text, attempt integer)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- A removal makes every earlier update for that job moot.
  update private.google_indexing_outbox outbox
  set status = 'dead',
      error_code = 'superseded_by_deletion',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where outbox.status = 'pending'
    and outbox.notification_kind = 'URL_UPDATED'
    and exists (
      select 1 from private.google_indexing_outbox removal
      where removal.job_id = outbox.job_id
        and removal.notification_kind = 'URL_DELETED'
        and removal.status = 'pending'
        and removal.created_at >= outbox.created_at
    );

  -- Of several pending notifications of one kind for one job, only the newest
  -- says anything the others do not.
  with ranked as (
    select outbox.id,
      row_number() over (
        partition by outbox.job_id, outbox.notification_kind
        order by outbox.created_at desc, outbox.id desc
      ) as rn
    from private.google_indexing_outbox outbox
    where outbox.status = 'pending'
  )
  update private.google_indexing_outbox outbox
  set status = 'dead',
      error_code = 'superseded_by_newer',
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from ranked
  where outbox.id = ranked.id and ranked.rn > 1;

  /*
   * Eligibility is checked last, on what survived.
   *
   * It used to run first, which meant a job that became ineligible had all
   * fourteen of its stale notifications closed as `ineligible_before_delivery`
   * when thirteen of them were simply superseded. Both reasons are true of
   * those rows; the more specific one is the more useful thing to have
   * recorded, and checking eligibility once at the end also spares thirteen
   * calls to a query that walks the source policy and provenance chain.
   */
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
$function$;

comment on function api.google_indexing_claim_notifications(integer) is
  'Claims the next Google indexing notifications, after collapsing superseded ones so quota is spent on distinct URLs rather than repeated updates to the same job.';

commit;
