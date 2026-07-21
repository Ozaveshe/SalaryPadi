-- Register the secondary-feed snapshot worker. It fetches the reviewed
-- Jobicy and Himalayas public feeds within their polling budgets and
-- persists redacted snapshots, so request-time rendering reads a snapshot
-- instead of calling the provider. Expected cadence is four runs per day;
-- the worker itself skips any source whose snapshot is younger than that
-- source's reviewed minimum poll interval.

begin;

insert into private.worker_schedules (
  task_key, expected_interval, stale_after, owner_label
) values (
  'secondary_feed_sync',
  interval '6 hours',
  interval '14 hours',
  'Oza - founder and interim source owner'
)
on conflict (task_key) do update
set expected_interval = excluded.expected_interval,
    stale_after = excluded.stale_after,
    owner_label = excluded.owner_label,
    enabled = true,
    updated_at = clock_timestamp();

commit;
