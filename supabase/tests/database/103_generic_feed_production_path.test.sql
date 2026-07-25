begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(16);

-- The generic-feed production path: shared snapshot lifecycle, separate
-- authorization helper, durable metrics and pre-normalization evidence.

/* ------------------------- structures exist ---------------------------- */

select has_function(
  'security', 'authorized_feed_source_config_rows', array[]::text[],
  'the generic-feed authorization helper exists'
);
select has_function(
  'security', 'authorized_snapshot_source_config_rows', array[]::text[],
  'the shared snapshot authorization union exists'
);
select has_table('private', 'feed_run_metrics', 'durable feed run metrics exist');
select has_table(
  'ingest', 'feed_source_evidence', 'pre-normalization feed evidence exists'
);

/* ------------------------- fail-closed default -------------------------- */

-- No employer feed is configured, so the helper must return nothing. This is
-- the honest current state and the reason no feed can run.
select is(
  (select count(*) from security.authorized_feed_source_config_rows()),
  0::bigint,
  'no employer feed is authorized: the helper returns no rows'
);

-- The union must equal the ATS rows exactly while no feed is authorized,
-- proving the extension cannot change ATS behaviour today.
select is(
  (select count(*) from security.authorized_snapshot_source_config_rows()),
  (select count(*) from security.authorized_ats_source_config_rows()),
  'the snapshot union adds nothing while no feed is authorized'
);

/* ---------------- ATS claim/list paths remain untouched ----------------- */

-- The deliberate design point: widening the ATS helper would have made the
-- ATS worker claim generic feeds. It must still read only ATS rows.
select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'worker_claim_ats_source_fetch'
  ) like '%authorized_ats_source_config_rows%',
  'the ATS fetch-claim path still reads only ATS-authorized sources'
);
select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'worker_list_authorized_ats_sources'
  ) like '%authorized_ats_source_config_rows%',
  'the ATS source listing still reads only ATS-authorized sources'
);

/* -------------- the snapshot lifecycle admits both source kinds --------- */

select ok(
  (
    select p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'worker_begin_ats_snapshot'
  ) like '%authorized_snapshot_source_config_rows%',
  'begin-snapshot resolves sources through the shared union'
);
select ok(
  (
    select p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'worker_begin_ats_snapshot'
  ) like '%p_provider_count not between 0 and 5000%',
  'begin-snapshot admits a feed up to MAX_FEED_RECORDS'
);

/* --------------------------- worker RPCs -------------------------------- */

select has_function(
  'api', 'worker_record_feed_run_metrics', array['jsonb'],
  'the durable metrics RPC exists'
);
select has_function(
  'api', 'worker_store_feed_evidence', array['text', 'jsonb'],
  'the source-evidence RPC exists'
);

/* --------------------------- access control ----------------------------- */

select ok(
  not has_function_privilege('anon', 'api.worker_record_feed_run_metrics(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.worker_record_feed_run_metrics(jsonb)', 'execute'),
  'the metrics RPC is not callable by anon or authenticated'
);
select ok(
  not has_function_privilege('anon', 'api.worker_store_feed_evidence(text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'api.worker_store_feed_evidence(text,jsonb)', 'execute'),
  'the evidence RPC is not callable by anon or authenticated'
);
select ok(
  not has_function_privilege('anon', 'security.authorized_feed_source_config_rows()', 'execute')
  and not has_function_privilege('authenticated', 'security.authorized_feed_source_config_rows()', 'execute'),
  'the feed authorization helper is not callable by anon or authenticated'
);

/* ------------------------------- RLS ------------------------------------ */

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'private.feed_run_metrics'::regclass),
  'feed run metrics force row level security'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'ingest.feed_source_evidence'::regclass),
  'feed source evidence forces row level security'
);

select * from finish();
rollback;
