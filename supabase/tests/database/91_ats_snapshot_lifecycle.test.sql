begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(59);

select ok(
  to_regprocedure(
    'api.worker_begin_ats_snapshot(text,timestamp with time zone,integer,integer)'
  ) is not null
  and to_regprocedure(
    'api.worker_store_ats_snapshot_batch(uuid,jsonb)'
  ) is not null
  and to_regprocedure(
    'api.worker_finalize_ats_snapshot(uuid,boolean,integer,jsonb)'
  ) is not null,
  'service ATS begin, batch, and finalize RPCs exist'
);

select is(
  (select count(*)::integer from private.worker_schedules
   where task_key = 'ats_source_sync'),
  1,
  'ATS source worker schedule is registered idempotently'
);

select is(
  (select expected_interval from private.worker_schedules
   where task_key = 'ats_source_sync'),
  interval '2 hours',
  'ATS worker expected interval matches its source cadence'
);

select is(
  (select stale_after from private.worker_schedules
   where task_key = 'ats_source_sync'),
  interval '5 hours',
  'ATS worker stale threshold tolerates one delayed run'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.worker_begin_ats_snapshot(text,timestamptz,integer,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.worker_store_ats_snapshot_batch(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.worker_finalize_ats_snapshot(uuid,boolean,integer,jsonb)',
    'EXECUTE'
  ),
  'untrusted callers cannot execute ATS lifecycle RPCs'
);

insert into app.companies (
  id, slug, display_name, website_url, verification_status, record_status
) values
  (
    'c1000000-0000-0000-0000-000000000001',
    'ats-review-fixture', 'ATS Review Fixture',
    'https://review.example.test', 'unverified', 'draft'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'ats-automatic-fixture', 'ATS Automatic Fixture',
    'https://automatic.example.test', 'domain_verified', 'published'
  )
on conflict (id) do nothing;

insert into app.job_sources (
  id, adapter_key, name, source_type, status, homepage_url, terms_url,
  attribution_required, attribution_text, may_store_full_description,
  may_index_jobs, may_emit_jobposting_schema, may_email_jobs,
  allow_public_listing, required_destination_kind, refresh_interval,
  terms_reviewed_at, terms_version, authorization_basis,
  authorization_evidence_ref, authorization_grantor,
  authorization_reviewed_at
) values
  (
    'd1000000-0000-0000-0000-000000000001',
    'ats_lifecycle_review', 'ATS Lifecycle Review', 'employer_ats',
    'draft', 'https://review.example.test',
    'https://review.example.test/terms', true,
    'Source: ATS Review Fixture', false, false, false, false, true,
    'source_url', interval '6 hours', clock_timestamp(),
    'written-permission-2026-07-11', null,
    null, null, null
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'ats_lifecycle_automatic', 'ATS Lifecycle Automatic',
    'employer_ats', 'draft', 'https://automatic.example.test',
    'https://automatic.example.test/terms', true,
    'Source: ATS Automatic Fixture', true, true, true, false, true,
    'source_url', interval '6 hours', clock_timestamp(),
    'commercial-contract-2026-07-11', null,
    null, null, null
  )
on conflict (id) do nothing;

insert into private.ats_source_configs (
  source_id, company_id, provider, tenant_identifier,
  allowed_destination_hosts, allowed_destination_path_prefixes,
  fetch_interval, daily_request_budget, minimum_request_spacing,
  publication_mode, enabled
) values
  (
    'd1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'greenhouse', 'ats_review_fixture',
    array['boards.example.test'], array['/review'],
    interval '6 hours', 4, interval '5 minutes', 'review', true
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000002',
    'ashby', 'ats_automatic_fixture',
    array['boards.example.test'], array['/automatic'],
    interval '6 hours', 4, interval '5 minutes', 'automatic', true
  )
on conflict (source_id) do nothing;

-- Authorization evidence is reviewed only after the trusted config exists,
-- matching the production activation flow.
update app.job_sources
set status = 'active',
    policy_state = 'enabled',
    authority = 'employer_ats',
    allowed_fields = array[
      'external_id', 'title', 'description', 'source_url',
      'application_url', 'location', 'eligibility', 'work_arrangement',
      'employment_type', 'engagement_type', 'experience_level', 'posted_at',
      'deadline'
    ],
    policy_review_due_at = clock_timestamp() + interval '31 days',
    raw_retention = interval '30 days',
    minimum_poll_interval = interval '2 hours',
    maximum_requests_per_day = 12,
    required_dependencies = array['written_employer_permission'],
    missing_dependencies = '{}'::text[],
    authorization_basis = case id
      when 'd1000000-0000-0000-0000-000000000001'::uuid
        then 'written_permission'
      else 'commercial_contract'
    end,
    authorization_evidence_ref = case id
      when 'd1000000-0000-0000-0000-000000000001'::uuid
        then 'test-evidence:ats-review:2026-07-11'
      else 'test-evidence:ats-automatic:2026-07-11'
    end,
    authorization_grantor = case id
      when 'd1000000-0000-0000-0000-000000000001'::uuid
        then 'ATS Review Fixture'
      else 'ATS Automatic Fixture'
    end,
    authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null
where id in (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002'
);

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
) values
  (
    'd1000000-0000-0000-0000-000000000001',
    'written_employer_permission', 'verified',
    'test-evidence:ats-review:2026-07-11', clock_timestamp()
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'written_employer_permission', 'verified',
    'test-evidence:ats-automatic:2026-07-11', clock_timestamp()
  );

