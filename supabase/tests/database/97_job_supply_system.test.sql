begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(40);

select has_table('ingest', 'job_source_occurrences', 'source occurrences exist');
select has_table('ingest', 'job_occurrence_links', 'occurrence links exist');
select has_table('private', 'job_source_dependencies', 'rights dependency ledger exists');
select has_table('audit', 'canonical_job_events', 'canonical event ledger exists');
select has_table('app', 'job_salary_evidence', 'salary evidence exists');
select has_table('audit', 'job_duplicate_candidates', 'fuzzy review queue exists');
select has_table('audit', 'job_apply_link_checks', 'apply link audit exists');

select ok(
  to_regprocedure('api.worker_dispatch_job_supply()') is not null,
  'job supply dispatcher RPC exists'
);
select ok(
  to_regprocedure('api.worker_run_job_lifecycle()') is not null,
  'job lifecycle RPC exists'
);
select ok(
  to_regprocedure('api.worker_queue_fuzzy_job_duplicates(integer)') is not null,
  'fuzzy review RPC exists'
);
select ok(
  to_regprocedure('api.admin_get_job_supply_health()') is not null,
  'seven-day source dashboard RPC exists'
);
select ok(
  to_regprocedure('security.public_job_provenance(uuid)') is not null,
  'gated public provenance projection exists'
);
select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (
     ('ingest', 'job_source_occurrences'),
     ('ingest', 'job_occurrence_links'),
     ('private', 'job_source_dependencies'),
     ('audit', 'canonical_job_events')
   )),
  'provenance and rights ledgers force RLS'
);
select ok(
  not has_function_privilege('anon', 'api.worker_dispatch_job_supply()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.worker_run_job_lifecycle()', 'EXECUTE')
  and not has_function_privilege('anon', 'api.worker_queue_fuzzy_job_duplicates(integer)', 'EXECUTE'),
  'untrusted callers cannot execute supply workers'
);
select is(
  (select target_daily_new_canonical from private.job_supply_targets where id),
  500,
  'supply target counts new canonical jobs'
);
select is(
  (select count(*)::integer from private.worker_schedules
   where enabled and task_key in (
     'job_supply_dispatcher', 'job_lifecycle', 'apply_link_check',
     'job_dedupe_review', 'source_health_digest', 'source_rights_review'
   )),
  6,
  'all new supply operations have registered schedules'
);
select ok(
  not security.job_source_policy_is_runnable(
    (select id from app.job_sources where adapter_key = 'remotive')
  ),
  'Remotive is not runnable while rights conflict is unresolved'
);
select ok(
  (select not may_index_jobs and not may_emit_jobposting_schema
   from app.job_sources where adapter_key = 'remotive'),
  'Remotive cannot enter search indexing or JobPosting output'
);
select is(
  (select state from private.job_source_dependencies dependency
   join app.job_sources source on source.id = dependency.source_id
   where source.adapter_key = 'remotive'
     and dependency.dependency_key = 'written_republication_confirmation'),
  'missing',
  'Remotive external permission dependency remains explicit'
);

update app.job_sources
set policy_review_due_at = clock_timestamp() + interval '31 days'
where adapter_key = 'salarypadi_employer_submissions';

select ok(
  security.job_source_policy_is_runnable(
    (select id from app.job_sources
     where adapter_key = 'salarypadi_employer_submissions')
  ),
  'reviewed direct employer lane is runnable'
);

select is(
  (api.worker_run_source_rights_review()->>'enabled_sources')::integer,
  (select count(*)::integer from app.job_sources where policy_state = 'enabled'),
  'source rights review reports the actual enabled policy count'
);
select is(
  (api.worker_run_source_rights_review()->>'runnable_sources')::integer,
  (
    select count(*)::integer
    from app.job_sources source
    where security.job_source_policy_is_runnable(source.id)
  ),
  'source rights review keeps runnable sources distinct from enabled policies'
);

insert into ingest.import_runs (
  id, source_id, status, triggered_by, started_at
) values (
  '97000000-0000-4000-8000-000000000001',
  (select id from app.job_sources
   where adapter_key = 'salarypadi_employer_submissions'),
  'running', 'test', clock_timestamp()
);

