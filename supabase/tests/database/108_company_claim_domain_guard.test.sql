begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(6);

-- A personal-email claimant and an AAL2 admin reviewer.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'claimant@personalmail.example', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'staff@salarypadi.example', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values ('a8000000-0000-4000-8000-000000000002', 'admin', null, 'test bootstrap')
on conflict (user_id, role) where revoked_at is null do nothing;

insert into app.companies (
  id, slug, display_name, website_url, verification_status, record_status
) values (
  'a8000000-0000-4000-8000-000000000010', 'claim-guard-co', 'Claim Guard Co',
  'https://claim-guard.example', 'unverified', 'published'
)
on conflict (id) do nothing;

-- The claimant submits with a corporate domain their signed-in email does
-- not match (and which is not a registered official domain).
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a8000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select ok(
  api.submit_company_claim(
    'claim-guard-co', 'claim-guard.example', 'employee', 'People Lead', null
  ) is not null,
  'a personal-email claim can be submitted'
);

reset role;
create temporary table claim_fixture as
select id from private.company_claims
where company_id = 'a8000000-0000-4000-8000-000000000010';

select is(
  (select evidence ->> 'account_domain_matches_official_domain'
   from private.company_claims
   where id = (select id from claim_fixture)),
  'false',
  'the submission records that the account domain did not match'
);

-- The AAL2 reviewer sees the mismatch in the queue and cannot verify it
-- without an explicit, recorded override.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a8000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select ok(
  (select secondary from api.admin_list_company_claims()
   where id = (select id from claim_fixture))
  like '%does NOT match%',
  'the claim queue states the domain mismatch in plain language'
);

select throws_ok(
  $$ select api.transition_company_claim(
       (select id from claim_fixture), 1, 'verify', 'looks legitimate to me'
     ) $$,
  '23514',
  null,
  'verify without a domain match requires an explicit override'
);

select ok(
  api.transition_company_claim(
    (select id from claim_fixture), 1, 'verify',
    'override:domain_mismatch — confirmed by call to the registered office'
  ),
  'verify proceeds when the override is stated in the reason'
);

reset role;
select is(
  (select status::text || ':' || coalesce(evidence ->> 'domain_match_override', 'absent')
   from private.company_claims
   where id = (select id from claim_fixture)),
  'verified:true',
  'the override is recorded on the verified claim'
);

select * from finish();
rollback;
