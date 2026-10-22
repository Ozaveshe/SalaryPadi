-- Private alerts retain per-role delivery history and an immutable retry message.
-- Public API metadata may be emailed after source review; private APIs and
-- explicit takedowns remain denied. Email templates never include descriptions.
begin;

create or replace function security.enforce_job_source_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_enabled_config boolean;
  v_automatic_company_ok boolean;
begin
  if tg_op = 'UPDATE'
     and (
       old.authorization_reviewed_at is not null
       or old.status = 'active'
     )
     and (
       new.source_type is distinct from old.source_type
       or new.homepage_url is distinct from old.homepage_url
       or new.terms_url is distinct from old.terms_url
       or new.terms_version is distinct from old.terms_version
       or new.attribution_required is distinct from old.attribution_required
       or new.attribution_text is distinct from old.attribution_text
       or new.may_store_full_description is distinct from old.may_store_full_description
       or new.may_index_jobs is distinct from old.may_index_jobs
       or new.may_emit_jobposting_schema is distinct from old.may_emit_jobposting_schema
       or new.may_email_jobs is distinct from old.may_email_jobs
       or new.allow_public_listing is distinct from old.allow_public_listing
       or new.required_destination_kind is distinct from old.required_destination_kind
       or new.refresh_interval is distinct from old.refresh_interval
       or new.authorization_basis is distinct from old.authorization_basis
       or new.authorization_evidence_ref is distinct from old.authorization_evidence_ref
       or new.authorization_grantor is distinct from old.authorization_grantor
       or new.authorization_expires_at is distinct from old.authorization_expires_at
     ) then
    new.status := 'paused';
    new.authorization_reviewed_at := null;
    new.authorization_reviewed_by := null;
    new.authorization_revoked_at := clock_timestamp();
    new.authorization_revoked_by := null;
    new.authorization_revocation_reason := 'source_policy_changed';

    if new.terms_url is distinct from old.terms_url
       or new.terms_version is distinct from old.terms_version then
      new.terms_reviewed_at := null;
      new.terms_reviewed_by := null;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.authorization_revoked_at is not null
     and new.authorization_revoked_at is distinct from old.authorization_revoked_at then
    new.status := 'paused';
    new.authorization_reviewed_at := null;
    new.authorization_reviewed_by := null;
    new.authorization_revocation_reason := coalesce(
      nullif(btrim(new.authorization_revocation_reason), ''),
      'authorization_revoked'
    );
  end if;

  if new.status = 'active' then
    if new.terms_reviewed_at is null
       or nullif(btrim(coalesce(new.terms_version, '')), '') is null then
      raise exception using errcode = '23514',
        message = 'active source requires a current terms review';
    end if;
    if new.authorization_basis is null
       or nullif(btrim(coalesce(new.authorization_evidence_ref, '')), '') is null
       or new.authorization_reviewed_at is null then
      raise exception using errcode = '23514',
        message = 'active source requires reviewed authorization evidence';
    end if;
    if new.authorization_revoked_at is not null then
      raise exception using errcode = '23514',
        message = 'revoked source authorization cannot be active';
    end if;
    if new.authorization_expires_at is not null
       and new.authorization_expires_at <= clock_timestamp() then
      raise exception using errcode = '23514',
        message = 'expired source authorization cannot be active';
    end if;
    if new.authorization_reviewed_at >
         clock_timestamp() + interval '5 minutes' then
      raise exception using errcode = '23514',
        message = 'source authorization review cannot be future dated';
    end if;
    if new.may_email_jobs
       and new.authorization_basis not in (
         'first_party', 'written_permission', 'commercial_contract', 'documented_public_api'
       ) then
      raise exception using errcode = '23514',
        message = 'email distribution requires explicit source permission';
    end if;

    if new.source_type = 'employer_ats' then
      if char_length(new.adapter_key) > 100
         or char_length(new.name) not between 1 and 300
         or new.terms_url !~* '^https://'
         or char_length(new.terms_version) > 500
         or char_length(coalesce(new.attribution_text, '')) > 2000
         or char_length(new.required_destination_kind) > 120 then
        raise exception using errcode = '23514',
          message = 'ATS source metadata exceeds the worker contract';
      end if;
      if new.authorization_basis not in (
           'written_permission', 'commercial_contract',
           'documented_public_api'
         )
         or nullif(btrim(coalesce(new.authorization_grantor, '')), '') is null then
        raise exception using errcode = '23514',
          message = 'active ATS source requires a reviewed authorization basis and grantor';
      end if;

      select exists (
        select 1
        from private.ats_source_configs cfg
        where cfg.source_id = new.id
          and cfg.enabled
          and cfg.fetch_interval = new.refresh_interval
      ) into v_has_enabled_config;

      select coalesce(bool_and(
          cfg.publication_mode <> 'automatic'
          or (
            new.allow_public_listing
            and c.record_status = 'published'
            and c.verification_status in (
              'domain_verified', 'organization_verified'
            )
          )
        ), false)
      into v_automatic_company_ok
      from private.ats_source_configs cfg
      join app.companies c on c.id = cfg.company_id
      where cfg.source_id = new.id
        and cfg.enabled
        and cfg.fetch_interval = new.refresh_interval;

      if not coalesce(v_has_enabled_config, false) then
        raise exception using errcode = '23514',
          message = 'active ATS source requires one enabled matching configuration';
      end if;
      if not coalesce(v_automatic_company_ok, false) then
        raise exception using errcode = '23514',
          message = 'automatic ATS publication requires a published verified company';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function api.worker_claim_alert_deliveries(p_limit integer default 10)
