begin;

-- In-app notifications, with email as an opt-out channel per kind.
--
-- Every notification restates something the account owner can already see in
-- their own records: a date they set, an application they have not moved, a
-- role that matches the profile they attested to. Nothing here invents an
-- event, and nothing is generated from another account's data. A notification
-- carries the same claim as the surface it points at — it is a pointer, not a
-- second source of truth.

do $$
begin
  if to_regtype('app.notification_kind') is null then
    create type app.notification_kind as enum (
      'action_due',
      'application_stalled',
      'new_match',
      'saved_job_aging',
      'alert_digest'
    );
  end if;
end
$$;

create table if not exists private.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  kind app.notification_kind not null,
  title text not null,
  body text not null,
  -- Where the claim can be checked. Always a path on this site, never an
  -- outbound link: a notification must not be a way to move someone off-site.
  href text not null,
  -- Stable per (user, kind, subject) so a recurring condition does not produce
  -- a new row on every sweep. The generator is idempotent on this key.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_state text not null default 'pending',
  email_sent_at timestamptz,
  constraint notifications_title_length check (char_length(title) between 1 and 200),
  constraint notifications_body_length check (char_length(body) between 1 and 1000),
  constraint notifications_href_relative check (href ~ '^/[A-Za-z0-9/_.~%-]*(\?[A-Za-z0-9=&_.~%-]*)?$'),
  constraint notifications_dedupe_length check (char_length(dedupe_key) between 1 and 200),
  constraint notifications_email_state check (
    email_state in (
      'pending', 'processing', 'sent', 'skipped', 'suppressed', 'failed'
    )
  ),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_owner_unread
  on private.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_email_queue
  on private.notifications (created_at)
  where email_state = 'pending';

alter table private.notifications enable row level security;
alter table private.notifications force row level security;

drop policy if exists notifications_owner_all on private.notifications;
create policy notifications_owner_all on private.notifications
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

-- Email is opt-out per kind. The absence of a row means email is on for that
-- kind, so a new kind never silently starts as unreachable, and an explicit
-- opt-out is a stored decision rather than an inferred one.
create table if not exists private.notification_email_optouts (
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  kind app.notification_kind not null,
  opted_out_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table private.notification_email_optouts enable row level security;
alter table private.notification_email_optouts force row level security;

drop policy if exists notification_optouts_owner_all on private.notification_email_optouts;
create policy notification_optouts_owner_all on private.notification_email_optouts
for all to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()))
with check (user_id = (select auth.uid()) and (select security.is_active_user()));

-- ---------------------------------------------------------------------------
-- Owner-scoped access
-- ---------------------------------------------------------------------------

