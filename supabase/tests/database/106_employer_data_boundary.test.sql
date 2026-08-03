begin;

-- The employer data boundary, enforced where it cannot be argued with.
--
-- src/lib/employers/data-boundaries.ts states which fields an employer may
-- edit. This asserts the property that makes the statement true: an employer
-- has no way to write a row at all. Every employer write goes through a
-- security-definer RPC into a moderation queue.
--
-- The failure this guards against is a convenience grant — "just let them
-- update their own company row" — which would hand an authenticated account
-- direct reach into evidence tables and make the whole boundary advisory.

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(5);

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and table_schema in ('app', 'api', 'private')),
  0,
  'no signed-in account holds a direct write grant on app, api or private'
);

-- One deliberate SELECT grant exists here (audit.company_opinion_quarantine,
-- so a contributor can see their own quarantined opinion). Writes are the
-- property under test.
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and table_schema in ('audit', 'ingest', 'security')),
  0,
  'no signed-in account can write to the audit, ingest or security schemas'
);

-- The evidence an employer would most want to edit, named individually so a
-- future grant to any one of them fails here by name.
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and table_name in (
       'salary_aggregate_snapshots', 'companies', 'jobs',
       'privacy_rule_versions', 'aggregate_runs'
     )),
  0,
  'employers cannot write aggregates, companies, jobs or privacy rules'
);

-- An employer submission must land somewhere reviewable, not on a record.
select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'submit_employer_response'
      and p.prosecdef
  ),
  'the employer response path is a security-definer RPC, not a table write'
);

-- api.submit_employer_job is a thin invoker-rights wrapper; the privileged
-- work happens in security.submit_employer_job. Assert the definer function
-- rather than the wrapper, so this does not pass for the wrong reason.
select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'security' and p.proname = 'submit_employer_job'
      and p.prosecdef
  ),
  'the employer job submission path reaches storage only through a definer function'
);

select * from finish();
rollback;
