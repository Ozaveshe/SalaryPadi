begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(15);

select ok(
  to_regprocedure('api.transition_job_duplicate_candidate(uuid,integer,text,text)') is not null,
  'the reviewed duplicate transition exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api.transition_job_duplicate_candidate(uuid,integer,text,text)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'api.transition_job_duplicate_candidate(uuid,integer,text,text)', 'EXECUTE'
  ),
  'only authenticated callers can invoke the transition'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member-duplicate@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('aa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'quality-duplicate@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into private.user_roles (user_id, role, granted_by, reason)
values (
  'aa000000-0000-4000-8000-000000000002', 'data_quality', null,
  'duplicate resolution contract test'
)
on conflict (user_id, role) where revoked_at is null do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  'aa000000-0000-4000-8000-000000000010', 'duplicate-test-co',
  'Duplicate Test Co', 'https://duplicate.example.test',
  'duplicate.example.test', 'published'
)
on conflict (id) do nothing;

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, attribution_text, allow_public_listing, terms_reviewed_at,
  terms_version, authorization_basis, authorization_evidence_ref,
  authorization_reviewed_at, policy_state, authority, allowed_fields,
  policy_review_due_at, raw_retention
)
values (
  'aa000000-0000-4000-8000-000000000011', 'duplicate_contract_source',
  'Duplicate Contract Source', 'manual', 'active',
  'https://duplicate.example.test/terms', true, 'Duplicate Contract Source', true,
  now(), 'duplicate-contract-v1', 'first_party',
  'test-fixture:duplicate-resolution', now(), 'enabled', 'direct_employer',
  array['title', 'description', 'application_url', 'source_url'],
  now() + interval '30 days', interval '30 days'
)
on conflict (id) do nothing;

insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, employment_type, application_url, source_url,
  content_sanitized_at, posted_at, valid_through, dedup_fingerprint
)
values
  (
    'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000010',
    'aa000000-0000-4000-8000-000000000011', 'duplicate-left',
    'duplicate-left', 'published', 'Senior Platform Engineer',
    'First independently retained source record for duplicate testing.',
    'full_time', 'https://duplicate.example.test/apply/left',
    'https://duplicate.example.test/jobs/left', now(), now(),
    now() + interval '30 days', repeat('a', 64)
  ),
  (
    'aa000000-0000-4000-8000-000000000021',
    'aa000000-0000-4000-8000-000000000010',
    'aa000000-0000-4000-8000-000000000011', 'duplicate-right',
    'duplicate-right', 'published', 'Senior Platform Engineer',
    'Second independently retained source record for duplicate testing.',
    'full_time', 'https://duplicate.example.test/apply/right',
    'https://duplicate.example.test/jobs/right', now(), now(),
    now() + interval '30 days', repeat('b', 64)
  );

insert into audit.job_duplicate_candidates (
  id, left_job_id, right_job_id, title_similarity, evidence
)
values (
  'aa000000-0000-4000-8000-000000000030',
  'aa000000-0000-4000-8000-000000000020',
  'aa000000-0000-4000-8000-000000000021', 1,
  '{"left_application_host":"duplicate.example.test","right_application_host":"duplicate.example.test"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.transition_job_duplicate_candidate(
    'aa000000-0000-4000-8000-000000000030', 1, 'keep_first', 'Same vacancy'
  ) $$,
  '42501', null,
  'an ordinary AAL2 member cannot resolve duplicate jobs'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_list_duplicates() $$,
  '42501', null,
  'a data-quality operator must complete AAL2 before reading the queue'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'aa000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select is(
  (select title from api.admin_list_duplicates()
   where id = 'aa000000-0000-4000-8000-000000000030'),
  'First: Senior Platform Engineer',
  'the queue clearly labels the first canonical choice'
);
select ok(
  (select secondary from api.admin_list_duplicates()
   where id = 'aa000000-0000-4000-8000-000000000030')
    like 'Second: Senior Platform Engineer%',
  'the queue clearly labels the second canonical choice'
);
select is(
  api.transition_job_duplicate_candidate(
    'aa000000-0000-4000-8000-000000000030', 1, 'keep_first',
    'Both destinations advertise the same employer vacancy'
  ),
  true,
  'an AAL2 data-quality operator can confirm the first canonical job'
);
reset role;
select is(
  (select canonical_job_id from app.jobs
   where id = 'aa000000-0000-4000-8000-000000000021'),
  'aa000000-0000-4000-8000-000000000020'::uuid,
  'the duplicate source job links to the selected canonical job'
);
select is(
  (select status from audit.job_duplicate_candidates
   where id = 'aa000000-0000-4000-8000-000000000030'),
  'confirmed',
  'the candidate records a confirmed decision'
);
select is(
  (select version from audit.job_duplicate_candidates
   where id = 'aa000000-0000-4000-8000-000000000030'),
  2,
  'the decision advances the optimistic version'
);
select is(
  (select canonical_job_id from audit.job_duplicate_candidates
   where id = 'aa000000-0000-4000-8000-000000000030'),
  'aa000000-0000-4000-8000-000000000020'::uuid,
  'the decision retains its canonical target'
);
select is(
  (select event_type from audit.canonical_job_events
   where event_key = 'reviewed_fuzzy_linked:aa000000-0000-4000-8000-000000000030'),
  'reviewed_fuzzy_linked',
  'canonical history distinguishes a reviewed fuzzy link'
);
select is(
  (select count(*)::integer from audit.event_log
   where target_type = 'job_duplicate_candidate'
     and target_id = 'aa000000-0000-4000-8000-000000000030'
     and action = 'admin.duplicates.keep_first'),
  1,
  'the staff decision has an immutable audit event'
);
set local role authenticated;
select throws_ok(
  $$ select api.transition_job_duplicate_candidate(
    'aa000000-0000-4000-8000-000000000030', 1, 'dismiss', 'Changed my mind'
  ) $$,
  'P0001', null,
  'a stale operator cannot overwrite the decision'
);
reset role;
select is(
  (select status from audit.job_duplicate_candidates
   where id = 'aa000000-0000-4000-8000-000000000030'),
  'confirmed',
  'a rejected stale transition leaves the decision unchanged'
);

select * from finish();
rollback;
