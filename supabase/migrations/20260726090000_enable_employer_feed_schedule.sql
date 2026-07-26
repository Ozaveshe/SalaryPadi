-- Enable the employer-feed schedule now that a worker actually exists.
--
-- 20260725120000 marked this schedule disabled because production carried the
-- row (from an untracked, repaired migration) with no deployed worker behind
-- it: a schedule that can never complete a run is dishonest health data.
-- netlify/functions/employer-feed-sync.mts now deploys on a six-hourly cron,
-- so the schedule is expected to report again.
--
-- The worker records an honest `skipped` outcome while no feed is authorized.
-- security.get_worker_health_internal keys freshness on the latest run's
-- completed_at, so a skipped run keeps the worker healthy without pretending
-- any feed was processed. Enabling the schedule does NOT enable any feed:
-- config/employer-feed-registry.json is still empty and both global source
-- policies are still disabled.

begin;

update private.worker_schedules
set enabled = true, updated_at = now()
where task_key = 'employer_feed_sync';

commit;
