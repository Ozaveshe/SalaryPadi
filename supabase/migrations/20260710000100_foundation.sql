begin;

create schema if not exists extensions;
create schema if not exists api;
create schema if not exists app;
create schema if not exists private;
create schema if not exists ingest;
create schema if not exists audit;
create schema if not exists security;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

do $$
begin
  create type private.account_status as enum (
    'active', 'suspended', 'deletion_pending', 'deleted'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.staff_role as enum (
    'data_quality', 'moderator', 'admin'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.privacy_request_kind as enum (
    'data_export', 'account_deletion', 'correction', 'contribution_deletion'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type private.request_status as enum (
    'pending', 'in_progress', 'completed', 'rejected', 'cancelled'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type audit.actor_kind as enum ('user', 'staff', 'system');
exception when duplicate_object then null;
end;
$$;

create table if not exists app.market_countries (
  iso2 text primary key,
  name text not null,
  default_currency text not null,
  is_launch_market boolean not null default false,
  is_supported boolean not null default false,
  created_at timestamptz not null default now(),
  constraint market_countries_iso2_format check (iso2 ~ '^[A-Z]{2}$'),
  constraint market_countries_currency_format check (default_currency ~ '^[A-Z]{3}$')
);

insert into app.market_countries (iso2, name, default_currency, is_launch_market, is_supported)
values
  ('NG', 'Nigeria', 'NGN', true, true),
  ('GH', 'Ghana', 'GHS', false, false),
  ('KE', 'Kenya', 'KES', false, false),
  ('ZA', 'South Africa', 'ZAR', false, false)
on conflict (iso2) do update
set name = excluded.name,
    default_currency = excluded.default_currency,
    is_launch_market = excluded.is_launch_market;

create table if not exists private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country_code text,
  locale text not null default 'en-NG',
  time_zone text not null default 'Africa/Lagos',
  account_status private.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  constraint profiles_country_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint profiles_locale_length check (char_length(locale) between 2 and 20),
  constraint profiles_timezone_length check (char_length(time_zone) between 1 and 100)
);

create table if not exists private.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  role private.staff_role not null,
  granted_by uuid references private.profiles(user_id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references private.profiles(user_id) on delete restrict,
  revoked_at timestamptz,
  reason text not null,
  constraint user_roles_reason_length check (char_length(btrim(reason)) between 3 and 500),
  constraint user_roles_no_self_grant check (granted_by is null or granted_by <> user_id),
  constraint user_roles_revoke_pair check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

create unique index if not exists user_roles_one_active_role
  on private.user_roles (user_id, role)
  where revoked_at is null;
create index if not exists user_roles_active_lookup
  on private.user_roles (user_id, role) where revoked_at is null;

create table if not exists private.analytics_consents (
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  purpose text not null,
  allowed boolean not null,
  policy_version text not null,
  captured_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, purpose),
  constraint analytics_consents_purpose_length check (char_length(purpose) between 2 and 80),
  constraint analytics_consents_policy_length check (char_length(policy_version) between 1 and 40)
);

create table if not exists private.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  kind private.privacy_request_kind not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  status private.request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by uuid references private.profiles(user_id) on delete set null,
  resolution_note text,
  constraint privacy_requests_details_object check (jsonb_typeof(details) = 'object'),
  constraint privacy_requests_details_size check (octet_length(details::text) <= 8192),
  constraint privacy_requests_completion_pair check (
    (status <> 'completed' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create index if not exists privacy_requests_owner_created
  on private.privacy_requests (user_id, requested_at desc);
create index if not exists privacy_requests_queue
  on private.privacy_requests (status, requested_at) where status in ('pending', 'in_progress');

create table if not exists private.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references private.profiles(user_id) on delete cascade,
  action text not null,
  network_key_hash text,
  created_at timestamptz not null default clock_timestamp(),
  constraint rate_limit_action_length check (char_length(action) between 2 and 80),
  constraint rate_limit_hash_length check (
    network_key_hash is null or char_length(network_key_hash) between 32 and 128
  )
);

create index if not exists rate_limit_events_lookup
  on private.rate_limit_events (user_id, action, created_at desc);

create table if not exists audit.event_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind audit.actor_kind not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  request_id uuid,
  reason_code text,
  previous_state jsonb,
  new_state jsonb,
  changed_fields text[] not null default '{}'::text[],
  before_hash text,
  after_hash text,
  metadata jsonb not null default '{}'::jsonb,
  constraint event_log_action_length check (char_length(action) between 2 and 120),
  constraint event_log_target_length check (char_length(target_type) between 2 and 120),
  constraint event_log_reason_length check (reason_code is null or char_length(reason_code) <= 120),
  constraint event_log_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint event_log_metadata_size check (octet_length(metadata::text) <= 16384)
);

create index if not exists event_log_occurred_at on audit.event_log (occurred_at desc);
create index if not exists event_log_target on audit.event_log (target_type, target_id, occurred_at desc);
create index if not exists event_log_actor on audit.event_log (actor_user_id, occurred_at desc);

create or replace function security.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on private.profiles;
create trigger profiles_set_updated_at
before update on private.profiles
for each row execute function security.set_updated_at();

create or replace function security.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = format('%I.%I is append-only', tg_table_schema, tg_table_name);
end;
$$;

drop trigger if exists event_log_append_only on audit.event_log;
create trigger event_log_append_only
before update or delete on audit.event_log
for each row execute function security.reject_mutation();

create or replace function security.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from private.profiles p
      where p.user_id = (select auth.uid())
        and p.account_status = 'active'
    )
$$;

create or replace function security.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function security.has_staff_role(p_role private.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select security.is_active_user())
    and exists (
      select 1
      from private.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = p_role
        and r.revoked_at is null
    )
$$;

create or replace function security.has_any_staff_role(p_roles private.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select security.is_active_user())
    and exists (
      select 1
      from private.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = any(p_roles)
        and r.revoked_at is null
    )
$$;

create or replace function audit.write_event(
  p_actor_kind audit.actor_kind,
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_reason_code text default null,
  p_previous_state jsonb default null,
  p_new_state jsonb default null,
  p_changed_fields text[] default '{}'::text[],
  p_before_hash text default null,
  p_after_hash text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into audit.event_log (
    actor_user_id, actor_kind, action, target_type, target_id, request_id,
    reason_code, previous_state, new_state, changed_fields,
    before_hash, after_hash, metadata
  ) values (
    coalesce(p_actor_user_id, (select auth.uid())), p_actor_kind, p_action,
    p_target_type, p_target_id, p_request_id, p_reason_code,
    p_previous_state, p_new_state, coalesce(p_changed_fields, '{}'::text[]),
    p_before_hash, p_after_hash, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function security.consume_rate_limit(
  p_action text,
  p_max_events integer,
  p_window interval,
  p_network_key_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_max_events < 1 or p_window <= interval '0 seconds' then
    raise exception using errcode = '22023', message = 'invalid rate limit configuration';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_action, 0));
  select count(*) into v_count
  from private.rate_limit_events e
  where e.user_id = v_user_id
    and e.action = p_action
    and e.created_at >= clock_timestamp() - p_window;

  if v_count >= p_max_events then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;

  insert into private.rate_limit_events (user_id, action, network_key_hash)
  values (v_user_id, p_action, p_network_key_hash);
end;
$$;

create or replace function security.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text;
begin
  v_country := upper(nullif(new.raw_user_meta_data ->> 'country_code', ''));
  if v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  insert into private.profiles (user_id, country_code)
  values (new.id, v_country)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function security.handle_new_auth_user();

create or replace function security.update_my_profile(
  p_country_code text,
  p_locale text,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text := upper(nullif(btrim(p_country_code), ''));
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid country code';
  end if;
  if char_length(p_locale) not between 2 and 20
     or char_length(p_time_zone) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid profile values';
  end if;

  update private.profiles
  set country_code = v_country,
      locale = p_locale,
      time_zone = p_time_zone
  where user_id = (select auth.uid());
end;
$$;

create or replace function security.set_analytics_consent(
  p_purpose text,
  p_allowed boolean,
  p_policy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(p_purpose) not between 2 and 80
     or char_length(p_policy_version) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'invalid consent values';
  end if;

  insert into private.analytics_consents (
    user_id, purpose, allowed, policy_version, captured_at, revoked_at
  ) values (
    (select auth.uid()), p_purpose, p_allowed, p_policy_version,
    clock_timestamp(), case when p_allowed then null else clock_timestamp() end
  )
  on conflict (user_id, purpose) do update
  set allowed = excluded.allowed,
      policy_version = excluded.policy_version,
      captured_at = excluded.captured_at,
      revoked_at = excluded.revoked_at;
end;
$$;

create or replace function security.request_privacy_action(
  p_kind private.privacy_request_kind,
  p_target_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_details, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22023', message = 'invalid privacy request details';
  end if;

  perform security.consume_rate_limit('privacy_request', 5, interval '1 day');

  if p_kind = 'account_deletion' and exists (
    select 1 from private.user_roles r
    where r.user_id = (select auth.uid())
      and r.role = 'admin' and r.revoked_at is null
  ) then
    perform pg_advisory_xact_lock(
      hashtextextended('salarypadi:active-admin-set', 0)
    );
    if (
      select count(*)
      from private.user_roles r
      join private.profiles p on p.user_id = r.user_id
      where r.role = 'admin' and r.revoked_at is null
        and p.account_status = 'active'
    ) <= 1 then
      raise exception using errcode = '23514',
        message = 'the last active admin cannot request account deletion';
    end if;
  end if;

  insert into private.privacy_requests (user_id, kind, target_id, details)
  values ((select auth.uid()), p_kind, p_target_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  if p_kind = 'account_deletion' then
    update private.user_roles
    set revoked_at = clock_timestamp(), revoked_by = (select auth.uid())
    where user_id = (select auth.uid()) and revoked_at is null;
    update private.profiles
    set account_status = 'deletion_pending',
        deletion_requested_at = clock_timestamp()
    where user_id = (select auth.uid());
  end if;

  perform audit.write_event(
    'user', 'privacy_request.created', 'privacy_request', v_id,
    p_kind::text, null, jsonb_build_object('status', 'pending'),
    array['status'], null, null, '{}'::jsonb
  );
  return v_id;
end;
$$;

create or replace function security.set_staff_role(
  p_target_user_id uuid,
  p_role private.staff_role,
  p_grant boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_changed integer := 0;
begin
  if not (select security.has_staff_role('admin')) or not (select security.is_aal2()) then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  if p_target_user_id = v_actor then
    raise exception using errcode = '42501', message = 'administrators cannot change their own role';
  end if;
  if char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'a reason is required';
  end if;
  if (p_grant and not exists (
        select 1 from private.profiles p
        where p.user_id = p_target_user_id and p.account_status = 'active'
      ))
     or (not p_grant and not exists (
        select 1 from private.profiles p
        where p.user_id = p_target_user_id and p.account_status <> 'deleted'
      )) then
    raise exception using errcode = '22023',
      message = 'target user state does not permit this role change';
  end if;

  -- Serialize changes to the admin set so two administrators cannot each
  -- observe the other and concurrently revoke the final two admin grants.
  if p_role = 'admin' then
    perform pg_advisory_xact_lock(hashtextextended('salarypadi:active-admin-set', 0));
  end if;

  if p_grant then
    insert into private.user_roles (user_id, role, granted_by, reason)
    values (p_target_user_id, p_role, v_actor, btrim(p_reason))
    on conflict (user_id, role) where revoked_at is null do nothing;
    get diagnostics v_changed = row_count;
  else
    if p_role = 'admin' and (
      select count(*)
      from private.user_roles r
      join private.profiles p on p.user_id = r.user_id
      where r.role = 'admin' and r.revoked_at is null and p.account_status = 'active'
    ) <= 1 then
      raise exception using errcode = '23514', message = 'cannot revoke the last active admin';
    end if;

    update private.user_roles
    set revoked_at = clock_timestamp(), revoked_by = v_actor
    where user_id = p_target_user_id
      and role = p_role
      and revoked_at is null;
    get diagnostics v_changed = row_count;
  end if;

  if v_changed > 0 then
    perform audit.write_event(
      'staff',
      case when p_grant then 'role.granted' else 'role.revoked' end,
      'user_role', p_target_user_id, 'staff_role_change',
      jsonb_build_object('role', p_role, 'active', not p_grant),
      jsonb_build_object('role', p_role, 'active', p_grant),
      array['role', 'active'], null, null,
      jsonb_build_object('reason', btrim(p_reason))
    );
  end if;
  return v_changed > 0;
end;
$$;

create or replace function security.list_audit_events(p_limit integer default 50)
returns setof audit.event_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.has_staff_role('admin')) or not (select security.is_aal2()) then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  return query
    select e.*
    from audit.event_log e
    order by e.occurred_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace view api.market_countries
with (security_invoker = true, security_barrier = true)
as
select iso2, name, default_currency, is_launch_market, is_supported
from app.market_countries;

create or replace view api.my_profile
with (security_invoker = true, security_barrier = true)
as
select user_id, country_code, locale, time_zone, account_status, created_at, updated_at
from private.profiles
where user_id = (select auth.uid());

create or replace view api.my_staff_roles
with (security_invoker = true, security_barrier = true)
as
select role, granted_at
from private.user_roles
where user_id = (select auth.uid()) and revoked_at is null;

create or replace view api.my_analytics_consents
with (security_invoker = true, security_barrier = true)
as
select purpose, allowed, policy_version, captured_at, revoked_at
from private.analytics_consents
where user_id = (select auth.uid());

create or replace view api.my_privacy_requests
with (security_invoker = true, security_barrier = true)
as
select id, kind, target_id, status, requested_at, completed_at, resolution_note
from private.privacy_requests
where user_id = (select auth.uid());

create or replace function api.update_my_profile(
  p_country_code text,
  p_locale text,
  p_time_zone text
)
returns void
language sql
security invoker
set search_path = ''
as $$ select security.update_my_profile(p_country_code, p_locale, p_time_zone) $$;

create or replace function api.set_analytics_consent(
  p_purpose text,
  p_allowed boolean,
  p_policy_version text
)
returns void
language sql
security invoker
set search_path = ''
as $$ select security.set_analytics_consent(p_purpose, p_allowed, p_policy_version) $$;

create or replace function api.request_privacy_action(
  p_kind text,
  p_target_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select security.request_privacy_action(
    p_kind::private.privacy_request_kind, p_target_id, p_details
  )
$$;

create or replace function api.set_staff_role(
  p_target_user_id uuid,
  p_role text,
  p_grant boolean,
  p_reason text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select security.set_staff_role(
    p_target_user_id, p_role::private.staff_role, p_grant, p_reason
  )
$$;

create or replace function api.admin_audit_events(p_limit integer default 50)
returns setof audit.event_log
language sql
stable
security invoker
set search_path = ''
as $$ select * from security.list_audit_events(p_limit) $$;

alter table app.market_countries enable row level security;
alter table app.market_countries force row level security;
alter table private.profiles enable row level security;
alter table private.profiles force row level security;
alter table private.user_roles enable row level security;
alter table private.user_roles force row level security;
alter table private.analytics_consents enable row level security;
alter table private.analytics_consents force row level security;
alter table private.privacy_requests enable row level security;
alter table private.privacy_requests force row level security;
alter table private.rate_limit_events enable row level security;
alter table private.rate_limit_events force row level security;
alter table audit.event_log enable row level security;
alter table audit.event_log force row level security;

drop policy if exists market_countries_public_read on app.market_countries;
create policy market_countries_public_read on app.market_countries
for select to anon, authenticated using (true);

drop policy if exists profiles_owner_read on private.profiles;
create policy profiles_owner_read on private.profiles
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists profiles_admin_read on private.profiles;
create policy profiles_admin_read on private.profiles
for select to authenticated
using ((select security.has_staff_role('admin')) and (select security.is_aal2()));

drop policy if exists user_roles_owner_read on private.user_roles;
create policy user_roles_owner_read on private.user_roles
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_roles_admin_read on private.user_roles;
create policy user_roles_admin_read on private.user_roles
for select to authenticated
using ((select security.has_staff_role('admin')) and (select security.is_aal2()));

drop policy if exists analytics_consents_owner_read on private.analytics_consents;
create policy analytics_consents_owner_read on private.analytics_consents
for select to authenticated
using (user_id = (select auth.uid()) and (select security.is_active_user()));

drop policy if exists privacy_requests_owner_read on private.privacy_requests;
create policy privacy_requests_owner_read on private.privacy_requests
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists privacy_requests_admin_read on private.privacy_requests;
create policy privacy_requests_admin_read on private.privacy_requests
for select to authenticated
using ((select security.has_staff_role('admin')) and (select security.is_aal2()));

drop policy if exists event_log_admin_read on audit.event_log;
create policy event_log_admin_read on audit.event_log
for select to authenticated
using ((select security.has_staff_role('admin')) and (select security.is_aal2()));

revoke all on schema api, app, private, ingest, audit, security from public, anon, authenticated;
grant usage on schema api to anon, authenticated;
grant usage on schema app to anon, authenticated;
grant usage on schema private, security to authenticated;

revoke all on all tables in schema api, app, private, ingest, audit from public, anon, authenticated;
revoke all on all sequences in schema api, app, private, ingest, audit from public, anon, authenticated;
revoke execute on all functions in schema api, security, audit from public, anon, authenticated;

grant select on app.market_countries to anon, authenticated;
grant select on private.profiles, private.user_roles,
  private.analytics_consents, private.privacy_requests to authenticated;

grant select on api.market_countries to anon, authenticated;
grant select on api.my_profile, api.my_staff_roles,
  api.my_analytics_consents, api.my_privacy_requests to authenticated;

grant execute on function security.is_active_user() to authenticated;
grant execute on function security.is_aal2() to authenticated;
grant execute on function security.has_staff_role(private.staff_role) to authenticated;
grant execute on function security.has_any_staff_role(private.staff_role[]) to authenticated;
grant execute on function security.update_my_profile(text, text, text) to authenticated;
grant execute on function security.set_analytics_consent(text, boolean, text) to authenticated;
grant execute on function security.request_privacy_action(private.privacy_request_kind, uuid, jsonb) to authenticated;
grant execute on function security.set_staff_role(uuid, private.staff_role, boolean, text) to authenticated;
grant execute on function security.list_audit_events(integer) to authenticated;

grant execute on function api.update_my_profile(text, text, text) to authenticated;
grant execute on function api.set_analytics_consent(text, boolean, text) to authenticated;
grant execute on function api.request_privacy_action(text, uuid, jsonb) to authenticated;
grant execute on function api.set_staff_role(uuid, text, boolean, text) to authenticated;
grant execute on function api.admin_audit_events(integer) to authenticated;

alter default privileges for role postgres in schema api revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema app revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema ingest revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema ingest revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema audit revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema audit revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema audit revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema security revoke execute on functions from public, anon, authenticated;

comment on schema api is 'Only schema exposed through the Supabase Data API.';
comment on schema private is 'Account-linked private data; never expose through PostgREST.';
comment on schema ingest is 'Raw source records and import diagnostics; never expose through PostgREST.';
comment on schema audit is 'Append-only security and moderation audit records.';
comment on function security.set_staff_role(uuid, private.staff_role, boolean, text)
  is 'Requires an existing admin at AAL2. Bootstrap the first admin out-of-band in a reviewed migration or local SQL.';

commit;
