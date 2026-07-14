begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(48);

select has_column(
  'app', 'job_sources', 'authorization_basis',
  'job sources record a constrained authorization basis'
);
select has_column(
  'app', 'job_sources', 'may_email_jobs',
  'job sources record email-distribution permission separately'
);
select has_column(
  'api', 'jobs', 'may_email_jobs',
  'public job records carry the false-by-default alert permission'
);
set local role anon;
select lives_ok(
  $$ select may_email_jobs from api.jobs limit 1 $$,
  'anonymous job reads can resolve the projected email permission'
);
reset role;
select has_table(
  'private', 'ats_source_configs',
  'trusted ATS source configuration table exists'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid =
      'private.ats_source_configs'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'app.job_sources'::regclass
      and pg_get_constraintdef(constraint_record.oid) like
        'FOREIGN KEY (source_id)%'
  ),
  'ATS configuration requires a job source foreign key'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conrelid =
      'private.ats_source_configs'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'app.companies'::regclass
      and pg_get_constraintdef(constraint_record.oid) like
        'FOREIGN KEY (company_id)%'
  ),
  'ATS configuration requires an employer company foreign key'
);
select ok(
  (select class.relrowsecurity and class.relforcerowsecurity
   from pg_class class
   join pg_namespace namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'private'
     and class.relname = 'ats_source_configs'),
  'trusted ATS configuration forces row level security'
);
select ok(
  not has_table_privilege('anon', 'private.ats_source_configs', 'SELECT')
  and not has_table_privilege(
    'authenticated', 'private.ats_source_configs', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'private.ats_source_configs', 'SELECT'
  ),
  'no application role can read the trusted ATS table directly'
);
select ok(
  to_regprocedure('api.worker_list_authorized_ats_sources()') is not null
  and to_regprocedure(
    'api.worker_get_authorized_ats_source(text)'
  ) is not null
  and to_regprocedure(
    'api.worker_claim_ats_source_fetch(text,uuid,text)'
  ) is not null
  and to_regprocedure(
    'api.worker_claim_authorized_ats_source(text,uuid,text)'
  ) is not null,
  'service worker list, get, and fetch-claim RPCs exist'
);
select ok(
  has_function_privilege(
    'service_role', 'api.worker_list_authorized_ats_sources()', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'api.worker_list_authorized_ats_sources()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'api.worker_list_authorized_ats_sources()', 'EXECUTE'
  ),
  'only service role can list authorized ATS sources'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.worker_get_authorized_ats_source(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'api.worker_get_authorized_ats_source(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.worker_get_authorized_ats_source(text)',
    'EXECUTE'
  ),
  'only service role can get an authorized ATS source'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.worker_claim_ats_source_fetch(text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'api.worker_claim_ats_source_fetch(text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.worker_claim_ats_source_fetch(text,uuid,text)',
    'EXECUTE'
  ),
  'only service role can claim ATS provider budget'
);
select ok(
  has_function_privilege(
    'service_role',
    'api.worker_claim_authorized_ats_source(text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'api.worker_claim_authorized_ats_source(text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.worker_claim_authorized_ats_source(text,uuid,text)',
    'EXECUTE'
  ),
  'only service role can atomically claim and receive an ATS policy'
);
select ok(
  not has_column_privilege(
    'anon',
    'app.job_sources',
    'authorization_evidence_ref',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'app.job_sources',
    'authorization_evidence_ref',
    'SELECT'
  )
  and not has_column_privilege(
    'anon',
    'app.job_sources',
    'authorization_grantor',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'app.job_sources',
    'authorization_grantor',
    'SELECT'
  ),
  'authorization evidence and employer grantor are absent from direct public table grants'
);
select ok(
  has_function_privilege(
    'anon', 'security.is_public_job_source(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'security.is_public_job_source(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'security.is_public_job_source(uuid)', 'EXECUTE'
  ),
  'public job policy can check source authorization without exposing evidence columns'
);
select ok(
  (select
     status = 'active'
     and authorization_basis = 'first_party'
     and authorization_evidence_ref is not null
     and authorization_reviewed_at is not null
     and authorization_revoked_at is null
     and not may_email_jobs
   from app.job_sources
   where adapter_key = 'salarypadi_employer_submissions'),
  'employer submissions are seeded as first-party without email permission'
);
select ok(
  (select
     status = 'paused'
     and policy_state = 'disabled'
     and authorization_basis = 'documented_public_api'
     and authorization_evidence_ref is not null
     and authorization_reviewed_at is null
     and authorization_revoked_at is not null
     and not may_email_jobs
   from app.job_sources
   where adapter_key = 'remotive'),
  'Remotive keeps documented API provenance but remains revoked and disabled without republication permission'
);
select is(
  (select count(*)::integer from private.ats_source_configs),
  0,
  'the migration enables no ATS tenant by default'
);
select is(
  (select count(*)::integer
   from app.job_sources
   where status = 'active'
     and adapter_key in ('moniepoint', 'm_kopa', 'mkopa')),
  0,
  'no candidate employer is activated by the migration'
);

select throws_ok(
  $$ insert into private.ats_source_configs (
       source_id, company_id, provider, tenant_identifier,
       allowed_destination_hosts, allowed_destination_path_prefixes
     ) values (
       (select id from app.job_sources
        where adapter_key = 'salarypadi_employer_submissions'),
       gen_random_uuid(), 'greenhouse', 'invalidsource',
       array['jobs.example.test'], array['/jobs']
     ) $$,
  '23514', 'ATS configuration requires an employer ATS source',
  'a trusted ATS config cannot target a non-ATS source'
);

insert into app.companies (
  id, slug, display_name, verification_status, record_status
) values (
  'ac000000-0000-4000-8000-000000000001',
  'ats-authorized-company', 'Authorized Employer',
  'organization_verified', 'published'
);

insert into app.job_sources (
  id, adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, allow_public_listing,
  required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version
) values (
  'ac000000-0000-4000-8000-000000000002',
  'test_authorized_ats', 'Authorized Employer ATS', 'employer_ats',
  'draft', 'https://authorized.example.test/jobs',
  'https://authorized.example.test/terms', true,
  'Source: Authorized Employer', false, false, false, true,
  'employer_application_url', interval '6 hours', now(),
  'authorized-employer-terms-v1'
);

select throws_ok(
  $$ insert into private.ats_source_configs (
       source_id, company_id, provider, tenant_identifier,
       allowed_destination_hosts, allowed_destination_path_prefixes,
       enabled
     ) values (
       'ac000000-0000-4000-8000-000000000002',
       'ac000000-0000-4000-8000-000000000001',
       'greenhouse', 'authorizedtenant',
       array['https://jobs.example.test'], array['/jobs'], true
     ) $$,
  '23514',
  'new row for relation "ats_source_configs" violates check constraint "ats_source_configs_destinations"',
  'ATS destinations reject schemes and accept exact hosts only'
);

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
) values (
  'ac000000-0000-4000-8000-000000000002',
  'ac000000-0000-4000-8000-000000000001',
  'greenhouse', 'authorizedtenant',
  array['jobs.example.test'], array['/jobs'],
  interval '6 hours', 4, interval '5 minutes', 'review', true
);

select throws_ok(
  $$ update private.ats_source_configs
     set provider_region = 'eu'
     where source_id = 'ac000000-0000-4000-8000-000000000002' $$,
  '23514',
  'new row for relation "ats_source_configs" violates check constraint "ats_source_configs_provider_region"',
  'provider regions are accepted only for Lever'
);

select throws_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000002' $$,
  '23514', 'active source requires reviewed authorization evidence',
  'an ATS source cannot activate without reviewed authorization evidence'
);

