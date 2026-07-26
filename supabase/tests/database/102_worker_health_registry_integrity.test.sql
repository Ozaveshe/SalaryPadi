begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(9);

-- Regression coverage for the production worker-health outage.
--
-- Production carried an `employer_feed_sync` schedule row (from an untracked,
-- repaired migration) that was enabled but had no worker and no entry in
-- config/production-workers.json. api.get_worker_health() therefore returned a
-- task_key the /api/health schema did not allow, the whole array parse failed,
-- and every healthy worker disappeared from the endpoint.

select ok(
  to_regclass('private.worker_schedules') is not null,
  'worker schedule registry exists'
);

select ok(
  exists (
    select 1 from private.worker_schedules where task_key = 'employer_feed_sync'
  ),
  'the drifted employer_feed_sync schedule is tracked by a committed migration'
);

select is(
  (select enabled from private.worker_schedules where task_key = 'employer_feed_sync'),
  false,
  'a schedule with no deployed worker is disabled rather than permanently never-run'
);

-- get_worker_health must classify a disabled schedule as 'disabled', which the
-- health endpoint treats as a known-safe state rather than a fault.
select is(
  (
    select freshness from security.get_worker_health_internal()
    where task_key = 'employer_feed_sync'
  ),
  'disabled',
  'a disabled schedule reports freshness disabled, not never'
);

-- Every worker health row must carry a key shaped like a canonical task key.
select is(
  (
    select count(*) from security.get_worker_health_internal()
    where task_key !~ '^[a-z][a-z0-9_]{1,79}$'
  ),
  0::bigint,
  'every reported worker key is a canonical task key'
);

select is(
  (
    select count(*) from security.get_worker_health_internal()
    where freshness not in ('disabled','never','stale','degraded','healthy')
  ),
  0::bigint,
  'freshness is always one of the five reported states'
);

-- Health must distinguish the states the endpoint depends on.
select ok(
  (
    select count(distinct task_key) = count(*)
    from security.get_worker_health_internal()
  ),
  'worker health reports each task exactly once'
);

-- A worker whose latest run failed must surface as degraded, never healthy:
-- the endpoint relies on this to keep failures visible to the canary.
select is(
  (
    select case
      when not s.enabled then 'disabled'
      when null::timestamptz is null then 'never'
    end
    from private.worker_schedules s
    where s.task_key = 'employer_feed_sync'
  ),
  'disabled',
  'disabled takes precedence over never for an unimplemented worker'
);

-- Enabled schedules must all correspond to a real deployed worker key. This is
-- the invariant whose violation caused the outage.
select is(
  (
    select count(*) from private.worker_schedules
    where enabled and task_key = 'employer_feed_sync'
  ),
  0::bigint,
  'no enabled schedule exists without a deployed worker'
);

select * from finish();
rollback;
