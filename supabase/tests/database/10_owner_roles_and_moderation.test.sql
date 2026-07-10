begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(46);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'c@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'd@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'moderator@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'admin@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

update private.profiles set account_status = 'suspended'
where user_id = 'd0000000-0000-0000-0000-000000000004';

insert into private.user_roles (user_id, role, granted_by, reason)
values
  ('e0000000-0000-0000-0000-000000000005', 'moderator', null, 'test bootstrap'),
  ('f0000000-0000-0000-0000-000000000006', 'admin', null, 'test bootstrap')
on conflict (user_id, role) where revoked_at is null do nothing;

insert into app.role_families (id, slug, name)
values ('10000000-0000-0000-0000-000000000001', 'software-engineering', 'Software Engineering')
on conflict (id) do nothing;

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  '20000000-0000-0000-0000-000000000001', 'example-co', 'Example Co',
  'https://example.test', 'example.test', 'published'
)
on conflict (id) do nothing;

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, allow_public_listing, terms_reviewed_at
)
values (
  '30000000-0000-0000-0000-000000000001', 'test_source', 'Test Source',
  'manual', 'active', 'https://example.test/terms', true, true, now()
)
on conflict (id) do nothing;

insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, employment_type, application_url, source_url,
  content_sanitized_at, posted_at, valid_through
)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'external-1', 'example-engineer', 'published', 'Example Engineer',
  'A sufficiently detailed and sanitized test job description.', 'full_time',
  'https://example.test/apply', 'https://example.test/jobs/1', now(), now(), now() + interval '30 days'
)
on conflict (id) do nothing;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select api.set_job_saved('40000000-0000-0000-0000-000000000001', true) $$,
  'active permanent user can save a public job'
);
select is((select count(*)::integer from api.my_saved_jobs), 1, 'owner sees their saved job');
select ok(
  api.save_external_job(
    'remotive', 'external-123', 'remote-example-engineer', 'Remote Example Engineer',
    'Example Co', 'https://example.test/remote/123', now() - interval '1 day',
    'Worldwide according to the source.'
  ) is not null,
  'current save_external_job route contract stores a private external snapshot'
);
select is(
  (select count(*)::integer from api.get_my_saved_jobs()),
  2,
  'get_my_saved_jobs returns normalized and external saved records'
);
select ok(
  api.record_external_application(
    'remotive', 'external-123', 'remote-example-engineer', 'Remote Example Engineer',
    'Example Co', 'https://example.test/remote/123', 'applied'
  ) is not null,
  'current record_external_application route contract creates a private application'
);
select is(
  (select count(*)::integer from api.get_my_applications()),
  1,
  'get_my_applications returns only the owner application'
);
select ok(
  api.create_job_alert('{"q":"engineer","eligibility":"nigeria"}'::jsonb, 'daily') is not null,
  'current create_job_alert route contract creates a versioned private alert'
);
select is(
  (select count(*)::integer from api.get_my_job_alerts()),
  1,
  'get_my_job_alerts returns only the owner alert'
);
select ok(
  api.report_content('job', 'remote-example-engineer', 'eligibility') is not null,
  'report_content accepts a route slug without exposing reporter identity'
);
select ok(
  api.submit_contribution('salary', jsonb_build_object(
    'role', 'Software Engineer', 'role_family', 'Software Engineering',
    'company', 'Example Co', 'country', 'NG', 'work_mode', 'remote',
    'employment_type', 'full_time', 'arrangement', 'employee',
    'seniority', 'mid', 'years_experience', 4, 'base_salary', 500000,
    'currency', 'NGN', 'pay_period', 'monthly', 'gross_net', 'gross',
    'payment_reliability', 'always_on_time', 'accuracy_attestation', 'on'
  )) is not null,
  'unified contribution RPC accepts the validated salary form payload'
);
select is(
  (select count(*)::integer from api.my_contributions),
  1,
  'contributor sees safe status metadata after unified submission'
);
select ok(
  api.submit_employer_job(jsonb_build_object(
    'company_name', 'Example Co', 'corporate_email', 'jobs@example.test',
    'company_website', 'https://example.test', 'title', 'Platform Engineer',
    'description', repeat('A', 120), 'requirements', repeat('B', 40),
    'location', 'Lagos, Nigeria', 'work_mode', 'hybrid',
    'employment_type', 'full_time', 'arrangement', 'employee',
    'experience_level', 'mid', 'eligibility_scope', 'nigeria',
    'eligibility_evidence', 'The employer explicitly accepts applicants in Nigeria.',
    'visa_sponsorship', 'no', 'pay_period', 'unknown', 'gross_net', 'unknown',
    'application_url', 'https://example.test/apply/platform',
    'authorization_attestation', 'on'
  ), false) is not null,
  'current employer submission route contract creates a pending submission'
);
select is(
  (select count(*)::integer from api.my_employer_job_submissions),
  1,
  'employer sees only their pending submission summary'
);

