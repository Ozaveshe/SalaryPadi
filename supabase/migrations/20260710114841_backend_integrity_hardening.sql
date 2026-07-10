begin;

-- Resolve and pin the legacy generic admin function's parameter/column ambiguity only
-- for this function. `plpgsql.variable_conflict` is a superuser-only setting on
-- hosted Postgres, so prepend the equivalent compile-time directive while
-- preserving the reviewed function body and its public named-argument contract.
do $migration$
declare
  v_source text;
begin
  select p.prosrc into strict v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'security'
    and p.proname = 'admin_transition'
    and p.proargtypes = '25 25 2950 25 23'::oidvector;

  if encode(
       extensions.digest(
         convert_to(replace(v_source, E'\r\n', E'\n'), 'UTF8'),
         'sha256'
       ),
       'hex'
     ) <> 'ffc8653976a4aaf4c9be5fb82966dcfe6074093b7611e92349e6623f017d87df'
     or position('#variable_conflict' in v_source) > 0
     or position('$admin_transition_body$' in v_source) > 0 then
    raise exception using errcode = '55000',
      message = 'unexpected admin transition source';
  end if;

  execute format(
    $definition$
create or replace function security.admin_transition(
  resource_name text,
  action_name text,
  target_id uuid,
  action_reason text,
  expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $admin_transition_body$
#variable_conflict use_variable
%s
$admin_transition_body$;
$definition$,
    v_source
  );
end;
$migration$;

-- Recover abandoned operational runs before a new scheduled invocation is
-- claimed. This routine is deliberately internal: worker_start is the only
-- application entry point and independently requires the service role.
create or replace function security.recover_stale_worker_runs(
  p_stale_after interval default interval '1 hour'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  perform security.require_service_role();
  if p_stale_after is null
     or p_stale_after < interval '5 minutes'
     or p_stale_after > interval '24 hours' then
    raise exception using errcode = '22023', message = 'invalid stale-run threshold';
  end if;

  update private.worker_runs
  set status = 'failed',
      completed_at = clock_timestamp(),
      error_code = 'worker_timeout'
  where status = 'running'
    and started_at < clock_timestamp() - p_stale_after;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function security.recover_stale_worker_runs(interval)
from public, anon, authenticated, service_role;

create index if not exists worker_runs_stale_running
on private.worker_runs (started_at)
where status = 'running';

create or replace function api.worker_start(
  p_task_key text,
  p_run_key text,
  p_scheduled_for timestamptz default null,
  p_deploy_id text default null
)
returns table (run_id uuid, should_run boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform security.require_service_role();
  if char_length(p_run_key) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid run key';
  end if;

  perform security.recover_stale_worker_runs(interval '1 hour');

  insert into private.worker_runs (
    task_key, run_key, trigger_kind, scheduled_for, deploy_id
  ) values (
    p_task_key, p_run_key,
    case when p_run_key like 'manual:%' then 'manual' else 'schedule' end,
    p_scheduled_for, nullif(left(p_deploy_id, 160), '')
  )
  on conflict (task_key, run_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select r.id into strict v_id
  from private.worker_runs r
  where r.task_key = p_task_key and r.run_key = p_run_key;
  return query select v_id, false;
end;
$$;

-- The web schedule now polls Remotive twice daily. Keep the source contract,
-- worker-health expectation, and deployed cadence aligned.
update app.job_sources
set refresh_interval = interval '12 hours'
where adapter_key = 'remotive';

update private.worker_schedules
set expected_interval = interval '12 hours',
    stale_after = interval '14 hours',
    updated_at = clock_timestamp()
where task_key = 'job_source_sync';

-- One bounded alert claim per invocation keeps every function inside the
-- platform deadline. Ten-minute cadence provides a bounded ceiling of 144
-- claims per day; a queue/background dispatcher is still required before
-- expected due volume approaches that ceiling.
update private.worker_schedules
set expected_interval = interval '10 minutes',
    stale_after = interval '35 minutes',
    updated_at = clock_timestamp()
where task_key = 'alert_delivery';

-- A disabled provider still proves that its scheduler executed and honored
-- the kill switch. Treat a recent skipped run as fresh without relabelling it
-- as a successful provider operation.
create or replace function security.get_worker_health_internal()
returns table (
  task_key text,
  owner_label text,
  last_status text,
  last_started_at timestamptz,
  last_success_at timestamptz,
  freshness text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.task_key, s.owner_label,
    latest.status,
    latest.started_at,
    success.completed_at,
    case
      when not s.enabled then 'disabled'
      when latest.status = 'skipped'
        and latest.completed_at >= clock_timestamp() - s.stale_after
        then 'healthy'
      when success.completed_at is null then 'never'
      when success.completed_at < clock_timestamp() - s.stale_after then 'stale'
      when latest.status = 'failed' then 'degraded'
      else 'healthy'
    end
  from private.worker_schedules s
  left join lateral (
    select r.status, r.started_at, r.completed_at
    from private.worker_runs r
    where r.task_key = s.task_key
    order by r.started_at desc, r.id desc
    limit 1
  ) latest on true
  left join lateral (
    select r.completed_at
    from private.worker_runs r
    where r.task_key = s.task_key and r.status = 'succeeded'
    order by r.completed_at desc, r.id desc
    limit 1
  ) success on true
  order by s.task_key
$$;

-- Serialize queue writers with aggregate refreshes by metric. A refresh takes
-- this transaction-scoped lock when it inserts its aggregate_runs row; an
-- approval/removal takes the same lock before its queue row is inserted. A
-- contribution committed while a refresh is running therefore queues only
-- after that refresh commits and cannot be consumed by its final blanket
-- processed_at update. The aggregate_runs trigger also serializes two refresh
-- workers that target the same partial "current" snapshot indexes.
create or replace function security.lock_aggregate_metric_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.metric is null or char_length(new.metric) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid aggregate metric';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'salarypadi:aggregate-refresh:' || new.metric,
    0
  ));
  return new;
end;
$$;

revoke all on function security.lock_aggregate_metric_write()
from public, anon, authenticated, service_role;

drop trigger if exists aggregate_runs_serialize_metric on app.aggregate_runs;
create trigger aggregate_runs_serialize_metric
before insert on app.aggregate_runs
for each row execute function security.lock_aggregate_metric_write();

drop trigger if exists aggregate_refresh_queue_serialize_metric
on private.aggregate_refresh_queue;
create trigger aggregate_refresh_queue_serialize_metric
before insert on private.aggregate_refresh_queue
for each row execute function security.lock_aggregate_metric_write();

drop trigger if exists aggregate_refresh_queue_serialize_processing
on private.aggregate_refresh_queue;
create trigger aggregate_refresh_queue_serialize_processing
before update of processed_at on private.aggregate_refresh_queue
for each row
when (old.processed_at is null and new.processed_at is not null)
execute function security.lock_aggregate_metric_write();

-- A community suspension is independent from the account status. Refuse to
-- update or return a suspended public profile so every publishing RPC fails
-- before it can create content that would become visible after restoration.
create or replace function security.upsert_community_member(
  p_display_name text,
  p_state_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_state text := upper(nullif(btrim(coalesce(p_state_code, '')), ''));
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if char_length(v_name) not between 2 and 60
     or not (select security.community_text_is_safe(v_name)) then
    raise exception using errcode = '22023', message = 'invalid public display name';
  end if;
  if v_state is not null and not exists (
    select 1 from community.nigeria_states s where s.code = v_state
  ) then
    raise exception using errcode = '22023', message = 'invalid Nigerian state';
  end if;

  insert into community.member_profiles as current_member (
    user_id, display_name, state_code
  ) values (
    (select auth.uid()), v_name, v_state
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      state_code = excluded.state_code,
      updated_at = clock_timestamp()
  where current_member.status = 'active'
  returning id into v_id;

  if v_id is null then
    raise exception using errcode = '42501', message = 'community profile suspended';
  end if;
  return v_id;
end;
$$;

-- Validate the database RPC contract rather than trusting only the web form.
-- Remotive jobs are intentionally not stored, so their configured source and
-- normalized identifier are the strongest durable target proof available.
create or replace function security.submit_report(
  p_target_kind private.report_target_kind,
  p_target_id text,
  p_category text,
  p_narrative text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_case_id uuid;
  v_target text := btrim(coalesce(p_target_id, ''));
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_target_exists boolean := false;
begin
  if not (select security.is_active_user()) then
    raise exception using errcode = '42501', message = 'active permanent account required';
  end if;
  if p_target_kind is null
     or char_length(v_target) not between 1 and 220
     or v_category not in (
       'expired', 'fee', 'impersonation', 'eligibility', 'incorrect',
       'privacy', 'spam', 'harassment', 'misinformation', 'other'
     )
     or char_length(coalesce(p_narrative, '')) > 5000 then
    raise exception using errcode = '22023', message = 'invalid report';
  end if;

  case p_target_kind
    when 'job' then
      select exists (
        select 1 from app.jobs j
        where (j.id::text = v_target or j.slug = v_target)
          and j.status = 'published'
      ) or (
        v_target ~ '^remotive-[0-9]+$'
        and exists (
          select 1 from app.job_sources s
          where s.adapter_key = 'remotive'
            and s.status = 'active'
            and s.allow_public_listing
        )
      ) into v_target_exists;
    when 'company' then
      select exists (
        select 1 from app.companies c
        where (c.id::text = v_target or c.slug = v_target)
          and c.record_status = 'published'
      ) into v_target_exists;
    when 'review' then
      select exists (
        select 1 from app.review_publications r
        where r.id::text = v_target and r.publication_status = 'published'
      ) into v_target_exists;
    when 'interview' then
      select exists (
        select 1 from app.interview_publications i
        where i.id::text = v_target and i.publication_status = 'published'
      ) into v_target_exists;
    when 'feed_post' then
      select exists (
        select 1
        from community.feed_posts p
        join community.member_profiles m
          on m.id = p.author_profile_id and m.status = 'active'
        where p.id::text = v_target and p.status = 'published'
      ) into v_target_exists;
    when 'forum_thread' then
      select exists (
        select 1
        from community.forum_threads t
        join community.member_profiles m
          on m.id = t.author_profile_id and m.status = 'active'
        join community.forum_topics topic
          on topic.id = t.topic_id and topic.status = 'active'
        where t.id::text = v_target and t.status = 'published'
      ) into v_target_exists;
    when 'forum_reply' then
      select exists (
        select 1
        from community.forum_replies r
        join community.member_profiles reply_author
          on reply_author.id = r.author_profile_id and reply_author.status = 'active'
        join community.forum_threads t
          on t.id = r.thread_id and t.status = 'published'
        join community.member_profiles thread_author
          on thread_author.id = t.author_profile_id and thread_author.status = 'active'
        join community.forum_topics topic
          on topic.id = t.topic_id and topic.status = 'active'
        where r.id::text = v_target and r.status = 'published'
      ) into v_target_exists;
  end case;

  if not coalesce(v_target_exists, false) then
    raise exception using errcode = 'P0002', message = 'report target not found';
  end if;

  perform security.consume_rate_limit('content_report', 10, interval '1 day');
  insert into private.reports (
    reporter_user_id, target_kind, target_id, category, narrative
  ) values (
    (select auth.uid()), p_target_kind, v_target, v_category, p_narrative
  ) returning id into v_id;
  insert into private.moderation_cases (report_id)
  values (v_id)
  returning id into v_case_id;
  perform audit.write_event(
    'user', 'content.reported', p_target_kind::text,
    case
      when v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then v_target::uuid
      else null
    end,
    v_category, null, jsonb_build_object('report_id', v_id, 'status', 'pending'),
    array['status'], null, null,
    jsonb_build_object('reported_id', v_target, 'case_id', v_case_id)
  );
  return v_id;
end;
$$;

commit;
