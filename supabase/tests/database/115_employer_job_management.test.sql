begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(8);
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('b5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@employer.example', '{}'::jsonb, '{}'::jsonb, now(), now()),
('b5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'other@employer.example', '{}'::jsonb, '{}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into app.companies (id, slug, display_name, verification_status, record_status) values
('b5000000-0000-4000-8000-000000000030', 'employer-close-test', 'Employer Close Test', 'unverified', 'published')
on conflict (id) do nothing;
insert into private.employer_job_submissions (
  id, submitted_by, company_name, corporate_email, company_website, title,
  work_arrangement, employment_type, engagement_type, experience_level,
  eligibility_scope, eligibility_evidence, description_text, requirements_text,
  application_url, authorization_attested, status, submission_kind
) values (
  'b5000000-0000-4000-8000-000000000010', 'b5000000-0000-4000-8000-000000000001',
  'Employer Close Test', 'owner@employer.example', 'https://employer.example',
  'Closing Test Engineer', 'remote', 'full_time', 'employee', 'mid', 'nigeria',
  'Open to Nigeria.', repeat('Description ', 10), 'Relevant experience required.',
  'https://employer.example/apply', true, 'approved', 'employer'
);
insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, work_arrangement, employment_type, engagement_type,
  application_url, source_url, dedup_fingerprint
) select 'b5000000-0000-4000-8000-000000000020',
  'b5000000-0000-4000-8000-000000000030', source.id,
  'b5000000-0000-4000-8000-000000000010', 'closing-test-engineer', 'published',
  'Closing Test Engineer', repeat('Description ', 10), 'remote', 'full_time',
  'employee', 'https://employer.example/apply', 'https://employer.example/apply', repeat('b', 64)
from app.job_sources source where source.adapter_key = 'salarypadi_employer_submissions';
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b5000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text, true);
set local role authenticated;
select is((select count(*) from api.my_employer_job_submissions), 0::bigint, 'another account cannot see the owner submission');
select is(api.close_my_employer_job('b5000000-0000-4000-8000-000000000010', 'The position has been filled.'), false, 'another account cannot close the owner listing');
select set_config('request.jwt.claims', jsonb_build_object('sub', 'b5000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false)::text, true);
select is((select public_job_slug from api.my_employer_job_submissions), 'closing-test-engineer', 'the owner sees the public listing slug');
select throws_ok($$ select api.close_my_employer_job('b5000000-0000-4000-8000-000000000010', 'short') $$, '22023', null, 'a meaningful closure reason is required');
select ok(api.close_my_employer_job('b5000000-0000-4000-8000-000000000010', 'The position has been filled.'), 'the owner can close an approved public listing');
reset role;
select is((select status::text from app.jobs where id = 'b5000000-0000-4000-8000-000000000020'), 'expired', 'closing expires the public job');
select is((select lifecycle_state::text || ':' || lifecycle_reason from app.jobs where id = 'b5000000-0000-4000-8000-000000000020'), 'closed:employer_confirmed_closed', 'closing records the canonical lifecycle reason');
select ok(exists(select 1 from audit.event_log where target_id = 'b5000000-0000-4000-8000-000000000010' and action = 'employer_job.closed'), 'closing writes an audit event');
select * from finish();
rollback;
