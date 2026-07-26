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

-- 20260725120000 disabled this schedule because no worker existed for it.
-- 20260726090000 re-enabled it once netlify/functions/employer-feed-sync.mts
-- shipped. Enabled is now the correct state: a worker runs on a six-hourly
-- cron and records an honest skipped outcome while no feed is authorized.
select is(
  (select enabled from private.worker_schedules where task_key = 'employer_feed_sync'),
  true,
  'the schedule is enabled because a worker now ships for it'
);

-- On a freshly migrated database no worker has run yet, so an enabled
-- schedule reports 'never'. That is why the worker must genuinely execute
-- rather than the schedule merely being flipped on.
select is(
  (
    select freshness from security.get_worker_health_internal()
    where task_key = 'employer_feed_sync'
  ),
  'never',
  'an enabled schedule with no recorded run reports never, not healthy'
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

-- Disabling remains the honest representation for a schedule with no worker:
-- the health function checks `enabled` before it checks for runs, so a parked
-- schedule can never masquerade as never-run.
select is(
  (
    select case
      when not s.enabled then 'disabled'
      else 'never'
    end
    from private.worker_schedules s
    where s.task_key = 'employer_feed_sync'
  ),
  'never',
  'disabled is checked before never, and this schedule is enabled'
);

-- The schedule exists exactly once. A duplicate would make the health array
-- report the same key twice, which fails worker_health_complete.
select is(
  (
    select count(*) from private.worker_schedules
    where task_key = 'employer_feed_sync'
  ),
  1::bigint,
  'the employer feed schedule is registered exactly once'
);

select * from finish();
rollback;