create temporary table ats_test_runs (
  name text primary key,
  run_id uuid not null
) on commit drop;

create temporary table ats_test_values (
  name text primary key,
  value text not null
) on commit drop;

insert into ats_test_runs (name, run_id)
select 'review-1', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now(), 1, 1
) begun
where begun.should_run;

select ok(
  (select begun.import_run_id = (
      select run_id from ats_test_runs where name = 'review-1'
    ) and not begun.should_run
   from api.worker_begin_ats_snapshot(
     'ats_lifecycle_review', now(), 1, 1
   ) begun),
  'begin returns the existing import as a safe idempotent no-op'
);

select is(
  (select count(*)::integer
   from ingest.ats_snapshot_runs snapshot
   where snapshot.source_id = 'd1000000-0000-0000-0000-000000000001'
     and snapshot.run_key = (
       select run_key from ingest.ats_snapshot_runs
       where import_run_id = (
         select run_id from ats_test_runs where name = 'review-1'
       )
     )),
  1,
  'idempotent begin creates one durable import run'
);

select throws_ok(
  $$ select * from api.worker_begin_ats_snapshot(
    'ats_lifecycle_review', now() + interval '500 milliseconds', 1, 1
  ) $$,
  '55000', null,
  'a source cannot overlap running snapshots'
);

select throws_ok(
  $$ update ingest.import_runs
     set status = 'cancelled', completed_at = clock_timestamp()
     where id = (
       select run_id from ats_test_runs where name = 'review-1'
     ) $$,
  '23514', null,
  'generic cancellation cannot wedge a running ATS lifecycle'
);

select is(
  (
    api.worker_store_ats_snapshot_batch(
      (select run_id from ats_test_runs where name = 'review-1'),
      jsonb_build_array(jsonb_build_object(
        'external_id', 'review-1',
        'content_hash', repeat('1', 64),
        'dedup_fingerprint', repeat('a', 64),
        'title', 'Review Platform Engineer',
        'source_url',
          'https://boards.example.test/review/jobs/review-1',
        'application_url',
          'https://boards.example.test/review/jobs/review-1/apply',
        'description_text', null,
        'last_checked_at', '2026-07-11T00:00:00.000Z',
        'work_arrangement', 'remote',
        'employment_type', 'full_time',
        'locations', jsonb_build_array(jsonb_build_object(
          'country_code', 'NG', 'city', 'Lagos', 'is_primary', true
        )),
        'eligibility', jsonb_build_object(
          'scope', 'nigeria', 'provenance', 'source_provided',
          'evidence_text', 'The source says applicants must be in Nigeria.',
          'countries', jsonb_build_array(jsonb_build_object(
            'country_code', 'NG', 'rule', 'include'
          ))
        )
      ))
    ) ->> 'created_count'
  )::integer,
  1,
  'review batch creates one normalized job'
);

