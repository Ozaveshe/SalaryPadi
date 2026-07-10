begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(13);

select has_table(
  'private', 'source_fetch_claims',
  'provider fetch claims table exists'
);
select ok(
  to_regprocedure('api.worker_claim_remotive_fetch(uuid,text)') is not null,
  'provider fetch budget RPC exists'
);
select ok(
  has_function_privilege(
    'service_role', 'api.worker_claim_remotive_fetch(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'api.worker_claim_remotive_fetch(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'api.worker_claim_remotive_fetch(uuid,text)', 'EXECUTE'
  ),
  'only service role can claim provider fetch budget'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'source_fetch_claims'),
  'provider fetch claims force RLS'
);

set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000001', 'test_contract'
  ),
  true,
  'first provider request receives a budget claim'
);
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000001', 'test_contract'
  ),
  false,
  'a duplicate request key cannot fetch twice'
);
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000002', 'test_contract'
  ),
  false,
  'a distinct request inside one minute is denied'
);

reset role;
update app.job_sources set status = 'paused' where adapter_key = 'remotive';
set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000002', 'test_contract'
  ),
  false,
  'a paused source receives no provider budget'
);

reset role;
update app.job_sources set status = 'active' where adapter_key = 'remotive';
update private.source_fetch_claims
set claimed_at = claimed_at - interval '2 minutes';
set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000002', 'test_contract'
  ),
  true,
  'second distinct provider request receives budget'
);
reset role;
update private.source_fetch_claims
set claimed_at = claimed_at - interval '2 minutes';
set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000003', 'test_contract'
  ),
  true,
  'third distinct provider request receives budget'
);
reset role;
update private.source_fetch_claims
set claimed_at = claimed_at - interval '2 minutes';
set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000004', 'test_contract'
  ),
  true,
  'fourth distinct provider request receives budget'
);
reset role;
update private.source_fetch_claims
set claimed_at = claimed_at - interval '2 minutes';
set local role service_role;
select is(
  api.worker_claim_remotive_fetch(
    'fb000000-0000-4000-8000-000000000005', 'test_contract'
  ),
  false,
  'fifth request inside 24 hours is denied'
);

reset role;
select is(
  (select count(*)::integer from private.source_fetch_claims),
  4,
  'denied and duplicate requests do not create claims'
);

select * from finish();
rollback;