update app.job_sources
set authorization_basis = 'documented_public_api',
    authorization_evidence_ref = 'evidence:public-api-only',
    authorization_grantor = 'Public API documentation',
    authorization_reviewed_at = now()
where id = 'ac000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000002' $$,
  '23514', 'active ATS source requires employer permission or contract',
  'public API reachability alone cannot authorize third-party ATS fetching'
);
update app.job_sources
set authorization_reviewed_at = null
where id = 'ac000000-0000-4000-8000-000000000002';

insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, allow_public_listing, refresh_interval, terms_version
) values (
  'ac000000-0000-4000-8000-000000000003',
  'test_missing_terms_ats', 'Missing Terms ATS', 'employer_ats',
  'draft', 'https://missing-terms.example.test/terms',
  true, false, interval '6 hours', 'missing-terms-v1'
);
insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, enabled
) values (
  'ac000000-0000-4000-8000-000000000003',
  'ac000000-0000-4000-8000-000000000001',
  'lever', 'missingtermstenant',
  array['jobs.example.test'], array['/jobs'], interval '6 hours', true
);
update app.job_sources
set authorization_basis = 'written_permission',
    authorization_evidence_ref = 'evidence:missing-terms-test',
    authorization_grantor = 'Missing Terms Employer',
    authorization_reviewed_at = now()
