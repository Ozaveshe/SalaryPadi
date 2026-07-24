-- Register the scheduled worker for employer-authorized generic feeds so a
-- missed run surfaces as staleness on the admin source-health view instead of
-- silence. The worker itself no-ops while the employer feed registry is empty:
-- it selects only eligible feeds, and there are none, so it makes no network
-- request and writes no ingestion rows.

begin;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label, enabled
)
select
  'employer_feed_sync',
  interval '6 hours',
  interval '14 hours',
  'SalaryPadi ingestion operations',
  true
where not exists (
  select 1 from private.worker_schedules where task_key = 'employer_feed_sync'
);

commit;
