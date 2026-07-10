-- Match the repository-wide invariant: table owners must not bypass RLS on
-- private application tables. Service-role worker access goes through the
-- reviewed security-definer RPC surface instead of direct table grants.

alter table private.worker_schedules force row level security;
alter table private.worker_runs force row level security;
alter table private.alert_deliveries force row level security;
alter table private.analytics_daily_counts force row level security;