select is(
  (select status::text from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  'pending',
  'review mode keeps a new ATS job pending'
);

select ok(
  (select not full_description_stored
     and not (raw_payload ? 'description_text')
     and dedup_fingerprint = repeat('a', 64)
   from ingest.raw_job_records
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  'metadata-only source does not durably retain provider description'
);

select ok(
  (select description_text from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1')
    like '%does not store the provider%description%',
  'metadata-only public description transparently directs users to source'
);

select is(
  (select count(*)::integer
   from app.job_locations location
   join app.jobs job on job.id = location.job_id
   where job.source_id = 'd1000000-0000-0000-0000-000000000001'
     and job.external_source_id = 'review-1'
     and location.country_code = 'NG'
     and location.is_primary),
  1,
  'source-provided locations replace normalized location evidence'
);

select is(
  (select eligibility.provenance::text
   from app.job_eligibility eligibility
   join app.jobs job on job.id = eligibility.job_id
   where job.source_id = 'd1000000-0000-0000-0000-000000000001'
     and job.external_source_id = 'review-1'),
  'source_provided',
  'ATS eligibility is explicitly marked as source-provided'
);

select throws_ok(
  $$ select api.worker_store_ats_snapshot_batch(
    (select run_id from ats_test_runs where name = 'review-1'),
    jsonb_build_array(
      jsonb_build_object(
        'external_id', 'duplicate',
        'content_hash', repeat('2', 64),
        'dedup_fingerprint', repeat('b', 64),
        'title', 'Duplicate One',
        'source_url', 'https://boards.example.test/review/jobs/duplicate',
        'application_url',
          'https://boards.example.test/review/jobs/duplicate/apply',
        'eligibility', jsonb_build_object(
          'scope', 'unclear', 'provenance', 'source_provided',
          'evidence_text', 'Location not stated by the employer ATS.',
          'countries', '[]'::jsonb
        )
      ),
      jsonb_build_object(
        'external_id', 'duplicate',
        'content_hash', repeat('3', 64),
        'dedup_fingerprint', repeat('c', 64),
        'title', 'Duplicate Two',
        'source_url', 'https://boards.example.test/review/jobs/duplicate',
        'application_url',
          'https://boards.example.test/review/jobs/duplicate/apply',
        'eligibility', jsonb_build_object(
          'scope', 'unclear', 'provenance', 'source_provided',
          'evidence_text', 'Location not stated by the employer ATS.',
          'countries', '[]'::jsonb
        )
      )
    )
  ) $$,
  '22023', null,
  'duplicate external IDs are rejected atomically'
);

select throws_ok(
  $$ select api.worker_store_ats_snapshot_batch(
    (select run_id from ats_test_runs where name = 'review-1'),
    jsonb_build_array(jsonb_build_object(
      'external_id', 'bad-fingerprint',
      'content_hash', repeat('4', 64),
      'dedup_fingerprint', 'not-a-sha256',
      'title', 'Bad Fingerprint Record',
      'source_url',
        'https://boards.example.test/review/jobs/bad-fingerprint',
      'application_url',
        'https://boards.example.test/review/jobs/bad-fingerprint/apply',
      'eligibility', jsonb_build_object(
        'scope', 'unclear', 'provenance', 'source_provided',
        'evidence_text', 'Location not stated by the employer ATS.',
        'countries', '[]'::jsonb
      )
    ))
  ) $$,
  '22023', null,
  'worker content and dedup fingerprints must be lowercase SHA-256'
);

select throws_ok(
  $$ select api.worker_store_ats_snapshot_batch(
    (select run_id from ats_test_runs where name = 'review-1'),
    jsonb_build_array(jsonb_build_object(
      'external_id', 'oversized',
      'content_hash', repeat('4', 64),
      'dedup_fingerprint', repeat('d', 64),
      'title', 'Oversized Record',
      'source_url', 'https://boards.example.test/review/jobs/oversized',
      'application_url',
        'https://boards.example.test/review/jobs/oversized/apply',
      'description_text', repeat('x', 4194305),
      'eligibility', jsonb_build_object(
        'scope', 'unclear', 'provenance', 'source_provided',
        'evidence_text', 'Location not stated by the employer ATS.',
        'countries', '[]'::jsonb
      )
    ))
  ) $$,
  '22023', null,
  'oversized ATS batches are rejected before persistence'
);

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-1'),
    true, 0, '[]'::jsonb
  ) ->> 'outcome',
  'complete',
  'fully accounted review snapshot finalizes as complete'
);

select is(
  (select count(*)::integer from audit.ats_import_evidence evidence
   where evidence.import_run_id = (
     select run_id from ats_test_runs where name = 'review-1'
   )
     and evidence.created_count = 1
     and evidence.updated_count = 0
     and evidence.unchanged_count = 0),
  1,
  'finalize writes immutable created/updated/unchanged evidence'
);

select throws_ok(
  $$ update audit.ats_import_evidence
     set created_count = 99
     where import_run_id = (
       select run_id from ats_test_runs where name = 'review-1'
     ) $$,
  '42501', null,
  'ATS import evidence is append-only'
);

insert into ats_test_values (name, value)
select 'review-slug', slug from app.jobs
where source_id = 'd1000000-0000-0000-0000-000000000001'
  and external_source_id = 'review-1';

insert into ats_test_runs (name, run_id)
select 'review-2', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '1 second', 1, 1
) begun
where begun.should_run;