reset role;
select throws_ok(
  $$ update private.employer_job_submissions
     set salary_max = -1
     where title = 'Platform Engineer' $$,
  '23514', null,
  'employer submission rejects a negative lone salary maximum'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'b0000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is((select count(*)::integer from api.my_saved_jobs), 0, 'another user cannot see the owner saved job');
select ok(
  api.save_external_job(
    'remotive', 'external-123', 'remote-tampered-title', 'Tampered title',
    'Untrusted overwrite', 'https://evil.example.test/jobs/123', now(),
    'User-controlled conflicting evidence.'
  ) is not null,
  'another user can save the same source identifier into an owner-scoped snapshot'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  (select title from api.get_my_saved_jobs() where job_slug = 'remote-example-engineer'),
  'Remote Example Engineer',
  'another account cannot overwrite the owner external-job snapshot'
);
select throws_ok(
  $$ select api.submit_contribution('salary', jsonb_build_object(
    'role', 'Software Engineer', 'role_family', 'Software Engineering',
    'company', 'Example Co', 'country', 'NG', 'work_mode', 'remote',
    'employment_type', 'full_time', 'arrangement', 'employee',
    'seniority', 'mid', 'years_experience', 4, 'base_salary', 500000,
    'currency', 'NGN', 'pay_period', 'monthly', 'gross_net', 'gross'
  )) $$,
  '22023', null,
  'salary contribution requires an explicit accuracy attestation'
);
select throws_ok(
  $$ select api.submit_contribution('review', jsonb_build_object(
    'company', 'Example Co', 'role_family', 'Software Engineering',
    'country', 'NG', 'employment_status', 'former',
    'compensation_rating', 4, 'pay_reliability_rating', 4,
    'management_rating', 4, 'work_life_rating', 4, 'growth_rating', 4
  )) $$,
  '22023', null,
  'review contribution requires an explicit anonymity attestation'
);
select throws_ok(
  $$ select api.submit_contribution('interview', jsonb_build_object(
    'company', 'Example Co', 'role_family', 'Software Engineering',
    'country', 'NG', 'seniority', 'mid', 'stages', '["screen"]'::jsonb,
    'difficulty', 3, 'outcome', 'ongoing'
  )) $$,
  '22023', null,
  'interview contribution requires an explicit confidentiality attestation'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'c0000000-0000-0000-0000-000000000003',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', true
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.set_job_saved('40000000-0000-0000-0000-000000000001', true) $$,
  '42501', null,
  'Supabase anonymous-auth user is denied private mutations'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'd0000000-0000-0000-0000-000000000004',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.set_job_saved('40000000-0000-0000-0000-000000000001', true) $$,
  '42501', null,
  'suspended account is denied despite a valid JWT'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'e0000000-0000-0000-0000-000000000005',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select ok(not security.can_moderate(), 'moderator at AAL1 cannot moderate');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'e0000000-0000-0000-0000-000000000005',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select ok(security.can_moderate(), 'moderator at AAL2 can enter the moderation boundary');
select ok(not security.can_manage_jobs(), 'moderator does not inherit data-quality authority');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false,
    'user_role', 'admin', 'user_metadata', jsonb_build_object('role', 'admin')
  )::text,
  true
);
set local role authenticated;
select ok(not security.has_staff_role('admin'), 'forged JWT metadata does not grant a staff role');

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0000000-0000-0000-0000-000000000006',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select ok(
  api.has_staff_role('admin'),
  'AAL1 administrator membership is visible for MFA routing'
);
select throws_ok(
  $$ select api.set_staff_role(
    'b0000000-0000-0000-0000-000000000002', 'data_quality', true, 'test grant'
  ) $$,
  '42501', null,
  'admin at AAL1 cannot grant roles'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0000000-0000-0000-0000-000000000006',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  $$ select api.request_privacy_action('account_deletion') $$,
  '23514', null,
  'the last active admin cannot self-delete and orphan the control plane'
);
select is(
  api.admin_transition(
    'moderation', 'approve',
    (select mc.id
     from private.moderation_cases mc
     join private.employer_job_submissions es
       on es.id = mc.employer_submission_id
     where es.title = 'Platform Engineer'),
    'Employer vacancy and eligibility evidence reviewed',
    (select mc.version
     from private.moderation_cases mc
     join private.employer_job_submissions es
       on es.id = mc.employer_submission_id
     where es.title = 'Platform Engineer')
  ),
  true,
  'AAL2 admin approval promotes a reviewed employer submission'
);
select is(
  (select j.status::text
   from app.jobs j
   join app.job_sources s on s.id = j.source_id
   where s.adapter_key = 'salarypadi_employer_submissions'),
  'published',
  'approved employer submission creates a public job record'
);
select ok(
  exists (
    select 1
    from app.job_eligibility e
    join app.jobs j on j.id = e.job_id
    join app.job_sources s on s.id = j.source_id
    where s.adapter_key = 'salarypadi_employer_submissions'
      and e.scope = 'nigeria'
      and e.evidence_text like '%explicitly accepts applicants%'
  ),
  'promoted employer job retains eligibility evidence and provenance'
);
select is(
  api.set_staff_role(
    'b0000000-0000-0000-0000-000000000002', 'data_quality', true, 'test grant'
  ),
  true,
  'admin at AAL2 can grant a scoped staff role'
);
select is(
  (select count(*)::integer from api.admin_audit_events(100) where action = 'role.granted'),
  1,
  'role grant writes one audit event in the same transaction'
);
select throws_ok(
  $$ select api.set_staff_role(
    'f0000000-0000-0000-0000-000000000006', 'admin', true, 'self grant'
  ) $$,
  '42501', null,
  'admin cannot change their own role'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'b0000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select ok(security.can_manage_jobs(), 'new data-quality role takes effect from the database');

reset role;
update private.user_roles
set revoked_at = clock_timestamp(), revoked_by = 'f0000000-0000-0000-0000-000000000006'
where user_id = 'b0000000-0000-0000-0000-000000000002'
  and role = 'data_quality' and revoked_at is null;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'b0000000-0000-0000-0000-000000000002',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select ok(not security.can_manage_jobs(), 'role revocation takes effect without refreshing the JWT');

reset role;
insert into private.contributions (
  id, contributor_user_id, kind, state, content_hash, submitted_at
)
values (
  '50000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001', 'review', 'pending',
  repeat('a', 64), now() - interval '2 days'
);
insert into private.company_reviews (
  contribution_id, company_id, company_name_input, role_family_id,
  role_family_name_input, country_code, employment_status,
  compensation_rating, pay_reliability_rating, management_rating,
  work_life_rating, career_growth_rating, overall_rating
)
values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Example Co', '10000000-0000-0000-0000-000000000001',
  'Software Engineering', 'NG', 'former',
  4, 4, 3, 4, 4, 3.8
);
insert into private.moderation_cases (
  id, contribution_id
)
values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'e0000000-0000-0000-0000-000000000005',
    'role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  api.transition_moderation(
    '60000000-0000-0000-0000-000000000001', 1, 'claim', null
  ),
  'in_review',
  'pending contribution can be claimed for review'
);
select throws_ok(
  $$ select api.transition_moderation(
    '60000000-0000-0000-0000-000000000001', 1, 'approve',
    'reviewed', 'stale approval', array['pros'], '{"pros":"Good team"}'::jsonb
  ) $$,
  '40001', null,
  'stale moderation version has no side effects'
);
select is(
  api.transition_moderation(
    '60000000-0000-0000-0000-000000000001', 2, 'approve',
    'reviewed', 'content reviewed', array['pros'],
    '{"pros":"Good team","cons":"Long meetings"}'::jsonb
  ),
  'approved',
  'review approval follows the valid transition'
);
select is(
  (select state::text from private.contributions
   where id = '50000000-0000-0000-0000-000000000001'),
  'approved',
  'approval updates contribution state'
);
select is(
  (select count(*)::integer from private.moderation_actions
   where case_id = '60000000-0000-0000-0000-000000000001'),
  2,
  'each successful moderation transition appends one action'
);
select ok(
  exists (
    select 1 from api.company_reviews
    where id <> '50000000-0000-0000-0000-000000000001'
      and pros = 'Good team' and cons = 'Long meetings'
  ),
  'approval creates a separate redacted public review record'
);
select throws_ok(
  $$ select api.transition_moderation(
    '60000000-0000-0000-0000-000000000001', 3, 'approve',
    'again', 'invalid repeat approval'
  ) $$,
  '23514', null,
  'invalid moderation edge is rejected'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'a0000000-0000-0000-0000-000000000001',
    'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from private.moderation_actions),
  0,
  'contributor cannot read moderation internals'
);

reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon', 'aal', 'aal1', 'is_anonymous', false)::text,
  true
);
set local role anon;
select is((select count(*)::integer from api.company_reviews), 1, 'approved redacted review is publicly readable');

select * from finish();
rollback;
