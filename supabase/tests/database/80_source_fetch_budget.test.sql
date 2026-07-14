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

-- This transaction proves the budget mechanism under a hypothetical reviewed
-- permission. Production remains disabled by the migration after rollback.
update private.job_source_dependencies
set state = 'verified', evidence_reference = 'test:written-confirmation',
    reviewed_at = clock_timestamp()
where source_id = (
  select id from app.job_sources where adapter_key = 'remotive'
)
  and dependency_key = 'written_republication_confirmation';
update app.job_sources
set policy_state = 'enabled', allow_public_listing = true,
    policy_review_due_at = clock_timestamp() + interval '1 day',
    minimum_poll_interval = interval '15 minutes',
    maximum_requests_per_day = 4
where adapter_key = 'remotive';

insert into app.source_country_rights (
  source_id, country_code, policy_state, permission_basis,
  evidence_reference, terms_url, reviewed_at, review_due_at,
  allowed_fields, may_store_full_description, attribution_required,
  attribution_text, minimum_poll_interval, retention_period,
  allow_public_display, allow_search_index, allow_google_jobposting
)
select source.id, 'NG', 'enabled', source.authorization_basis,
  source.authorization_evidence_ref, source.terms_url,
  source.authorization_reviewed_at, source.policy_review_due_at,
  source.allowed_fields, source.may_store_full_description,
  source.attribution_required, source.attribution_text,
  source.minimum_poll_interval, source.raw_retention,
  true, false, false
from app.job_sources source where source.adapter_key = 'remotive'
on conflict (source_id, country_code) do update
set policy_state = excluded.policy_state,
    permission_basis = excluded.permission_basis,
    evidence_reference = excluded.evidence_reference,
    terms_url = excluded.terms_url,
    reviewed_at = excluded.reviewed_at,
    review_due_at = excluded.review_due_at,
    allowed_fields = excluded.allowed_fields,
    minimum_poll_interval = excluded.minimum_poll_interval,
    retention_period = excluded.retention_period,
    allow_public_display = excluded.allow_public_display;

-- Changing publication rights invalidates the prior review. Restore the
-- hypothetical reviewed authorization only after the new policy and country
-- rights have been persisted, then activate the source as a final step.
update app.job_sources
set terms_reviewed_at = clock_timestamp(),
    authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null,
    status = 'active'
where adapter_key = 'remotive';

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
update app.job_sources
set status = 'active', policy_state = 'enabled', allow_public_listing = true,
    policy_review_due_at = clock_timestamp() + interval '1 day'
where adapter_key = 'remotive';
update private.source_fetch_claims
set claimed_at = claimed_at - interval '16 minutes';
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
set claimed_at = claimed_at - interval '16 minutes';
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
set claimed_at = claimed_at - interval '16 minutes';
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
set claimed_at = claimed_at - interval '16 minutes';
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