select is(
  (
    api.worker_store_ats_snapshot_batch(
      (select run_id from ats_test_runs where name = 'review-2'),
      jsonb_build_array(jsonb_build_object(
        'external_id', 'review-1',
        'content_hash', repeat('1', 64),
        'dedup_fingerprint', repeat('a', 64),
        'title', 'Review Platform Engineer',
        'source_url',
          'https://boards.example.test/review/jobs/review-1',
        'application_url',
          'https://boards.example.test/review/jobs/review-1/apply',
        'description_text', null,
        'last_checked_at', '2026-07-11T01:00:00.000Z',
        'work_arrangement', 'remote',
        'employment_type', 'full_time',
        'locations', jsonb_build_array(jsonb_build_object(
          'country_code', 'NG', 'city', 'Lagos', 'is_primary', true
        )),
        'eligibility', jsonb_build_object(
          'scope', 'nigeria', 'provenance', 'source_provided',
          'evidence_text', 'The source says applicants must be in Nigeria.',
          'countries', jsonb_build_array(jsonb_build_object(
            'country_code', 'NG', 'rule', 'include'
          ))
        )
      ))
    ) ->> 'unchanged_count'
  )::integer,
  1,
  'replaying unchanged normalized metadata is idempotent'
);

select is(
  (select slug from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  (select value from ats_test_values where name = 'review-slug'),
  'idempotent replay preserves the stable job slug'
);

select lives_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-2'),
    true, 0, '[]'::jsonb
  ) $$,
  'idempotent replay finalizes successfully'
);

update app.jobs
set status = 'published'
where source_id = 'd1000000-0000-0000-0000-000000000001'
  and external_source_id = 'review-1';

insert into ats_test_runs (name, run_id)
select 'review-3', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '2 seconds', 1, 1
) begun
where begun.should_run;

select is(
  (
    api.worker_store_ats_snapshot_batch(
      (select run_id from ats_test_runs where name = 'review-3'),
      jsonb_build_array(jsonb_build_object(
        'external_id', 'review-1',
        'content_hash', repeat('5', 64),
        'dedup_fingerprint', repeat('a', 64),
        'title', 'Senior Review Platform Engineer',
        'source_url',
          'https://boards.example.test/review/jobs/review-1',
        'application_url',
          'https://boards.example.test/review/jobs/review-1/apply',
        'work_arrangement', 'remote',
        'employment_type', 'full_time',
        'eligibility', jsonb_build_object(
          'scope', 'nigeria', 'provenance', 'source_provided',
          'evidence_text', 'The source says applicants must be in Nigeria.',
          'countries', jsonb_build_array(jsonb_build_object(
            'country_code', 'NG', 'rule', 'include'
          ))
        )
      ))
    ) ->> 'updated_count'
  )::integer,
  1,
  'changed source metadata records one update'
);

select is(
  (select status::text from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  'pending',
  'changed review-mode content returns a published job to moderation'
);

select is(
  (select count(*)::integer
   from app.job_locations location
   join app.jobs job on job.id = location.job_id
   where job.source_id = 'd1000000-0000-0000-0000-000000000001'
     and job.external_source_id = 'review-1'
     and location.country_code = 'NG'),
  1,
  'missing location evidence preserves the last source-provided location'
);

select is(
  (select slug from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  (select value from ats_test_values where name = 'review-slug'),
  'title changes do not churn the stable job slug'
);

select lives_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-3'),
    true, 0, '[]'::jsonb
  ) $$,
  'changed review snapshot finalizes successfully'
);

