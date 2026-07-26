begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(11);

-- Operator-authorized employer CSV import: one predicate, two grant branches.

select has_function(
  'security', 'employer_feed_import_grant', array['text'],
  'the import grant predicate exists'
);
select has_function(
  'api', 'can_import_employer_feed', array['text'],
  'the public authorization check exists'
);
select has_table(
  'private', 'employer_feed_imports', 'the import audit table exists'
);
select has_function(
  'api', 'record_employer_feed_import',
  array['text','text','text','integer','integer','integer','text','uuid'],
  'the audit RPC exists'
);

-- Anonymous callers get nothing: not the predicate, not the audit write.
select ok(
  not has_function_privilege('anon', 'api.can_import_employer_feed(text)', 'execute'),
  'anonymous callers cannot test import authorization'
);
select ok(
  not has_function_privilege('anon', 'security.employer_feed_import_grant(text)', 'execute'),
  'anonymous callers cannot reach the grant predicate'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.record_employer_feed_import(text,text,text,integer,integer,integer,text,uuid)',
    'execute'
  ),
  'anonymous callers cannot write import audit rows'
);

-- With no session and no membership, the grant is null: fail closed.
select is(
  (select security.employer_feed_import_grant('acme_csv')),
  null,
  'an unauthenticated caller holds no import grant'
);
select is(
  (select api.can_import_employer_feed('acme_csv')),
  false,
  'an unauthenticated caller may not import'
);

-- The verified-employer branch is real but unexercised: no memberships exist,
-- so it cannot currently authorize anything. This asserts the honest state.
select is(
  (select count(*) from private.company_memberships
    where status = 'verified' and revoked_at is null),
  0::bigint,
  'no verified company membership exists, so only the operator branch is live'
);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'private.employer_feed_imports'::regclass),
  'the import audit table forces row level security'
);

select * from finish();
rollback;
