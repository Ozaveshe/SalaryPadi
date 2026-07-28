begin;

-- Email delivery for notifications.
--
-- Modelled on the alert delivery claim so both paths share one operational
-- shape: a worker claims a batch under a token, sends, then completes against
-- that same token. A claim that is never completed is released back after the
-- timeout rather than being lost or double-sent.
--
-- Consent is resolved at record time, not here: `record_my_notification` writes
-- 'suppressed' when the owner has opted the kind out, so this claim never has
-- to re-derive whether a message may be sent. A kind the owner switches off
-- after a row is queued is honoured by the filter below as well, because both
-- checks agreeing is cheaper than a wrongly delivered email.

alter table private.notifications
  add column if not exists email_attempt_count smallint not null default 0,
  add column if not exists email_claim_token uuid,
  add column if not exists email_claimed_at timestamptz,
  add column if not exists email_error_code text;

create index if not exists notifications_email_claim
  on private.notifications (created_at)
  where email_state = 'pending';

/*
 * Parked, not active.
 *
 * Health treats an ACTIVE schedule that the deployed worker registry does not
 * know about as real drift and fails on it — the database would be expecting
 * runs that nothing can produce. A DISABLED schedule is reported as parked and
 * asks nothing of the platform, which is exactly what this is until the deploy
 * that ships `netlify/functions/notification-delivery.mts` lands.
 *
 * ENABLE THIS WITH THAT DEPLOY:
 *   update private.worker_schedules set enabled = true, updated_at = clock_timestamp()
 *   where task_key = 'notification_email_delivery';
 */
insert into private.worker_schedules (task_key, expected_interval, stale_after, owner_label, enabled)
values (
  'notification_email_delivery',
  interval '1 hour',
  interval '6 hours',
  'SalaryPadi candidate workspace owner',
  false
)
on conflict (task_key) do update set
  expected_interval = excluded.expected_interval,
  stale_after = excluded.stale_after,
  owner_label = excluded.owner_label,
  updated_at = clock_timestamp();

create or replace function api.worker_claim_notification_emails(p_limit integer default 20)
returns table (
  notification_id uuid,
  claim_token uuid,
  recipient_email text,
  kind text,
  title text,
  body text,
  href text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid claim limit';
  end if;

  -- Release anything a previous run claimed and never completed.
  update private.notifications n
  set email_state = case when n.email_attempt_count >= 3 then 'failed' else 'pending' end,
      email_claim_token = null,
      email_claimed_at = null,
      email_error_code = 'worker_timeout'
  where n.email_state = 'processing'
    and n.email_claimed_at < clock_timestamp() - interval '15 minutes';

  return query
  with candidates as (
    select n.id
    from private.notifications n
    join private.profiles p
      on p.user_id = n.user_id and p.account_status = 'active'
    join auth.users u on u.id = n.user_id and u.email is not null
    where n.email_state = 'pending'
      and n.email_attempt_count < 3
      -- Only unread notifications are worth an email; one the owner has
      -- already seen in the app does not need to arrive twice.
      and n.read_at is null
      -- Re-checked here so an opt-out made after queueing still takes effect.
      and not exists (
        select 1 from private.notification_email_optouts o
        where o.user_id = n.user_id and o.kind = n.kind
      )
    order by n.created_at, n.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.notifications n
    set email_state = 'processing',
        email_attempt_count = n.email_attempt_count + 1,
        email_claimed_at = clock_timestamp(),
        email_claim_token = gen_random_uuid()
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select c.id, c.email_claim_token, u.email::text, c.kind::text,
    c.title, c.body, c.href
  from claimed c
  join auth.users u on u.id = c.user_id;
end;
$$;

create or replace function api.worker_complete_notification_email(
  p_notification_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean := false;
begin
  perform security.require_service_role();
  if p_outcome not in ('sent', 'skipped', 'failed') then
    raise exception using errcode = '22023', message = 'invalid outcome';
  end if;

  update private.notifications n
  set email_state = case
        when p_outcome = 'failed' and n.email_attempt_count < 3 then 'pending'
        when p_outcome = 'failed' then 'failed'
        else p_outcome
      end,
      email_sent_at = case when p_outcome = 'sent' then clock_timestamp() else n.email_sent_at end,
      email_claim_token = null,
      email_claimed_at = null,
      email_error_code = p_error_code
  where n.id = p_notification_id
    and n.email_claim_token = p_claim_token
    and n.email_state = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function api.worker_claim_notification_emails(integer) from public, anon, authenticated;
revoke all on function api.worker_complete_notification_email(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function api.worker_claim_notification_emails(integer) to service_role;
grant execute on function api.worker_complete_notification_email(uuid, uuid, text, text) to service_role;

commit;