insert into ats_test_runs (name, run_id)
select 'review-stale', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '2500 milliseconds', 0, 0
) begun
where begun.should_run;

update ingest.ats_snapshot_runs
set started_at = clock_timestamp() - interval '2 hours'
where import_run_id = (
  select run_id from ats_test_runs where name = 'review-stale'
);
update ingest.import_runs
set started_at = clock_timestamp() - interval '2 hours'
where id = (select run_id from ats_test_runs where name = 'review-stale');

insert into ats_test_runs (name, run_id)
select 'review-recovered', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '3 seconds', 0, 0
) begun
where begun.should_run;

select is(
  (select status::text from ingest.import_runs
   where id = (select run_id from ats_test_runs where name = 'review-stale')),
  'failed',
  'a running ATS import older than one hour is recovered as failed'
);

select is(
  (select error_summary -> 'codes' ->> 0
   from audit.ats_import_evidence
   where import_run_id = (
     select run_id from ats_test_runs where name = 'review-stale'
   )),
  'stale_snapshot_recovered',
  'stale recovery leaves immutable failure evidence'
);

select lives_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-recovered'),
    true, 0, '[]'::jsonb
  ) $$,
  'a new snapshot can run after bounded stale recovery'
);

insert into ats_test_runs (name, run_id)
select 'review-newer-stale', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '5 seconds', 0, 0
) begun
where begun.should_run;

update ingest.ats_snapshot_runs
set started_at = clock_timestamp() - interval '2 hours'
where import_run_id = (
  select run_id from ats_test_runs where name = 'review-newer-stale'
);
update ingest.import_runs
set started_at = clock_timestamp() - interval '2 hours'
where id = (
  select run_id from ats_test_runs where name = 'review-newer-stale'
);

select is(
  (
    select begun.should_run
    from api.worker_begin_ats_snapshot(
      'ats_lifecycle_review', now() + interval '4 seconds', 0, 0
    ) begun
  ),
  false,
  'recovering a newer stale snapshot cannot start an older replay'
);

insert into ats_test_runs (name, run_id)
select 'automatic-quarantined', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_automatic', now() + interval '2500 milliseconds', 1, 0
) begun
where begun.should_run;

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'automatic-quarantined'),
    false, 1, '["ats_invalid_records"]'::jsonb
  ) ->> 'outcome',
  'quarantined',
  'an all-invalid provider snapshot receives the quarantined outcome'
);

select is(
  (select status::text from ingest.import_runs
   where id = (
     select run_id from ats_test_runs where name = 'automatic-quarantined'
   )),
  'failed',
  'a quarantined provider snapshot fails operational health without omissions'
);

insert into ats_test_runs (name, run_id)
select 'automatic-1', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_automatic', now() + interval '3 seconds', 2, 2
) begun
where begun.should_run;

select is(
  (
    api.worker_store_ats_snapshot_batch(
      (select run_id from ats_test_runs where name = 'automatic-1'),
      jsonb_build_array(
        jsonb_build_object(
          'external_id', 'automatic-1',
          'content_hash', repeat('6', 64),
          'dedup_fingerprint', repeat('e', 64),
          'title', 'Automatic Data Engineer',
          'source_url',
            'https://boards.example.test/automatic/jobs/automatic-1',
          'application_url',
            'https://boards.example.test/automatic/jobs/automatic-1/apply',
          'description_text', 'Stored provider description one.',
          'employment_type', 'full_time',
          'eligibility', jsonb_build_object(
            'scope', 'unclear', 'provenance', 'source_provided',
            'evidence_text', 'Location not stated by the employer ATS.',
            'countries', '[]'::jsonb
          )
        ),
        jsonb_build_object(
          'external_id', 'automatic-2',
          'content_hash', repeat('7', 64),
          'dedup_fingerprint', repeat('f', 64),
          'title', 'Automatic Product Engineer',
          'source_url',
            'https://boards.example.test/automatic/jobs/automatic-2',
          'application_url',
            'https://boards.example.test/automatic/jobs/automatic-2/apply',
          'description_text', 'Stored provider description two.',
          'employment_type', 'full_time',
          'eligibility', jsonb_build_object(
            'scope', 'unclear', 'provenance', 'source_provided',
            'evidence_text', 'Location not stated by the employer ATS.',
            'countries', '[]'::jsonb
          )
        )
      )
    ) ->> 'created_count'
  )::integer,
  2,
  'automatic source creates both accepted records'
);

