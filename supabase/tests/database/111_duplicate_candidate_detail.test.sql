begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(11);

select ok(
  to_regprocedure('api.admin_get_duplicate_candidate(uuid)') is not null,
  'the protected duplicate detail function exists'
);
select ok(
  has_function_privilege('authenticated', 'api.admin_get_duplicate_candidate(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_get_duplicate_candidate(uuid)', 'EXECUTE'),
  'only authenticated callers can invoke duplicate detail'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('ab000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member-detail@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ab000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'quality-detail@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into private.user_roles (user_id, role, granted_by, reason)
values (
  'ab000000-0000-4000-8000-000000000002', 'data_quality', null,
  'duplicate detail contract test'
);

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  'ab000000-0000-4000-8000-000000000010', 'duplicate-detail-co',
  'Duplicate Detail Co', 'https://detail.example.test',
  'detail.example.test', 'published'
);

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, attribution_text, allow_public_listing, terms_reviewed_at,
  terms_version, authorization_basis, authorization_evidence_ref,
  authorization_reviewed_at, policy_state, authority, allowed_fields,
  policy_review_due_at, raw_retention
)
values (
  'ab000000-0000-4000-8000-000000000011', 'duplicate_detail_source',
  'Duplicate Detail Source', 'manual', 'active',
  'https://detail.example.test/terms', true, 'Duplicate Detail Source', true,
  now(), 'duplicate-detail-v1', 'first_party', 'test-fixture:duplicate-detail',
  now(), 'enabled', 'direct_employer',
  array['title', 'description', 'application_url', 'source_url'],
  now() + interval '30 days', interval '30 days'
);

insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, work_arrangement, employment_type, engagement_type,
  experience_level, salary_min, salary_max, currency_code, pay_period,
  application_url, source_url, content_sanitized_at, posted_at, valid_through,
  dedup_fingerprint, last_verified_at
)
values
  (
    'ab000000-0000-4000-8000-000000000020',
    'ab000000-0000-4000-8000-000000000010',
    'ab000000-0000-4000-8000-000000000011', 'detail-left',
    'duplicate-detail-left', 'draft', 'Senior Platform Engineer',
    'First complete source description retained for a human comparison.',
    'remote', 'full_time', 'employee', 'senior', 100000, 150000, 'NGN', 'monthly',
    'https://detail.example.test/apply/left',
    'https://detail.example.test/jobs/left', now(), now(), now() + interval '30 days',
    repeat('c', 64), now()
  ),
  (
    'ab000000-0000-4000-8000-000000000021',
    'ab000000-0000-4000-8000-000000000010',
    'ab000000-0000-4000-8000-000000000011', 'detail-right',
    'duplicate-detail-right', 'draft', 'Senior Platform Engineer II',
    'Second complete source description retained for a human comparison.',
    'hybrid', 'full_time', 'contractor', 'senior', null, null, null, null,
    'https://detail.example.test/apply/right',
    'https://detail.example.test/jobs/right', now(), now(), now() + interval '30 days',
    repeat('d', 64), now()
  );

insert into app.job_locations (job_id, country_code, city, is_primary)
values
  ('ab000000-0000-4000-8000-000000000020', 'NG', 'Lagos', true),
  ('ab000000-0000-4000-8000-000000000021', 'KE', 'Nairobi', true);

insert into app.job_eligibility (
  job_id, scope, evidence_text, provenance, confidence, last_verified_at
)
values
  ('ab000000-0000-4000-8000-000000000020', 'nigeria',
   'Open to applicants in Nigeria.', 'source_provided', 1, now()),
  ('ab000000-0000-4000-8000-000000000021', 'named_countries',
   'Open to applicants in Kenya.', 'source_provided', 1, now());

insert into audit.job_duplicate_candidates (
  id, left_job_id, right_job_id, title_similarity, evidence
)
values (
  'ab000000-0000-4000-8000-000000000030',
  'ab000000-0000-4000-8000-000000000020',
  'ab000000-0000-4000-8000-000000000021', 0.975,
  '{"reason":"same employer and similar title","left_application_host":"detail.example.test","right_application_host":"detail.example.test"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ab000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_get_duplicate_candidate('ab000000-0000-4000-8000-000000000030') $$,
  '42501', null, 'an ordinary AAL2 member cannot read duplicate detail'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ab000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_get_duplicate_candidate('ab000000-0000-4000-8000-000000000030') $$,
  '42501', null, 'a data-quality operator must complete AAL2 before reading detail'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ab000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  1, 'an AAL2 data-quality operator receives exactly one comparison'
);
select is(
  (select first_description from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  'First complete source description retained for a human comparison.',
  'the first full source description is available for comparison'
);
select is(
  (select second_work_arrangement from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  'hybrid', 'field differences remain visible rather than normalized away'
);
select is(
  (select first_locations from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  'Lagos, NG', 'location evidence is attached to the correct side'
);
select is(
  (select second_eligibility_evidence from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  'Open to applicants in Kenya.', 'eligibility evidence is attached to the correct side'
);
select is(
  (select first_source_authority from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000030')),
  'direct_employer', 'source authority is explicit for operator judgment'
);
select is(
  (select count(*)::integer from api.admin_get_duplicate_candidate(
    'ab000000-0000-4000-8000-000000000099')),
  0, 'a missing candidate returns no invented comparison'
);

select * from finish();
rollback;