where id = 'ac000000-0000-4000-8000-000000000003';

select throws_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000003' $$,
  '23514', 'active source requires a current terms review',
  'authorization evidence cannot replace a terms review'
);

update app.job_sources
set authorization_basis = 'written_permission',
    authorization_evidence_ref = 'vault:salarypadi/ats/authorized-employer/v1',
    authorization_grantor = 'Authorized Employer Legal Team',
    authorization_reviewed_at = now(),
    authorization_expires_at = now() + interval '90 days',
    policy_state = 'enabled',
    authority = 'employer_ats',
    allowed_fields = array[
      'external_id', 'title', 'description', 'source_url',
      'application_url', 'location', 'eligibility', 'work_arrangement',
      'employment_type', 'engagement_type', 'experience_level', 'posted_at',
      'deadline'
    ],
    policy_review_due_at = now() + interval '31 days',
    raw_retention = interval '30 days',
    minimum_poll_interval = interval '2 hours',
    maximum_requests_per_day = 12,
    required_dependencies = array['written_employer_permission'],
    missing_dependencies = '{}'::text[]
where id = 'ac000000-0000-4000-8000-000000000002';

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
) values (
  'ac000000-0000-4000-8000-000000000002',
  'written_employer_permission', 'verified',
  'vault:salarypadi/ats/authorized-employer/v1', now()
);

select lives_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000002' $$,
  'reviewed terms and authorization can activate a configured ATS source'
);

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
  source.allow_public_listing, source.may_index_jobs,
  source.may_emit_jobposting_schema
from app.job_sources source
where source.id = 'ac000000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;

select ok(
  (select
     employer_name = 'Authorized Employer'
     and provider = 'greenhouse'
     and provider_region is null
     and tenant_identifier = 'authorizedtenant'
     and allowed_destination_hosts = array['jobs.example.test']
     and allowed_destination_path_prefixes = array['/jobs']
     and fetch_interval_seconds = 21600
     and daily_request_budget = 4
     and minimum_request_spacing_seconds = 300
     and publication_mode = 'review'
     and authorization_basis = 'written_permission'
     and authorization_evidence_ref =
       'vault:salarypadi/ats/authorized-employer/v1'
     and authorization_grantor = 'Authorized Employer Legal Team'
   from api.worker_get_authorized_ats_source('test_authorized_ats')),
  'worker get returns the exact authorized employer, provider, destination, cadence, budget, publication, and evidence contract'
);
select is(
  (select count(*)::integer
   from api.worker_list_authorized_ats_sources()
   where adapter_key = 'test_authorized_ats'),
  1,
  'worker list returns the authorized configured ATS source once'
);
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000010',
    'contract_test'
  ),
  true,
  'first authorized ATS fetch receives a budget claim'
);
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000010',
    'contract_test'
  ),
  false,
  'a duplicate ATS fetch request cannot claim twice'
);
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000011',
    'contract_test'
  ),
  false,
  'configured fetch cadence denies a second immediate provider request'
);

reset role;
update app.job_sources
set status = 'paused'
where id = 'ac000000-0000-4000-8000-000000000002';
set local role service_role;
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000012',
    'contract_test'
  ),
  false,
  'a paused source cannot claim ATS provider budget'
);

