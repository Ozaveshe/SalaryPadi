-- The reviewed Remotive policy permits at most four normal reads per day. The
-- source worker is the only reader used by alert delivery; it refreshes the
-- description-free site catalog every six hours.

update private.worker_schedules
set expected_interval = interval '6 hours',
    stale_after = interval '14 hours',
    updated_at = clock_timestamp()
where task_key = 'job_source_sync';
