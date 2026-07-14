begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, editorial, security;
select plan(25);

select has_table('editorial', 'seo_landing_pages', 'programmatic SEO landing registry exists');
select has_table('editorial', 'topic_signals', 'editorial signal ledger exists');
select has_table('editorial', 'evidence_packs', 'private editorial evidence packs exist');
select has_table('private', 'google_indexing_outbox', 'job-only Google indexing outbox exists');

select is(
  (select count(*)::integer from editorial.seo_landing_pages),
  8,
  'only the reviewed landing-page allowlist is configured'
);
select is(
  (select count(*)::integer from editorial.seo_landing_pages where stable_demand_signal),
  0,
  'no landing page is index-enabled without reviewed demand evidence'
);
select ok(
  to_regprocedure('api.job_landing_page_metrics(text)') is not null,
  'landing-page metrics RPC exists'
);
select ok(
  to_regprocedure('api.google_indexing_claim_notifications(integer)') is not null,
  'Google indexing claim RPC exists'
);
select ok(
  to_regprocedure('api.google_indexing_finish_notification(uuid,boolean,integer,text)') is not null,
  'Google indexing completion RPC exists'
);
select ok(
  to_regprocedure('api.editorial_prepare_evidence_pack()') is not null,
  'evidence-pack preparation RPC exists'
);
select ok(
  to_regprocedure('api.editorial_record_topic_signals(jsonb)') is not null,
  'aggregate topic-signal intake RPC exists'
);
select ok(
  to_regprocedure('api.editorial_run_monthly_audit()') is not null,
  'monthly policy freshness audit exists'
);

select ok(
  has_function_privilege('anon', 'api.job_landing_page_metrics(text)', 'EXECUTE'),
  'anonymous readers can request aggregate landing metrics'
);
select ok(
  not has_table_privilege('anon', 'editorial.seo_landing_pages', 'SELECT')
  and not has_table_privilege('authenticated', 'private.google_indexing_outbox', 'SELECT'),
  'landing demand evidence and indexing queue are not directly exposed'
);
select ok(
  not has_function_privilege('anon', 'api.google_indexing_claim_notifications(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.google_indexing_finish_notification(uuid,boolean,integer,text)', 'EXECUTE'),
  'untrusted roles cannot claim or complete Google notifications'
);
select ok(
  has_function_privilege('service_role', 'api.google_indexing_claim_notifications(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.google_indexing_finish_notification(uuid,boolean,integer,text)', 'EXECUTE'),
  'only the service worker can operate the Google outbox'
);
select ok(
  not has_function_privilege('anon', 'api.editorial_record_topic_signals(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.editorial_prepare_evidence_pack()', 'EXECUTE'),
  'topic signals and evidence packs reject untrusted writers'
);

select is(
  (select expected_interval from private.worker_schedules where task_key = 'google_indexing_notifications'),
  interval '15 minutes',
  'eligible job notifications are checked every fifteen minutes'
);
select is(
  (select expected_interval from private.worker_schedules where task_key = 'editorial_evidence_packs'),
  interval '24 hours',
  'evidence packs run once per editorial day'
);
select is(
  (select expected_interval from private.worker_schedules where task_key = 'editorial_monthly_audit'),
  interval '1 month',
  'policy freshness review is registered monthly'
);

set local role anon;
select lives_ok(
  $$ select * from api.job_landing_page_metrics('remote_nigeria') $$,
  'public landing metrics return a safe aggregate projection'
);
select is(
  (select stable_demand_signal from api.job_landing_page_metrics('remote_nigeria')),
  false,
  'public metrics preserve the fail-closed demand decision'
);

reset role;
select ok(
  pg_get_functiondef('security.enqueue_google_indexing_job_change()'::regprocedure)
    ~ 'may_emit_jobposting_schema|google_indexing_source_is_eligible',
  'outbox trigger is coupled to both source indexing and JobPosting rights'
);
select ok(
  pg_get_functiondef('api.editorial_prepare_one_draft()'::regprocedure)
    ~ 'no_evidence_backed_candidate'
  and pg_get_functiondef('api.editorial_prepare_one_draft()'::regprocedure)
    ~ 'editorial.claims',
  'draft generator requires an evidence pack and records deterministic claims'
);
select ok(
  pg_get_functiondef('security.enqueue_google_indexing_job_child_change()'::regprocedure)
    ~ 'google_indexing_job_is_eligible'
  and pg_get_functiondef('security.enqueue_google_indexing_job_change()'::regprocedure)
    ~ 'old.slug is distinct from new.slug',
  'material job, eligibility, location, and slug changes keep the outbox current'
);

select * from finish();
rollback;