select is(
  (select count(*)::integer from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and status = 'published'),
  2,
  'automatic mode publishes only under verified company invariant'
);

select ok(
  (select full_description_stored
     and raw_payload ->> 'description_text' =
       'Stored provider description one.'
     and dedup_fingerprint = repeat('e', 64)
   from ingest.raw_job_records
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and external_source_id = 'automatic-1'),
  'reviewed storage permission allows provider description persistence'
);

select ok(
  (select description_text = 'Stored provider description one.'
     and dedup_fingerprint = repeat('e', 64)
   from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and external_source_id = 'automatic-1'),
  'job stores the permitted plain-text description and worker fingerprint'
);

select lives_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'automatic-1'),
    true, 0, '[]'::jsonb
  ) $$,
  'initial automatic snapshot finalizes successfully'
);

insert into ats_test_runs (name, run_id)
select 'automatic-partial', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_automatic', now() + interval '4 seconds', 2, 2
) begun
where begun.should_run;

select lives_ok(
  $$ select api.worker_store_ats_snapshot_batch(
    (select run_id from ats_test_runs where name = 'automatic-partial'),
    jsonb_build_array(jsonb_build_object(
      'external_id', 'automatic-1',
      'content_hash', repeat('6', 64),
      'dedup_fingerprint', repeat('e', 64),
      'title', 'Automatic Data Engineer',
      'source_url',
        'https://boards.example.test/automatic/jobs/automatic-1',
      'application_url',
        'https://boards.example.test/automatic/jobs/automatic-1/apply',
      'description_text', 'Stored provider description one.',
      'employment_type', 'full_time',
      'eligibility', jsonb_build_object(
        'scope', 'unclear', 'provenance', 'source_provided',
        'evidence_text', 'Location not stated by the employer ATS.',
        'countries', '[]'::jsonb
      )
    ))
  ) $$,
  'partial snapshot may persist the valid seen subset'
);

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'automatic-partial'),
    false, 0, '["provider_partial"]'::jsonb
  ) ->> 'outcome',
  'partial',
  'incomplete provider run is recorded as partial'
);

select is(
  (select status::text from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and external_source_id = 'automatic-2'),
  'published',
  'partial snapshot never closes an unseen published job'
);

select is(
  (select successful_omission_count
   from ingest.raw_job_records
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and external_source_id = 'automatic-2'),
  0::smallint,
  'partial snapshot never increments omission evidence'
);

select ok(
  (select not begun.should_run
     and begun.import_run_id = (
       select run_id from ats_test_runs where name = 'automatic-partial'
     )
   from api.worker_begin_ats_snapshot(
     'ats_lifecycle_automatic',
     now() + interval '3500 milliseconds', 2, 2
   ) begun),
  'a newer finalized partial snapshot blocks older content and omission replay'
);

insert into ats_test_runs (name, run_id)
select 'automatic-empty-1', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_automatic', now() + interval '5 seconds', 1, 0
) begun
where begun.should_run;

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'automatic-empty-1'),
    true, 0, '[]'::jsonb
  ) ->> 'expired_count',
  '0',
  'first valid empty normalized snapshot does not expire jobs'
);

select is(
  (select min(successful_omission_count)::integer
   from ingest.raw_job_records
   where source_id = 'd1000000-0000-0000-0000-000000000002'),
  1,
  'first complete omission records one strike'
);

-- The supply lifecycle requires the second successful absence to be at least
-- 30 minutes after the first; age the fixture evidence without waiting.
update ingest.raw_job_records
set first_successful_absence_at = clock_timestamp() - interval '31 minutes'
where source_id = 'd1000000-0000-0000-0000-000000000002';

select is(
  (select filtered_count from audit.ats_import_evidence
   where import_run_id = (
     select run_id from ats_test_runs where name = 'automatic-empty-1'
   )),
  1,
  'provider-filtered records remain distinct from accepted job count'
);