create or replace function security.get_my_notifications(p_limit integer default 30)
returns table (
  id uuid,
  kind app.notification_kind,
  title text,
  body text,
  href text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select n.id, n.kind, n.title, n.body, n.href, n.created_at, n.read_at
  from private.notifications n
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create or replace function security.get_my_notification_email_optouts()
returns table (kind app.notification_kind)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then return; end if;
  return query
  select o.kind
  from private.notification_email_optouts o
  where o.user_id = (select auth.uid());
end;
$$;

create or replace function security.set_my_notification_email_optout(
  p_kind app.notification_kind,
  p_opted_out boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_opted_out then
    insert into private.notification_email_optouts (user_id, kind)
    values (v_user_id, p_kind)
    on conflict (user_id, kind) do nothing;
  else
    delete from private.notification_email_optouts o
    where o.user_id = v_user_id and o.kind = p_kind;
  end if;

  return p_opted_out;
end;
$$;

-- Marking read is the owner's own act. A null id marks everything currently
-- unread, which is what the "mark all read" control does.
create or replace function security.mark_my_notifications_read(p_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer := 0;
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update private.notifications n
  set read_at = now()
  where n.user_id = v_user_id
    and n.read_at is null
    and (p_id is null or n.id = p_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/*
 * Records one notification for the calling account.
 *
 * Idempotent on `dedupe_key`: a condition that is still true on the next sweep
 * updates the existing row rather than stacking duplicates, and an already-read
 * notification is not silently marked unread again. `email_state` starts as
 * 'suppressed' when the owner has opted that kind out, so the delivery worker
 * never has to re-derive consent.
 */
create or replace function security.record_my_notification(
  p_kind app.notification_kind,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_opted_out boolean;
begin
  if not (select security.is_active_user()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select exists (
    select 1 from private.notification_email_optouts o
    where o.user_id = v_user_id and o.kind = p_kind
  ) into v_opted_out;

  insert into private.notifications as n (
    user_id, kind, title, body, href, dedupe_key, email_state
  )
  values (
    v_user_id, p_kind, p_title, p_body, p_href, p_dedupe_key,
    case when v_opted_out then 'suppressed' else 'pending' end
  )
  on conflict (user_id, dedupe_key) do update set
    title = excluded.title,
    body = excluded.body,
    href = excluded.href
  returning n.id into v_id;

  return v_id;
end;
$$;

create or replace function api.get_my_notifications(p_limit integer default 30)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  href text,
  created_at timestamptz,
  read_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.kind::text, n.title, n.body, n.href, n.created_at, n.read_at
  from security.get_my_notifications(p_limit) n
$$;

create or replace function api.get_my_notification_email_optouts()
returns table (kind text)
language sql stable security invoker set search_path = ''
as $$ select o.kind::text from security.get_my_notification_email_optouts() o $$;

create or replace function api.set_my_notification_email_optout(
  p_kind text,
  p_opted_out boolean
)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  select security.set_my_notification_email_optout(
    p_kind::app.notification_kind, p_opted_out
  )
$$;

create or replace function api.mark_my_notifications_read(p_id uuid default null)
returns integer
language sql volatile security invoker set search_path = ''
as $$ select security.mark_my_notifications_read(p_id) $$;

create or replace function api.record_my_notification(
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language sql volatile security invoker set search_path = ''
as $$
  select security.record_my_notification(
    p_kind::app.notification_kind, p_title, p_body, p_href, p_dedupe_key
  )
$$;

revoke all on function security.get_my_notifications(integer) from public, anon, authenticated;
revoke all on function security.get_my_notification_email_optouts() from public, anon, authenticated;
revoke all on function security.set_my_notification_email_optout(app.notification_kind, boolean) from public, anon, authenticated;
revoke all on function security.mark_my_notifications_read(uuid) from public, anon, authenticated;
revoke all on function security.record_my_notification(app.notification_kind, text, text, text, text) from public, anon, authenticated;
revoke all on function api.get_my_notifications(integer) from public, anon, authenticated;
revoke all on function api.get_my_notification_email_optouts() from public, anon, authenticated;
revoke all on function api.set_my_notification_email_optout(text, boolean) from public, anon, authenticated;
revoke all on function api.mark_my_notifications_read(uuid) from public, anon, authenticated;
revoke all on function api.record_my_notification(text, text, text, text, text) from public, anon, authenticated;

grant execute on function security.get_my_notifications(integer) to authenticated;
grant execute on function security.get_my_notification_email_optouts() to authenticated;
grant execute on function security.set_my_notification_email_optout(app.notification_kind, boolean) to authenticated;
grant execute on function security.mark_my_notifications_read(uuid) to authenticated;
grant execute on function security.record_my_notification(app.notification_kind, text, text, text, text) to authenticated;

grant execute on function api.get_my_notifications(integer) to authenticated;
grant execute on function api.get_my_notification_email_optouts() to authenticated;
grant execute on function api.set_my_notification_email_optout(text, boolean) to authenticated;
grant execute on function api.mark_my_notifications_read(uuid) to authenticated;
grant execute on function api.record_my_notification(text, text, text, text, text) to authenticated;

commit;