reset role;
update app.job_sources
set status = 'active'
where id = 'ac000000-0000-4000-8000-000000000002';
update private.ats_source_configs
set allowed_destination_path_prefixes = array['/careers']
where source_id = 'ac000000-0000-4000-8000-000000000002';

select ok(
  (select
     status = 'paused'
     and authorization_reviewed_at is null
     and authorization_revoked_at is not null
     and authorization_revocation_reason = 'ats_configuration_changed'
   from app.job_sources
   where id = 'ac000000-0000-4000-8000-000000000002'),
  'changing ATS configuration immediately pauses and revokes source approval'
);

set local role service_role;
select is(
  (select count(*)::integer
   from api.worker_get_authorized_ats_source('test_authorized_ats')),
  0,
  'revoked ATS configuration disappears from worker get'
);
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000013',
    'contract_test'
  ),
  false,
  'configuration revocation denies further provider claims'
);

reset role;
update app.job_sources
set authorization_reviewed_at = now(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null
where id = 'ac000000-0000-4000-8000-000000000002';
select lives_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000002' $$,
  'a separately re-reviewed source can be activated again'
);

update app.job_sources
set may_email_jobs = true
where id = 'ac000000-0000-4000-8000-000000000002';
select ok(
  (select
     status = 'paused'
     and authorization_reviewed_at is null
     and authorization_revoked_at is not null
     and authorization_revocation_reason = 'source_policy_changed'
   from app.job_sources
   where id = 'ac000000-0000-4000-8000-000000000002'),
  'changing a source permission pauses and revokes the prior review'
);

update app.job_sources
set may_email_jobs = false,
    authorization_reviewed_at = now(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null
where id = 'ac000000-0000-4000-8000-000000000002';
update app.job_sources
set status = 'active'
where id = 'ac000000-0000-4000-8000-000000000002';
update app.job_sources
set authorization_revoked_at = clock_timestamp(),
    authorization_revocation_reason = 'employer_takedown_request'
where id = 'ac000000-0000-4000-8000-000000000002';
select ok(
  (select
     status = 'paused'
     and authorization_reviewed_at is null
     and authorization_revoked_at is not null
     and authorization_revocation_reason = 'employer_takedown_request'
   from app.job_sources
   where id = 'ac000000-0000-4000-8000-000000000002'),
  'direct authorization revocation atomically pauses and clears approval'
);

set local role service_role;
select is(
  api.worker_claim_ats_source_fetch(
    'test_authorized_ats',
    'ac000000-0000-4000-8000-000000000014',
    'contract_test'
  ),
  false,
  'a directly revoked source cannot claim provider budget'
);

reset role;
insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, allow_public_listing, refresh_interval,
  terms_reviewed_at, terms_version
) values (
  'ac000000-0000-4000-8000-000000000020',
  'test_expired_ats', 'Expired Authorization ATS', 'employer_ats',
  'draft', 'https://expired.example.test/terms',
  true, true, interval '12 hours', now() - interval '3 days',
  'expired-terms-v1'
);
insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, enabled
) values (
  'ac000000-0000-4000-8000-000000000020',
  'ac000000-0000-4000-8000-000000000001',
  'ashby', 'expiredtenant', array['jobs.example.test'], array['/jobs'],
  interval '12 hours', true
);
update app.job_sources
set authorization_basis = 'written_permission',
    authorization_evidence_ref = 'evidence:expired-test',
    authorization_grantor = 'Expired Test Employer',
    authorization_reviewed_at = now() - interval '2 days',
    authorization_expires_at = now() - interval '1 day'
where id = 'ac000000-0000-4000-8000-000000000020';
select throws_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000020' $$,
  '23514', 'expired source authorization cannot be active',
  'expired evidence cannot activate an ATS source'
);