insert into ats_test_runs (name, run_id)
select 'automatic-empty-2', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_automatic', now() + interval '6 seconds', 0, 0
) begun
where begun.should_run;

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'automatic-empty-2'),
    true, 0, '[]'::jsonb
  ) ->> 'expired_count',
  '2',
  'second successful complete omission expires published jobs'
);

select is(
  (select count(*)::integer from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000002'
     and status = 'expired'),
  2,
  'two complete omissions close both published source jobs'
);

select ok(
  (select not begun.should_run
     and begun.import_run_id = (
       select run_id from ats_test_runs where name = 'automatic-empty-2'
     )
   from api.worker_begin_ats_snapshot(
     'ats_lifecycle_automatic',
     now() + interval '5500 milliseconds', 0, 0
   ) begun),
  'an older provider snapshot is an idempotent no-op after a newer complete run'
);

insert into ats_test_runs (name, run_id)
select 'review-policy-old', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '7 seconds', 0, 0
) begun
where begun.should_run;

update private.ats_source_configs
set allowed_destination_path_prefixes = array['/review-v2']
where source_id = 'd1000000-0000-0000-0000-000000000001';

update app.job_sources
set status = 'active',
    authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revoked_by = null,
    authorization_revocation_reason = null
where id = 'd1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select api.worker_store_ats_snapshot_batch(
    (select run_id from ats_test_runs where name = 'review-policy-old'),
    jsonb_build_array(jsonb_build_object(
      'external_id', 'blocked',
      'content_hash', repeat('8', 64),
      'dedup_fingerprint', repeat('9', 64),
      'title', 'Blocked Record',
      'source_url', 'https://boards.example.test/review-v2/jobs/blocked',
      'application_url',
        'https://boards.example.test/review-v2/jobs/blocked/apply',
      'eligibility', jsonb_build_object(
        'scope', 'unclear', 'provenance', 'source_provided',
        'evidence_text', 'Location not stated by the employer ATS.',
        'countries', '[]'::jsonb
      )
    ))
  ) $$,
  '42501', null,
  'reapproval after a config edit cannot resume an old snapshot batch'
);

select throws_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-policy-old'),
    true, 0, '[]'::jsonb
  ) $$,
  '42501', null,
  'old policy fingerprint cannot perform complete reconciliation'
);

select is(
  api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-policy-old'),
    false, 0, '["ats_policy_changed"]'::jsonb
  ) ->> 'outcome',
  'failed',
  'failure finalization seals a run after policy revocation without omissions'
);

insert into ats_test_runs (name, run_id)
select 'review-policy-current', begun.import_run_id
from api.worker_begin_ats_snapshot(
  'ats_lifecycle_review', now() + interval '8 seconds', 0, 0
) begun
where begun.should_run;

update ingest.raw_job_records
set first_successful_absence_at = clock_timestamp() - interval '31 minutes'
where source_id = 'd1000000-0000-0000-0000-000000000001'
  and successful_omission_count = 1;

select is(
  (select count(*)::integer from ats_test_runs
   where name = 'review-policy-current'),
  1,
  'current policy can begin after the old run is safely sealed'
);

select lives_ok(
  $$ select api.worker_finalize_ats_snapshot(
    (select run_id from ats_test_runs where name = 'review-policy-current'),
    true, 0, '[]'::jsonb
  ) $$,
  'current policy snapshot finalizes normally'
);

select is(
  (select status::text from app.jobs
   where source_id = 'd1000000-0000-0000-0000-000000000001'
     and external_source_id = 'review-1'),
  'expired',
  'two complete omissions also expire a pending review-mode job'
);

update app.job_sources
set authorization_revoked_at = clock_timestamp(),
    authorization_revocation_reason = 'test_revocation'
where id = 'd1000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from api.worker_begin_ats_snapshot(
    'ats_lifecycle_review', now() + interval '9 seconds', 0, 0
  ) $$,
  '42501', null,
  'revoked source cannot begin another snapshot'
);

select is(
  (select count(*)::integer
   from private.ats_source_configs config
   join app.companies company on company.id = config.company_id
   where lower(company.display_name) in ('moniepoint', 'm-kopa')
     and config.enabled
     and config.provider = 'greenhouse'
     and config.tenant_identifier = 'moniepoint'),
  1,
  'the reviewed Moniepoint board is the only seeded candidate employer configuration'
);

select * from finish();
rollback;