select lives_ok(
  $$ insert into ingest.raw_job_records (
       source_id, import_run_id, external_source_id, source_url,
       original_employer_url, raw_payload, content_hash, dedup_fingerprint,
       full_description_stored, last_seen_at
     ) values (
       (select id from app.job_sources
        where adapter_key = 'salarypadi_employer_submissions'),
       '97000000-0000-4000-8000-000000000001', 'pilot-raw-1',
       'https://employer.example.test/jobs/1',
       'https://employer.example.test/jobs/1',
       '{"title":"Pilot role","application_url":"https://employer.example.test/jobs/1"}',
       repeat('a', 64), repeat('b', 64), false, clock_timestamp()
     ) $$,
  'allowed raw fields can be persisted'
);
select is(
  (select count(*)::integer from ingest.job_source_occurrences
   where import_run_id = '97000000-0000-4000-8000-000000000001'),
  1,
  'raw persistence creates one source occurrence'
);
select lives_ok(
  $$ update ingest.raw_job_records
     set last_seen_at = clock_timestamp()
     where source_id = (select id from app.job_sources
       where adapter_key = 'salarypadi_employer_submissions')
       and external_source_id = 'pilot-raw-1' $$,
  'idempotent replay is accepted'
);
select is(
  (select count(*)::integer from ingest.job_source_occurrences
   where import_run_id = '97000000-0000-4000-8000-000000000001'),
  1,
  'idempotent replay does not duplicate an occurrence'
);
select throws_ok(
  $$ insert into ingest.raw_job_records (
       source_id, import_run_id, external_source_id, source_url,
       raw_payload, content_hash, full_description_stored
     ) values (
       (select id from app.job_sources
        where adapter_key = 'salarypadi_employer_submissions'),
       '97000000-0000-4000-8000-000000000001', 'pilot-raw-forbidden',
       'https://employer.example.test/jobs/forbidden',
       '{"provider_internal_blob":"not-authorized"}', repeat('c', 64), false
     ) $$,
  '42501', 'raw source field is not permitted by current policy',
  'unlisted raw source fields fail closed'
);
select throws_ok(
  $$ insert into ingest.raw_job_records (
       source_id, import_run_id, external_source_id, source_url,
       raw_payload, content_hash, full_description_stored
     ) values (
       (select id from app.job_sources
        where adapter_key = 'salarypadi_employer_submissions'),
       '97000000-0000-4000-8000-000000000001', 'pilot-raw-nested-forbidden',
       'https://employer.example.test/jobs/nested-forbidden',
       '{"eligibility":{"provider_internal_blob":"not-authorized"}}',
       repeat('9', 64), false
     ) $$,
  '42501', 'raw eligibility field is not permitted by current policy',
  'unlisted nested eligibility fields fail closed'
);

insert into app.companies (
  id, slug, display_name, website_url, verification_status, record_status
) values (
  '97000000-0000-4000-8000-000000000010', 'supply-test-employer',
  'Supply Test Employer', 'https://employer.example.test',
  'domain_verified', 'published'
);

select lives_ok(
  $$ insert into app.jobs (
       id, company_id, source_id, external_source_id, slug, status, title,
       description_text, work_arrangement, employment_type, engagement_type,
       application_url, source_url, original_employer_url,
       content_sanitized_at, dedup_fingerprint, last_verified_at,
       salary_min, salary_max, currency_code, pay_period, gross_net
     ) values
       (
         '97000000-0000-4000-8000-000000000011',
         '97000000-0000-4000-8000-000000000010',
         (select id from app.job_sources
          where adapter_key = 'salarypadi_employer_submissions'),
         'pilot-job-one', 'pilot-job-one', 'published', 'Pilot Engineer',
         'A legitimate employer-authorized pilot engineering role.',
         'remote', 'full_time', 'employee',
         'https://employer.example.test/apply/one#details',
         'https://employer.example.test/jobs/one',
         'https://employer.example.test/jobs/one',
         clock_timestamp(), repeat('d', 64), clock_timestamp(),
         500000, 500000, 'NGN', 'monthly', 'gross'
       ),
       (
         '97000000-0000-4000-8000-000000000012',
         '97000000-0000-4000-8000-000000000010',
         (select id from app.job_sources
          where adapter_key = 'salarypadi_employer_submissions'),
         'pilot-job-two', 'pilot-job-two', 'published', 'Pilot Engineer',
         'The same authorized role observed as a second source occurrence.',
         'remote', 'full_time', 'employee',
         'https://employer.example.test/apply/one',
         'https://employer.example.test/jobs/two',
         'https://employer.example.test/jobs/two',
         clock_timestamp(), repeat('e', 64), clock_timestamp(),
         500000, 500000, 'NGN', 'monthly', 'gross'
       ) $$,
  'exact destination occurrences reconcile without duplicate canonical jobs'
);
select is(
  (select canonical_job_id from app.jobs
   where id = '97000000-0000-4000-8000-000000000012'),
  '97000000-0000-4000-8000-000000000011'::uuid,
  'older equal-authority job remains canonical'
);
select is(
  (select count(*)::integer from ingest.job_occurrence_links
   where canonical_job_id = '97000000-0000-4000-8000-000000000011'),
  2,
  'every exact source occurrence links to the canonical job'
);
select ok(
  exists (
    select 1 from app.job_salary_evidence
    where job_id = '97000000-0000-4000-8000-000000000011'
      and original_minimum = 500000
      and derived_annual_minimum = 6000000
      and derivation_assumptions <> '[]'::jsonb
  ),
  'direct workflow stores source salary separately from labelled derivation'
);
select is(
  (select original_minimum from app.job_salary_evidence
   where job_id = '97000000-0000-4000-8000-000000000011'),
  500000::numeric,
  'salary normalization preserves the original source amount'
);

