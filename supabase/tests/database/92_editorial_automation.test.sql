begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, editorial, security;
select plan(17);

select has_table('editorial', 'topic_candidates', 'editorial topic queue exists');
select has_table('editorial', 'sources', 'editorial evidence sources exist');
select has_table('editorial', 'articles', 'editorial draft and publication records exist');
select has_table('editorial', 'claims', 'fact-check claims exist separately');
select has_table('editorial', 'live_job_blocks', 'dynamic live-job blocks exist');
select has_table('editorial', 'operational_alerts', 'editorial failure alerts exist');

select is(
  (select count(*)::integer from editorial.topic_candidates where topic_kind = 'cornerstone'),
  12,
  'launch queue contains exactly twelve cornerstone guides'
);
select is(
  (select count(*)::integer from editorial.topic_candidates where topic_kind = 'data_brief'),
  4,
  'launch queue contains four deterministic data briefs'
);
select is(
  (select count(*)::integer from private.worker_schedules where task_key like 'editorial_%'),
  9,
  'all editorial schedules are registered'
);

select ok(
  has_function_privilege('anon', 'api.list_published_editorial()', 'EXECUTE'),
  'anonymous readers can request the filtered published article projection'
);
select ok(
  not has_function_privilege('anon', 'api.editorial_publish_due()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.editorial_publish_due()', 'EXECUTE'),
  'untrusted roles cannot invoke automated publishing'
);
select ok(
  has_function_privilege('service_role', 'api.editorial_publish_due()', 'EXECUTE'),
  'service role can execute the publishing gate'
);
select ok(
  not has_table_privilege('anon', 'editorial.claims', 'SELECT')
  and not has_table_privilege('authenticated', 'editorial.claims', 'SELECT'),
  'claim records are not directly exposed'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'editorial.articles'::regclass),
  'editorial articles force RLS'
);
select is(
  (select count(*)::integer from api.list_published_editorial()),
  0,
  'no unapproved launch candidate is publicly visible'
);

set local role anon;
select lives_ok(
  $$ select * from api.list_published_editorial() $$,
  'anonymous readers can execute the RLS-filtered publication RPC'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;
select lives_ok(
  $$
    select api.editorial_revalidate_live_blocks(
      api.editorial_capture_job_snapshot(
        to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"'),
        clock_timestamp(),
        '{"active_jobs":0,"indexable_jobs":0,"remote_jobs":0,"nigeria_eligible":0,"nigeria_unclear":0,"jobs_with_deadlines":0,"jobs_without_deadlines":0}'::jsonb,
        '{}'::jsonb,
        repeat('a', 64)
      ),
      clock_timestamp(),
      0
    )
  $$,
  'service worker can revalidate every live block under safe-update enforcement'
);

select * from finish();
rollback;
