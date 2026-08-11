begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(19);

select ok(
  to_regprocedure('api.admin_search_jobs(text,text,integer)') is not null,
  'the protected job search function exists'
);
select ok(
  to_regprocedure('api.admin_get_job_detail(uuid)') is not null,
  'the protected job detail function exists'
);
select ok(
  has_function_privilege('authenticated', 'api.admin_search_jobs(text,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_search_jobs(text,text,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.admin_get_job_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_get_job_detail(uuid)', 'EXECUTE'),
  'only authenticated callers receive execute grants'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('ac000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member-job-search@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ac000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'quality-job-search@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ac000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'admin-job-search@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into private.user_roles (user_id, role, granted_by, reason)
values
  ('ac000000-0000-4000-8000-000000000002', 'data_quality', null,
   'job search contract test'),
  ('ac000000-0000-4000-8000-000000000003', 'admin', null,
   'job search contract test');

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  'ac000000-0000-4000-8000-000000000010', 'searchable-evidence-co',
  'Searchable Evidence Company', 'https://searchable.example.test',
  'searchable.example.test', 'published'
);

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, attribution_text, allow_public_listing, terms_reviewed_at,
  terms_version, authorization_basis, authorization_evidence_ref,
  authorization_reviewed_at, policy_state, authority, allowed_fields,
  policy_review_due_at, raw_retention, may_index_jobs,
  may_emit_jobposting_schema, may_email_jobs
)
values (
  'ac000000-0000-4000-8000-000000000011', 'searchable_evidence_source',
  'Searchable Evidence Source', 'manual', 'active',
  'https://searchable.example.test/terms', true, 'Searchable Evidence Source', true,
  now(), 'searchable-v1', 'first_party', 'test-fixture:job-search', now(),
  'enabled', 'direct_employer',
  array['title', 'description', 'application_url', 'source_url', 'eligibility'],
  now() + interval '30 days', interval '30 days', true, true, true
);

insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, work_arrangement, employment_type, engagement_type,
  experience_level, salary_min, salary_max, currency_code, pay_period,
  application_url, source_url, posted_at, valid_through, dedup_fingerprint
)
values
  (
    'ac000000-0000-4000-8000-000000000020',
    'ac000000-0000-4000-8000-000000000010',
    'ac000000-0000-4000-8000-000000000011', 'external-platform-20',
    'searchable-platform-engineer', 'pending', 'Searchable Platform Engineer',
    'A complete retained description for the protected job detail contract.',
    'remote', 'full_time', 'employee', 'senior', 100000, 150000, 'NGN', 'monthly',
    'https://searchable.example.test/apply/20',
    'https://searchable.example.test/jobs/20', now(), now() + interval '30 days',
    repeat('e', 64)
  ),
  (
    'ac000000-0000-4000-8000-000000000021',
    'ac000000-0000-4000-8000-000000000010',
    'ac000000-0000-4000-8000-000000000011', 'external-analyst-21',
    'searchable-data-analyst', 'draft', 'Searchable Data Analyst',
    'A second retained description used to prove status filtering and duplicates.',
    'hybrid', 'full_time', 'contractor', 'mid', null, null, null, null,
    'https://searchable.example.test/apply/21',
    'https://searchable.example.test/jobs/21', now(), now() + interval '30 days',
    repeat('f', 64)
  );

insert into app.job_locations (
  job_id, country_code, city, region, is_primary, source_location_text
)
values (
  'ac000000-0000-4000-8000-000000000020', 'NG', 'Lagos', 'Lagos', true,
  'Lagos, Nigeria'
);

insert into app.job_eligibility (
  job_id, scope, visa_sponsorship, evidence_text, provenance,
  confidence, last_verified_at, arrangement_evidence
)
values (
  'ac000000-0000-4000-8000-000000000020', 'nigeria', false,
  'Open to applicants in Nigeria.', 'source_provided', 1, now(),
  'Source describes the role as remote.'
);

insert into private.reports (
  reporter_user_id, target_kind, target_id, category, narrative, status
)
values (
  'ac000000-0000-4000-8000-000000000001', 'job',
  'searchable-platform-engineer', 'application_link',
  'The application destination should be checked by an operator.', 'pending'
);

insert into audit.job_duplicate_candidates (
  left_job_id, right_job_id, title_similarity, evidence
)
values (
  'ac000000-0000-4000-8000-000000000020',
  'ac000000-0000-4000-8000-000000000021', 0.9,
  '{"reason":"contract fixture"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ac000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_search_jobs('platform', null, 50) $$,
  '42501', null, 'an ordinary AAL2 member cannot search protected jobs'
);
select throws_ok(
  $$ select * from api.admin_get_job_detail('ac000000-0000-4000-8000-000000000020') $$,
  '42501', null, 'an ordinary AAL2 member cannot read protected job detail'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ac000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select * from api.admin_search_jobs('platform', null, 50) $$,
  '42501', null, 'a data-quality operator must complete AAL2 before searching'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ac000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;

select is(
  (select id from api.admin_search_jobs('external-platform-20', null, 50)),
  'ac000000-0000-4000-8000-000000000020'::uuid,
  'data-quality staff can find an exact external source ID'
);
select is(
  (select count(*)::integer from api.admin_search_jobs('Searchable', null, 50)),
  2, 'title search covers the complete matching fixture set'
);
select is(
  (select count(*)::integer from api.admin_search_jobs('Searchable', 'pending', 50)),
  1, 'status filtering narrows the search without hiding exact matches'
);
select throws_ok(
  $$ select * from api.admin_search_jobs('a', null, 50) $$,
  '22023', null, 'one-character searches are rejected as unbounded noise'
);
select throws_ok(
  $$ select * from api.admin_search_jobs('', null, 101) $$,
  '22023', null, 'callers cannot exceed the reviewed result capacity'
);
select is(
  (select job_data ->> 'title' from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000020')),
  'Searchable Platform Engineer', 'detail returns the requested normalized job'
);
select ok(
  (select publication_blockers ? 'content_not_sanitized'
   from api.admin_get_job_detail('ac000000-0000-4000-8000-000000000020')),
  'detail names a real publication blocker instead of implying readiness'
);
select is(
  (select source_data ->> 'authority' from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000020')),
  'direct_employer', 'detail carries source authority provenance'
);
select is(
  (select eligibility_data ->> 'evidence_text' from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000020')),
  'Open to applicants in Nigeria.', 'detail carries eligibility evidence'
);
select is(
  (select open_report_count::integer from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000020')),
  1, 'detail counts open reports without exposing reporter identity or narrative'
);
select is(
  (select duplicate_candidate_count::integer from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000020')),
  1, 'detail links duplicate-review evidence'
);
select is(
  (select count(*)::integer from api.admin_get_job_detail(
    'ac000000-0000-4000-8000-000000000099')),
  0, 'a missing job returns no invented detail'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ac000000-0000-4000-8000-000000000003',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from api.admin_search_jobs('', 'draft', 50)),
  1, 'AAL2 administrators retain read access alongside mutation authority'
);

select * from finish();
rollback;
