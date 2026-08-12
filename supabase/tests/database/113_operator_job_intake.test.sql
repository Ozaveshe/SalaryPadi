begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(28);

select ok(to_regprocedure('api.admin_submit_job_intake(jsonb)') is not null,
  'operator intake mutation exists');
select ok(to_regprocedure('api.admin_list_job_intake(integer)') is not null,
  'operator intake queue exists');
select ok(to_regprocedure('api.admin_get_job_intake_detail(uuid)') is not null,
  'operator intake detail exists');
select ok(
  has_function_privilege('authenticated', 'api.admin_submit_job_intake(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_submit_job_intake(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.admin_list_job_intake(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.admin_get_job_intake_detail(uuid)', 'EXECUTE'),
  'intake contracts are granted only to authenticated callers'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('ad000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'member-intake@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'quality-intake@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'admin-intake@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into private.user_roles (user_id, role, granted_by, reason)
values
  ('ad000000-0000-4000-8000-000000000002', 'data_quality', null, 'intake contract test'),
  ('ad000000-0000-4000-8000-000000000003', 'admin', null, 'intake contract test');

create temp table test_job_intake_ids (id uuid not null);
grant select, insert on test_job_intake_ids to authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ad000000-0000-4000-8000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_submit_job_intake('{}'::jsonb) $$,
  '42501', null, 'ordinary AAL2 members cannot create operator intake'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ad000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_list_job_intake(50) $$,
  '42501', null, 'data-quality intake requires AAL2'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ad000000-0000-4000-8000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.admin_submit_job_intake('{"source_url":"http://unsafe.test"}'::jsonb) $$,
  '22023', null, 'invalid or non-HTTPS intake is rejected'
);

insert into test_job_intake_ids (id)
select api.admin_submit_job_intake(jsonb_build_object(
  'company_name', 'Operator Evidence Company',
  'company_website', 'https://operator-evidence.example.test',
  'title', 'Operator Evidence Engineer',
  'country_code', 'NG', 'location', 'Lagos, Nigeria',
  'work_mode', 'remote', 'employment_type', 'full_time',
  'arrangement', 'employee', 'experience_level', 'senior',
  'eligibility_scope', 'nigeria',
  'eligibility_evidence', 'The source explicitly accepts applicants in Nigeria.',
  'included_countries', 'Nigeria', 'excluded_countries', '',
  'timezone_overlap', '', 'work_authorization', '',
  'visa_sponsorship', 'unclear',
  'salary_minimum', '900000', 'salary_maximum', '1200000',
  'currency', 'NGN', 'pay_period', 'monthly', 'gross_net', 'gross',
  'description', repeat('A', 120),
  'requirements', 'Relevant production engineering experience.',
  'benefits', '',
  'application_url', 'https://operator-evidence.example.test/jobs/engineer/apply',
  'deadline', '2026-09-01',
  'source_url', 'https://operator-evidence.example.test/jobs/engineer',
  'source_evidence', 'Employer page states the role, location, salary and eligibility.',
  'authorization_evidence', 'Written employer permission retained in the operations case.',
  'authorization_attestation', 'on',
  'intake_reason', 'Direct employer role relevant to Nigerian candidates.'
));

select is((select count(*)::integer from api.admin_list_job_intake(50)), 1,
  'data-quality staff can see the created intake case');
select is(
  (select source_url from api.admin_list_job_intake(50)),
  'https://operator-evidence.example.test/jobs/engineer',
  'queue retains the original source URL'
);
select is(
  (select submission_data ->> 'source_evidence'
   from api.admin_get_job_intake_detail((select id from test_job_intake_ids))),
  'Employer page states the role, location, salary and eligibility.',
  'detail retains the operator source statement'
);
select is(
  (select submission_data ->> 'authorization_evidence'
   from api.admin_get_job_intake_detail((select id from test_job_intake_ids))),
  'Written employer permission retained in the operations case.',
  'detail retains publication authorization evidence'
);
select is(
  (select submission_data ->> 'eligibility_evidence'
   from api.admin_get_job_intake_detail((select id from test_job_intake_ids))),
  'The source explicitly accepts applicants in Nigeria.',
  'detail retains eligibility evidence'
);
select ok(
  (select (moderation_data ->> 'case_id')::uuid is not null
   from api.admin_get_job_intake_detail((select id from test_job_intake_ids))),
  'intake automatically enters the moderation queue'
);

reset role;
select ok(
  security.job_source_policy_is_runnable((
    select id from app.job_sources
    where adapter_key = 'salarypadi_employer_submissions'
  )),
  'reviewed first-party submission policy is current and runnable'
);
select ok(
  exists (
    select 1
    from app.source_country_rights rights
    join app.job_sources source on source.id = rights.source_id
    where source.adapter_key = 'salarypadi_employer_submissions'
      and rights.country_code = 'NG'
      and rights.policy_state = 'enabled'
      and rights.allow_public_display
      and rights.review_due_at > statement_timestamp()
      and rights.revoked_at is null
  ),
  'Nigeria publication rights are current for the first-party intake lane'
);
select is(
  (select submission_kind from private.employer_job_submissions
   where id = (select id from test_job_intake_ids)),
  'operator', 'submission is explicitly classified as operator intake'
);
select is(
  (select status::text from private.employer_job_submissions
   where id = (select id from test_job_intake_ids)),
  'pending', 'intake starts pending rather than public'
);
select is(
  (select count(*)::integer from app.jobs
   where external_source_id = (select id::text from test_job_intake_ids)),
  0, 'intake does not create a public job before moderation'
);
select is(
  (select count(*)::integer from audit.event_log
   where target_id = (select id from test_job_intake_ids)
     and action = 'job_intake.created'),
  1, 'intake creation is audited'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'ad000000-0000-4000-8000-000000000003',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text,
  true
);
set local role authenticated;
select ok(
  api.admin_transition(
    'moderation', 'approve',
    (select id from private.moderation_cases
     where employer_submission_id = (select id from test_job_intake_ids)),
    'Source and eligibility evidence reviewed.',
    (select version from private.moderation_cases
     where employer_submission_id = (select id from test_job_intake_ids))
  ),
  'AAL2 admin can approve the retained intake through normal moderation'
);

reset role;
select is(
  (select status::text from private.employer_job_submissions
   where id = (select id from test_job_intake_ids)),
  'approved', 'approved intake records its final submission state'
);
select is(
  (select count(*)::integer from app.jobs
   where external_source_id = (select id::text from test_job_intake_ids)),
  1, 'approval creates exactly one normalized job'
);
select is(
  (select source_url from app.jobs
   where external_source_id = (select id::text from test_job_intake_ids)),
  'https://operator-evidence.example.test/jobs/engineer',
  'published job retains the original evidence URL'
);
select is(
  (select eligibility.provenance::text
   from app.job_eligibility eligibility
   join app.jobs job on job.id = eligibility.job_id
   where job.external_source_id = (select id::text from test_job_intake_ids)),
  'source_provided', 'submitted eligibility is not mislabeled manually verified'
);
select ok(
  (select eligibility.verified_by is null
   from app.job_eligibility eligibility
   join app.jobs job on job.id = eligibility.job_id
   where job.external_source_id = (select id::text from test_job_intake_ids)),
  'source-provided eligibility does not invent an independent verifier'
);
select ok(
  (select evidence.source_text::jsonb ->> 'evidence_ref' =
      'https://operator-evidence.example.test/jobs/engineer'
   from app.job_salary_evidence evidence
   join app.jobs job on job.id = evidence.job_id
   where job.external_source_id = (select id::text from test_job_intake_ids)
     and evidence.occurrence_id is null),
  'salary evidence cites the retained source instead of only repeating numbers'
);
select is(
  (select count(*)::integer from api.admin_get_job_intake_detail(
    'ad000000-0000-4000-8000-000000000099')),
  0, 'missing intake returns no invented detail'
);
select throws_ok(
  $$ select * from api.admin_list_job_intake(101) $$,
  '22023', null, 'intake queue capacity is bounded'
);

select * from finish();
rollback;
