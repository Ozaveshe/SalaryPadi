begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;

select plan(37);

select has_schema('api', 'api schema exists');
select has_schema('app', 'app schema exists');
select has_schema('private', 'private schema exists');
select has_schema('ingest', 'ingest schema exists');
select has_schema('audit', 'audit schema exists');
select has_schema('security', 'security schema exists');

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relkind in ('r', 'p', 'm')
  ),
  'api contains no base or materialized tables'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'private', 'ingest', 'audit')
      and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  'all application tables enable RLS'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'private', 'ingest', 'audit')
      and c.relkind in ('r', 'p') and not c.relforcerowsecurity
  ),
  'all application tables force RLS'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relkind = 'v'
      and not (coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'])
  ),
  'all exposed views use security_invoker'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'api'
      and column_name in (
        'contributor_user_id', 'reporter_user_id', 'submitted_by',
        'source_contribution_id', 'raw_payload', 'private_notes',
        'actor_user_id', 'assigned_to', 'network_key_hash'
      )
      and not (table_name like 'my_%' and column_name = 'private_notes')
  ),
  'public API views omit identity links, raw payloads, and internal fields'
);

select ok(not has_schema_privilege('anon', 'api', 'CREATE'), 'anon cannot create in api');
select ok(not has_schema_privilege('authenticated', 'api', 'CREATE'), 'authenticated cannot create in api');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use private schema');
select ok(not has_schema_privilege('anon', 'ingest', 'USAGE'), 'anon cannot use ingest schema');
select ok(not has_schema_privilege('authenticated', 'ingest', 'USAGE'), 'authenticated cannot use ingest schema');
select ok(not has_schema_privilege('anon', 'audit', 'USAGE'), 'anon cannot use audit schema');
select ok(not has_schema_privilege('authenticated', 'audit', 'USAGE'), 'authenticated cannot use audit schema');

select ok(
  not has_table_privilege('anon', 'private.salary_submissions', 'SELECT')
  and not has_table_privilege('anon', 'private.company_reviews', 'SELECT')
  and not has_table_privilege('anon', 'private.interview_experiences', 'SELECT'),
  'anon has no raw contribution privileges'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname in ('security', 'audit')
      and p.prosecdef and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'security-definer routines are not executable by PUBLIC'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('security', 'audit') and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
  ),
  'every security-definer routine fixes search_path'
);

select has_trigger('audit', 'event_log', 'event_log_append_only', 'audit event log has append-only trigger');
select has_trigger('private', 'moderation_actions', 'moderation_actions_append_only', 'moderation actions have append-only trigger');

select ok(
  has_table_privilege('anon', 'api.jobs', 'SELECT')
  and not has_table_privilege('anon', 'api.jobs', 'INSERT')
  and not has_table_privilege('anon', 'api.jobs', 'UPDATE')
  and not has_table_privilege('anon', 'api.jobs', 'DELETE'),
  'anonymous job access is read-only'
);

select ok(
  has_table_privilege('anon', 'api.salary_aggregates', 'SELECT')
  and not has_table_privilege('anon', 'api.salary_aggregates', 'INSERT'),
  'salary aggregate surface is read-only'
);

select ok(
  pg_get_viewdef('api.jobs'::regclass, true) like '%allow_public_listing%'
  and pg_get_viewdef('api.jobs'::regclass, true) like '%valid_through%'
  and pg_get_viewdef('api.jobs'::regclass, true) like '%is_fixture%',
  'job projection enforces source permission, expiry, and fixture exclusion'
);

select ok(
  pg_get_viewdef('api.salary_aggregates'::regclass, true) like '%is_current%'
  and pg_get_viewdef('api.salary_aggregates'::regclass, true) like '%is_released%',
  'salary projection exposes only current released snapshots'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname in (
        'submit_salary', 'submit_review', 'submit_interview',
        'submit_report', 'set_job_saved', 'upsert_application'
      )
      and pg_get_function_arguments(p.oid) ~* '(user_id|actor_id|contributor_user_id)'
  ),
  'member mutation RPCs derive actor identity instead of accepting it'
);

select ok(
  not has_table_privilege('authenticated', 'audit.event_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'audit.event_log', 'DELETE')
  and not has_table_privilege('authenticated', 'audit.event_log', 'TRUNCATE'),
  'authenticated role cannot mutate or truncate audit events'
);

select ok(
  not has_table_privilege('authenticated', 'private.moderation_actions', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.moderation_actions', 'DELETE')
  and not has_table_privilege('authenticated', 'private.moderation_actions', 'TRUNCATE'),
  'authenticated role cannot mutate or truncate moderation actions'
);

select is(
  (select min_distinct_contributors from app.privacy_rule_versions
   where metric = 'salary_employer_role_country' and is_active),
  3,
  'employer-role-country salary threshold starts at three distinct contributors'
);

select is(
  (select min_distinct_contributors from app.privacy_rule_versions
   where metric = 'company_overall_rating' and is_active),
  5,
  'company overall rating threshold starts at five distinct reviewers'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'api' and table_name = 'company_reviews'
      and column_name = 'source_contribution_id'
  ),
  'public review projection does not expose its private contribution link'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'api' and table_name = 'interview_experiences'
      and column_name = 'source_contribution_id'
  ),
  'public interview projection does not expose its private contribution link'
);

select ok(
  to_regprocedure('api.has_staff_role(text)') is not null,
  'API exposes the role-check RPC used by the application'
);

select ok(
  to_regprocedure('api.submit_contribution(text,jsonb)') is not null,
  'API exposes the unified contribution RPC used by the application'
);

select ok(
  to_regprocedure('api.save_external_job(text,text,text,text,text,text,timestamp with time zone,text)') is not null
  and to_regprocedure('api.remove_saved_job(uuid)') is not null
  and to_regprocedure('api.get_my_saved_jobs()') is not null
  and to_regprocedure('api.record_external_application(text,text,text,text,text,text,text)') is not null
  and to_regprocedure('api.get_my_applications()') is not null
  and to_regprocedure('api.update_application_status(uuid,text,text,date)') is not null
  and to_regprocedure('api.remove_application(uuid)') is not null
  and to_regprocedure('api.create_job_alert(jsonb,text)') is not null
  and to_regprocedure('api.get_my_job_alerts()') is not null
  and to_regprocedure('api.remove_job_alert(uuid)') is not null
  and to_regprocedure('api.report_content(text,text,text)') is not null
  and to_regprocedure('api.submit_employer_job(jsonb,boolean)') is not null,
  'API compatibility RPCs used by current route handlers all exist'
);

select * from finish();
rollback;