insert into app.job_eligibility (
  job_id, scope, required_timezone_overlap, work_authorization_requirement,
  visa_sponsorship, evidence_text, provenance, confidence, last_verified_at,
  region_wording, physical_location_requirement, arrangement_evidence
) values (
  '97000000-0000-4000-8000-000000000011', 'named_countries',
  'UTC to UTC+3', 'Must be eligible to work in Nigeria', false,
  'Nigeria-based remote employee role', 'source_provided', 0.9,
  clock_timestamp(), 'Nigeria', 'Must reside in Nigeria', 'employee'
);
select is(
  (select region_wording || '|' || physical_location_requirement || '|' || arrangement_evidence
   from app.job_eligibility
   where job_id = '97000000-0000-4000-8000-000000000011'),
  'Nigeria|Must reside in Nigeria|employee',
  'eligibility evidence preserves region, location, and arrangement wording'
);
insert into app.job_eligibility_countries (job_id, country_code, rule)
values ('97000000-0000-4000-8000-000000000011', 'NG', 'include');
select ok(
  security.public_job_provenance(
    '97000000-0000-4000-8000-000000000011'
  ) ->> 'latest_occurrence_at' is not null,
  'public job provenance includes freshness without exposing raw payloads'
);
update app.job_eligibility
set work_authorization_requirement = 'Must be authorized to work in the United States'
where job_id = '97000000-0000-4000-8000-000000000011';
select ok(
  not security.job_is_public_remote_eligible(
    '97000000-0000-4000-8000-000000000011'
  ),
  'non-African work authorization overrides an otherwise remote listing'
);

insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status, title,
  description_text, employment_type, application_url, source_url,
  valid_through, dedup_fingerprint
) values (
  '97000000-0000-4000-8000-000000000013',
  '97000000-0000-4000-8000-000000000010',
  (select id from app.job_sources
   where adapter_key = 'salarypadi_employer_submissions'),
  'pilot-expired', 'pilot-expired', 'draft', 'Expired Pilot Role',
  'A deadline-expired direct employer role used for lifecycle proof.',
  'full_time', 'https://employer.example.test/apply/expired',
  'https://employer.example.test/jobs/expired',
  clock_timestamp() - interval '1 minute', repeat('f', 64)
);
select lives_ok(
  $$ select api.worker_run_job_lifecycle() $$,
  'deadline lifecycle worker runs idempotently'
);
select is(
  (select lifecycle_state::text from app.jobs
   where id = '97000000-0000-4000-8000-000000000013'),
  'closed',
  'elapsed deadlines close on the lifecycle pass'
);

update private.job_source_dependencies dependency
set state = 'expired'
from app.job_sources source
where source.id = dependency.source_id
  and source.adapter_key = 'salarypadi_employer_submissions'
  and dependency.dependency_key = 'authorization_attestation';
select ok(
  not security.job_source_policy_is_runnable(
    (select id from app.job_sources
     where adapter_key = 'salarypadi_employer_submissions')
  ),
  'expired dependency makes the source non-runnable immediately'
);
select is(
  (select status::text from app.job_sources
   where adapter_key = 'salarypadi_employer_submissions'),
  'paused',
  'dependency expiry pauses the source without reactivation'
);

select * from finish();
rollback;