returns table (
  delivery_id uuid,
  claim_token uuid,
  alert_id uuid,
  recipient_email text,
  search_spec jsonb,
  cadence text,
  last_sent_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_limit not between 1 and 25 then
    raise exception using errcode = '22023', message = 'invalid claim limit';
  end if;

  update private.alert_deliveries d
  set status = case when d.attempt_count >= 3 then 'dead' else 'failed' end,
      next_attempt_at = clock_timestamp(),
      claim_token = null,
      claimed_at = null,
      error_code = 'worker_timeout',
      updated_at = clock_timestamp()
  where d.status = 'processing'
    and d.claimed_at < clock_timestamp() - interval '15 minutes';

  insert into private.alert_deliveries (alert_id, user_id, period_key)
  select a.id, a.user_id,
    case when a.cadence = 'weekly'
      then to_char(date_trunc('week', clock_timestamp()), 'IYYY-"W"IW')
      else to_char(clock_timestamp(), 'YYYY-MM-DD') end
  from private.job_alerts a
  join private.profiles p on p.user_id = a.user_id and p.account_status = 'active'
  join auth.users u on u.id = a.user_id and u.email is not null
  where a.is_enabled and u.email_confirmed_at is not null
    and (
      a.last_sent_at is null
      or (a.cadence = 'daily' and a.last_sent_at <= clock_timestamp() - interval '23 hours')
      or (a.cadence = 'weekly' and a.last_sent_at <= clock_timestamp() - interval '6 days 23 hours')
    )
  on conflict on constraint alert_deliveries_period_unique do nothing;

  return query
  with candidates as (
    select d.id
    from private.alert_deliveries d
    join private.job_alerts a on a.id = d.alert_id and a.is_enabled
    join private.profiles p on p.user_id = a.user_id and p.account_status = 'active'
    join auth.users u on u.id = a.user_id and u.email_confirmed_at is not null
    where d.status in ('pending', 'failed')
      and d.next_attempt_at <= clock_timestamp()
      and d.attempt_count < 3
    order by d.next_attempt_at, d.created_at, d.id
    for update of d skip locked
    limit p_limit
  ), claimed as (
    update private.alert_deliveries d
    set status = 'processing',
        attempt_count = d.attempt_count + 1,
        claimed_at = clock_timestamp(),
        claim_token = gen_random_uuid(),
        updated_at = clock_timestamp()
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select c.id, c.claim_token, a.id, u.email::text, a.search_spec,
    a.cadence, a.last_sent_at
  from claimed c
  join private.job_alerts a on a.id = c.alert_id
  join auth.users u on u.id = c.user_id;
end;
$$;


create table private.alert_sent_jobs (
  alert_id uuid not null references private.job_alerts(id) on delete cascade,
  job_key text not null check (char_length(job_key) between 1 and 500),
  sent_at timestamptz not null default now(),
  primary key (alert_id, job_key)
);
create table private.alert_prepared_messages (
  delivery_id uuid primary key references private.alert_deliveries(id) on delete cascade,
  message jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.alert_sent_jobs enable row level security;
alter table private.alert_sent_jobs force row level security;
alter table private.alert_prepared_messages enable row level security;
alter table private.alert_prepared_messages force row level security;
revoke all on private.alert_sent_jobs, private.alert_prepared_messages from public, anon, authenticated;

create function api.worker_read_alert_state(p_delivery_id uuid, p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_alert_id uuid;
begin
  perform security.require_service_role();
  select a.id into v_alert_id from private.alert_deliveries d
    join private.job_alerts a on a.id=d.alert_id and a.is_enabled
    join private.profiles p on p.user_id=a.user_id and p.account_status='active'
    join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
    where d.id=p_delivery_id and d.claim_token=p_claim_token and d.status='processing';
  if v_alert_id is null then raise exception 'alert_claim_inactive'; end if;
  return jsonb_build_object(
    'sent_job_keys', coalesce((select jsonb_agg(job_key) from private.alert_sent_jobs where alert_id=v_alert_id), '[]'::jsonb),
    'prepared', (select message from private.alert_prepared_messages where delivery_id=p_delivery_id)
  );
end;
$$;

create function api.worker_prepare_alert(p_delivery_id uuid, p_claim_token uuid, p_message jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_message jsonb;
begin
  perform api.worker_read_alert_state(p_delivery_id,p_claim_token);
  if jsonb_typeof(p_message->'job_keys') is distinct from 'array'
    or jsonb_array_length(p_message->'job_keys') not between 1 and 10
    or jsonb_typeof(p_message->'email') is distinct from 'object'
    or octet_length(p_message::text)>220000 then raise exception 'invalid_alert_message'; end if;
  insert into private.alert_prepared_messages(delivery_id,message) values(p_delivery_id,p_message)
    on conflict(delivery_id) do nothing;
  select message into v_message from private.alert_prepared_messages where delivery_id=p_delivery_id;
  return v_message;
end;
$$;

create function api.worker_complete_alert_with_jobs(
  p_delivery_id uuid, p_claim_token uuid, p_outcome text,
  p_matched_job_count integer default 0, p_provider_message_id text default null,
  p_error_code text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_done boolean; v_alert_id uuid; v_message jsonb;
begin
  perform security.require_service_role();
  select d.alert_id, m.message into v_alert_id,v_message
    from private.alert_deliveries d left join private.alert_prepared_messages m on m.delivery_id=d.id
    where d.id=p_delivery_id and d.claim_token=p_claim_token and d.status='processing' for update of d;
  if v_alert_id is null then return false; end if;
  if p_outcome='sent' and (v_message is null or nullif(p_provider_message_id,'') is null) then
    raise exception 'alert_message_not_prepared'; end if;
  v_done := api.worker_complete_alert_delivery(p_delivery_id,p_claim_token,p_outcome,p_matched_job_count,p_provider_message_id,p_error_code);
  if v_done and p_outcome='sent' then
    insert into private.alert_sent_jobs(alert_id,job_key)
      select v_alert_id,value from jsonb_array_elements_text(v_message->'job_keys')
      on conflict do nothing;
  end if;
  return v_done;
end;
$$;

create function api.worker_alert_source_enabled(p_adapter_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform security.require_service_role();
  return exists(select 1 from app.job_sources s where s.adapter_key=p_adapter_key
    and s.status='active' and s.may_email_jobs and s.allow_public_listing
    and s.authorization_revoked_at is null
    and (s.authorization_expires_at is null or s.authorization_expires_at>now())
    and security.job_source_policy_is_runnable(s.id));
end;
$$;
revoke all on function api.worker_read_alert_state(uuid,uuid) from public,anon,authenticated;
revoke all on function api.worker_prepare_alert(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function api.worker_complete_alert_with_jobs(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function api.worker_alert_source_enabled(text) from public,anon,authenticated;
grant execute on function api.worker_read_alert_state(uuid,uuid) to service_role;
grant execute on function api.worker_prepare_alert(uuid,uuid,jsonb) to service_role;
grant execute on function api.worker_complete_alert_with_jobs(uuid,uuid,text,integer,text,text) to service_role;
grant execute on function api.worker_alert_source_enabled(text) to service_role;
commit;
