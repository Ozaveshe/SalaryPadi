begin;

-- Quota is spent on distinct URLs, not on repeated updates to one job.
--
-- The outbox writes a row per change, which is correct: the trigger cannot
-- know whether the last notification was delivered. The claim is where that
-- has to be reconciled, or a job edited fourteen times consumes fourteen of
-- the day's two hundred notifications and says the same thing every time.

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security, audit;
select plan(6);

insert into app.companies (
  id, slug, display_name, website_url, website_domain, record_status
)
values (
  'c2000000-0000-0000-0000-000000000001', 'indexing-example', 'Indexing Example',
  'https://indexing.example.test', 'indexing.example.test', 'published'
)
on conflict (id) do nothing;

-- Three jobs, so fairness across jobs can be observed rather than assumed.
insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status,
  title, description_text, work_arrangement, employment_type,
  application_url, source_url
)
select
  ('c3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'c2000000-0000-0000-0000-000000000001',
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions'),
  'indexing-outbox-test-' || n, 'job-' || n, 'draft',
  'Indexing outbox test role ' || n,
  'This test-only role exercises Google indexing outbox collapse.',
  'remote', 'full_time',
  'https://employer.example.test/jobs/' || n,
  'https://employer.example.test/jobs/' || n
from generate_series(1, 3) n;

-- Two of them carry a backlog of repeated notifications. URL_DELETED is used
-- here on purpose: the eligibility purge only ever targets URL_UPDATED, so
-- the collapse rule is observed on its own rather than through a full
-- published-job-and-provenance fixture.
insert into private.google_indexing_outbox (
  job_id, job_slug, notification_kind, idempotency_key, status, created_at
)
select
  ('c3000000-0000-0000-0000-' || lpad(job::text, 12, '0'))::uuid,
  'job-' || job,
  'URL_DELETED',
  'test:' || job || ':' || n,
  'pending',
  now() - make_interval(mins => 60 - n)
from generate_series(1, 2) job, generate_series(1, 5) n;

select is(
  (select count(*)::integer from private.google_indexing_outbox
   where status = 'pending' and job_slug in ('job-1', 'job-2')),
  10,
  'ten pending notifications describe two jobs before any claim'
);

set local role postgres;
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select api.google_indexing_claim_notifications(1);

select is(
  (select count(*)::integer from private.google_indexing_outbox
   where status = 'dead' and error_code = 'superseded_by_newer'
     and job_slug in ('job-1', 'job-2')),
  8,
  'the claim collapses each job to its newest notification'
);

select is(
  (select count(*)::integer from private.google_indexing_outbox
   where status in ('pending', 'processing') and job_slug in ('job-1', 'job-2')),
  2,
  'one notification per job survives, so the second job is not starved'
);

select ok(
  (select bool_and(completed_at is not null)
   from private.google_indexing_outbox
   where error_code = 'superseded_by_newer' and job_slug in ('job-1', 'job-2')),
  'a superseded notification is closed rather than left hanging'
);

-- A removal makes an earlier update moot.
insert into private.google_indexing_outbox (
  job_id, job_slug, notification_kind, idempotency_key, status, created_at
)
values (
  'c3000000-0000-0000-0000-000000000003', 'job-3', 'URL_UPDATED',
  'test:3:update', 'pending', now() - interval '30 minutes'
), (
  'c3000000-0000-0000-0000-000000000003', 'job-3', 'URL_DELETED',
  'test:3:delete', 'pending', now() - interval '5 minutes'
);
select api.google_indexing_claim_notifications(1);

select is(
  (select status from private.google_indexing_outbox
   where idempotency_key = 'test:3:update'),
  'dead',
  'a removal supersedes the update that preceded it'
);
select is(
  (select error_code from private.google_indexing_outbox
   where idempotency_key = 'test:3:update'),
  'superseded_by_deletion',
  'and says so, rather than looking like a delivery failure'
);

select * from finish();
rollback;
