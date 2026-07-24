begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security;
select plan(12);

-- The generic-feed providers are admitted to the shared ATS config table, so
-- employer feeds reuse the one canonical ingestion path rather than a second
-- architecture.
select ok(
  (
    select pg_get_constraintdef(oid) like '%employer_xml_feed%'
    from pg_constraint where conname = 'ats_source_configs_provider'
  ),
  'employer_xml_feed is an admitted source-config provider'
);
select ok(
  (
    select pg_get_constraintdef(oid) like '%employer_json_feed%'
    from pg_constraint where conname = 'ats_source_configs_provider'
  ),
  'employer_json_feed is an admitted source-config provider'
);
select ok(
  (
    select pg_get_constraintdef(oid) like '%employer_csv_import%'
    from pg_constraint where conname = 'ats_source_configs_provider'
  ),
  'employer_csv_import is an admitted source-config provider'
);

-- The snapshot RPCs the feed store depends on must exist with the contract
-- the runtime calls.
select has_function(
  'api', 'worker_begin_ats_snapshot',
  'feed store can open a bounded import run'
);
select has_function(
  'api', 'worker_store_ats_snapshot_batch',
  'feed store can write bounded canonical batches'
);
select has_function(
  'api', 'worker_finalize_ats_snapshot',
  'feed store can finalise complete vs partial snapshots'
);

-- Durable evidence and run tracking the admin source-health view reads.
select has_table('ingest', 'raw_job_records', 'immutable raw source records are retained');
select has_table('ingest', 'ats_snapshot_runs', 'per-snapshot runs are durable');
select has_table('private', 'worker_runs', 'worker run outcomes are durable');

-- The scheduled worker is registered, so a missed run is visible as staleness
-- rather than silence.
select is(
  (select count(*)::integer from private.worker_schedules where task_key = 'employer_feed_sync'),
  1,
  'employer_feed_sync is a registered scheduled worker'
);
select ok(
  (select enabled from private.worker_schedules where task_key = 'employer_feed_sync'),
  'employer_feed_sync schedule is enabled'
);

-- No employer feed has been authorized, so no generic-feed source may exist
-- as an active publishing source yet. This is the fact the documentation and
-- the PR description must keep telling the truth about.
select is(
  (
    select count(*)::integer
    from private.ats_source_configs
    where provider in ('employer_xml_feed', 'employer_json_feed', 'employer_csv_import')
  ),
  0,
  'zero employer feeds are configured: none has been authorized yet'
);

select * from finish();
rollback;
