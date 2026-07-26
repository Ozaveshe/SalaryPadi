begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(5);

-- Operator visibility for employer feeds. Internal only.

select has_function(
  'api', 'admin_get_employer_feed_health', array[]::text[],
  'the employer feed health RPC exists'
);

-- Staff-gated: anon must never reach operator evidence.
select ok(
  not has_function_privilege(
    'anon', 'api.admin_get_employer_feed_health()', 'execute'
  ),
  'anonymous callers cannot read employer feed health'
);

-- Authenticated callers may CALL it, but the body re-checks admin + AAL2, the
-- same posture as the other admin_get_* evidence functions.
select ok(
  has_function_privilege(
    'authenticated', 'api.admin_get_employer_feed_health()', 'execute'
  ),
  'authenticated callers may invoke it; the body enforces admin and AAL2'
);
select ok(
  (
    select p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'admin_get_employer_feed_health'
  ) like '%has_staff_role(''admin'')%',
  'the body requires the admin staff role'
);
select ok(
  (
    select p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'admin_get_employer_feed_health'
  ) like '%is_aal2()%',
  'the body requires AAL2'
);

select * from finish();
rollback;
