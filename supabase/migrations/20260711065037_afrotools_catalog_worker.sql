insert into private.worker_schedules (task_key, expected_interval, stale_after, owner_label)
values ('afrotools_catalog_sync', interval '6 hours', interval '14 hours', 'SalaryPadi integrations owner')
on conflict (task_key) do update set
  expected_interval = excluded.expected_interval,
  stale_after = excluded.stale_after,
  owner_label = excluded.owner_label,
  enabled = true,
  updated_at = clock_timestamp();
