-- Restore worker-health observability.
--
-- Production drifted from this repository: migration version 20260724180000
-- ("employer_feed_worker_schedule") is present in supabase_migrations with an
-- EMPTY statements array — it was recorded by `supabase migration repair`, not
-- replayed — and it left an `employer_feed_sync` row in
-- private.worker_schedules with enabled = true. No Netlify function and no
-- entry in config/production-workers.json corresponds to that key, so the row
-- can never complete a run and api.get_worker_health() returned a task_key the
-- /api/health worker schema did not allow. That single unknown key failed the
-- whole array parse, which is why the endpoint reported `workers: []` while 25
-- of 26 real workers were healthy.
--
-- This migration makes the row honest rather than deleting it: the schedule is
-- retained for the future employer-feed worker but marked disabled, so
-- api.get_worker_health() reports freshness 'disabled' instead of a permanent
-- 'never'. It is idempotent and works whether or not the row exists, so local
-- and CI databases converge on the same state as production.
--
-- This migration does NOT implement or enable any employer feed. Enabling the
-- schedule is deliberately left to the change that ships the worker itself.

begin;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label, enabled
) values (
  'employer_feed_sync',
  interval '6 hours',
  interval '14 hours',
  'SalaryPadi ingestion operations',
  false
)
on conflict (task_key) do update
set enabled = false,
    updated_at = now();

commit;