insert into app.companies (
  id, slug, display_name, verification_status, record_status
) values (
  'ac000000-0000-4000-8000-000000000030',
  'automatic-review-company', 'Automatic Employer',
  'unverified', 'pending'
);
insert into app.job_sources (
  id, adapter_key, name, source_type, status, terms_url,
  attribution_required, allow_public_listing, refresh_interval,
  terms_reviewed_at, terms_version
) values (
  'ac000000-0000-4000-8000-000000000031',
  'test_automatic_ats', 'Automatic Employer ATS', 'employer_ats',
  'draft', 'https://automatic.example.test/terms',
  true, true, interval '6 hours', now(), 'automatic-terms-v1'
);
insert into private.ats_source_configs (
  source_id, company_id, provider, provider_region, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, publication_mode, enabled
) values (
  'ac000000-0000-4000-8000-000000000031',
  'ac000000-0000-4000-8000-000000000030',
  'lever', 'eu', 'automatictenant',
  array['jobs.eu.lever.co'], array['/automatictenant'],
  interval '6 hours', 'automatic', true
);
update app.job_sources
set authorization_basis = 'written_permission',
    authorization_evidence_ref = 'evidence:automatic-test',
    authorization_grantor = 'Automatic Employer Legal Team',
    authorization_reviewed_at = now(),
    policy_state = 'enabled',
    authority = 'employer_ats',
    allowed_fields = array[
      'external_id', 'title', 'description', 'source_url',
      'application_url', 'location', 'eligibility', 'work_arrangement',
      'employment_type', 'engagement_type', 'experience_level', 'posted_at',
      'deadline'
    ],
    policy_review_due_at = now() + interval '31 days',
    raw_retention = interval '30 days',
    minimum_poll_interval = interval '2 hours',
    maximum_requests_per_day = 12,
    required_dependencies = array['written_employer_permission'],
    missing_dependencies = '{}'::text[]
where id = 'ac000000-0000-4000-8000-000000000031';

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
) values (
  'ac000000-0000-4000-8000-000000000031',
  'written_employer_permission', 'verified',
  'evidence:automatic-test', now()
);

select throws_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000031' $$,
  '23514',
  'automatic ATS publication requires a published verified company',
  'automatic mode cannot activate for an unverified company'
);

update app.companies
set verification_status = 'domain_verified', record_status = 'published'
where id = 'ac000000-0000-4000-8000-000000000030';
select lives_ok(
  $$ update app.job_sources set status = 'active'
     where id = 'ac000000-0000-4000-8000-000000000031' $$,
  'automatic mode activates only after company publication and verification'
);

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
  source.allow_public_listing, source.may_index_jobs,
  source.may_emit_jobposting_schema
from app.job_sources source
where source.id = 'ac000000-0000-4000-8000-000000000031';

set local role service_role;
select ok(
  (select
     employer_name = 'Automatic Employer'
     and provider = 'lever'
     and provider_region = 'eu'
     and publication_mode = 'automatic'
   from api.worker_get_authorized_ats_source('test_automatic_ats')),
  'worker receives automatic mode, employer identity, and Lever region only after verification'
);

select ok(
  (select
     (claim.result ->> 'claimed')::boolean
     and claim.result #>> '{policy,adapter_key}' = 'test_automatic_ats'
     and claim.result #>> '{policy,provider}' = 'lever'
     and claim.result #>> '{policy,provider_region}' = 'eu'
     and claim.result #>> '{policy,tenant_identifier}' = 'automatictenant'
   from (
     select api.worker_claim_authorized_ats_source(
       'test_automatic_ats',
       'ac000000-0000-4000-8000-000000000041',
       'contract_test'
     ) as result
   ) claim),
  'atomic claim returns the exact current provider tenant and region policy'
);

reset role;
update app.companies
set verification_status = 'suspended'
where id = 'ac000000-0000-4000-8000-000000000030';
set local role service_role;
select is(
  (select count(*)::integer
   from api.worker_get_authorized_ats_source('test_automatic_ats')),
  0,
  'suspending an automatic-mode company immediately removes its worker config'
);
select throws_ok(
  $$ select * from api.worker_get_authorized_ats_source('Bad-Key!') $$,
  '22023', 'invalid source adapter key',
  'worker get rejects malformed adapter keys'
);
select throws_ok(
  $$ select api.worker_claim_ats_source_fetch(
       'Bad-Key!',
       'ac000000-0000-4000-8000-000000000040',
       'contract_test'
     ) $$,
  '22023', 'invalid ATS source fetch claim',
  'worker claim rejects malformed source identifiers before any network budget is consumed'
);

select * from finish();
rollback;
