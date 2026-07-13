begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(16);

select ok(
  to_regclass('private.salary_submissions_market_cell') is not null,
  'company-agnostic salary submissions have a dedicated partial index'
);
select ok(
  position(
    '(role_family_id, country_code)'
    in pg_get_indexdef('private.salary_submissions_market_cell'::regclass)
  ) > 0
  and (
    select pg_get_expr(i.indpred, i.indrelid)
    from pg_index i
    where i.indexrelid = 'private.salary_submissions_market_cell'::regclass
  ) = '(company_id IS NULL)',
  'salary market index leads with role family and country and excludes company rows'
);
select ok(
  to_regclass('app.jobs_public_active_listing_order') is not null,
  'public active jobs have a dedicated partial listing index'
);
select ok(
  position(
    '(posted_at DESC, id)'
    in pg_get_indexdef('app.jobs_public_active_listing_order'::regclass)
  ) > 0,
  'public jobs index follows the posted_at listing order'
);
select ok(
  (
    select pg_get_expr(i.indpred, i.indrelid)
    from pg_index i
    where i.indexrelid = 'app.jobs_public_active_listing_order'::regclass
  ) like '%status%published%'
  and (
    select pg_get_expr(i.indpred, i.indrelid)
    from pg_index i
    where i.indexrelid = 'app.jobs_public_active_listing_order'::regclass
  ) like '%NOT is_fixture%',
  'public jobs index is limited to published non-fixture rows'
);
select ok(
  position(
    'INCLUDE (valid_through, company_id, source_id)'
    in pg_get_indexdef('app.jobs_public_active_listing_order'::regclass)
  ) > 0,
  'public jobs index carries the request-time validity and join columns'
);
select ok(
  (select p.prosecdef
   from pg_proc p
   where p.oid = 'security.submit_employer_job(jsonb)'::regprocedure)
  and (
    select coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    where p.oid = 'security.submit_employer_job(jsonb)'::regprocedure
  ) like '%search_path=%',
  'employer submission derivation remains a fixed-search-path security definer'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.submit_employer_job(jsonb,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'api.submit_employer_job(jsonb,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'api.submit_employer_job(jsonb,boolean)',
    'EXECUTE'
  ),
  'the compatibility RPC remains authenticated-only'
);
select ok(
  position(
    'v_domain_matches'
    in pg_get_functiondef('security.submit_employer_job(jsonb)'::regprocedure)
  ) > 0
  and position(
    'p_payload ->> ''corporate_domain_matches'''
    in pg_get_functiondef('security.submit_employer_job(jsonb)'::regprocedure)
  ) = 0,
  'the privileged function derives the flag without reading caller input'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  'da000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'domain-test@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
) on conflict (id) do nothing;

update private.profiles
set account_status = 'active'
where user_id = 'da000000-0000-0000-0000-000000000001';

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
) values (
  'da100000-0000-0000-0000-000000000001',
  'existing-example',
  'Existing Example',
  'https://example.test',
  'example.test',
  'published'
) on conflict (id) do nothing;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'da000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'aal', 'aal1',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select api.submit_employer_job(
    jsonb_build_object(
      'company_name', 'Mismatch Example',
      'corporate_email', 'jobs@unrelated.test',
      'company_website', 'https://example.test',
      'title', 'Mismatched Domain Engineer',
      'description', repeat('A', 120),
      'requirements', repeat('B', 40),
      'location', 'Lagos, Nigeria',
      'work_mode', 'hybrid',
      'employment_type', 'full_time',
      'arrangement', 'employee',
      'experience_level', 'mid',
      'eligibility_scope', 'nigeria',
      'eligibility_evidence', 'Applicants in Nigeria are explicitly eligible.',
      'visa_sponsorship', 'no',
      'pay_period', 'unknown',
      'gross_net', 'unknown',
      'application_url', 'https://example.test/apply/mismatch',
      'authorization_attestation', 'on',
      'corporate_domain_matches', true
    ),
    true
  ) $$,
  'a mismatched-domain submission is accepted for moderation'
);

reset role;
select is(
  (select corporate_domain_matches
   from private.employer_job_submissions
   where title = 'Mismatched Domain Engineer'),
  false,
  'a caller claim of true is stored as false when domains mismatch'
);

set local role authenticated;
select lives_ok(
  $$ select api.submit_employer_job(
    jsonb_build_object(
      'company_name', 'Matching Example',
      'corporate_email', 'jobs@careers.example.test',
      'company_website', 'https://www.example.test/careers',
      'title', 'Matching Domain Engineer',
      'description', repeat('C', 120),
      'requirements', repeat('D', 40),
      'location', 'Abuja, Nigeria',
      'work_mode', 'remote',
      'employment_type', 'full_time',
      'arrangement', 'employee',
      'experience_level', 'senior',
      'eligibility_scope', 'nigeria',
      'eligibility_evidence', 'Applicants in Nigeria are explicitly eligible.',
      'visa_sponsorship', 'no',
      'pay_period', 'unknown',
      'gross_net', 'unknown',
      'application_url', 'https://example.test/apply/match',
      'authorization_attestation', 'on',
      'corporate_domain_matches', false
    ),
    false
  ) $$,
  'a matching corporate subdomain submission is accepted for moderation'
);

reset role;
select is(
  (select corporate_domain_matches
   from private.employer_job_submissions
   where title = 'Matching Domain Engineer'),
  true,
  'a legitimate domain match is derived as true despite a false caller value'
);
select is(
  (select company_id
   from private.employer_job_submissions
   where title = 'Matching Domain Engineer'),
  (select id
   from app.companies
   where website_domain = 'example.test'),
  'a matching domain reuses the existing published company during moderation'
);

set local role authenticated;
select lives_ok(
  $$ select api.submit_employer_job(
    jsonb_build_object(
      'company_name', 'Free Mail Example',
      'corporate_email', 'jobs@gmail.com',
      'company_website', 'https://gmail.com',
      'title', 'Free Mail Domain Engineer',
      'description', repeat('E', 120),
      'requirements', repeat('F', 40),
      'location', 'Remote',
      'work_mode', 'remote',
      'employment_type', 'contract',
      'arrangement', 'contractor',
      'experience_level', 'mid',
      'eligibility_scope', 'nigeria',
      'eligibility_evidence', 'Applicants in Nigeria are explicitly eligible.',
      'visa_sponsorship', 'no',
      'pay_period', 'unknown',
      'gross_net', 'unknown',
      'application_url', 'https://gmail.com/apply/free-mail',
      'authorization_attestation', 'on',
      'corporate_domain_matches', true
    ),
    true
  ) $$,
  'a free-provider submission remains reviewable'
);

reset role;
select is(
  (select corporate_domain_matches
   from private.employer_job_submissions
   where title = 'Free Mail Domain Engineer'),
  false,
  'a free email provider never becomes corporate-domain evidence'
);

select * from finish();
rollback;
