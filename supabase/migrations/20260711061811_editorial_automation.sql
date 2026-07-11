-- Evidence-led editorial automation. Content is review-first; only deterministic
-- data briefs derived from a fresh SalaryPadi snapshot may auto-publish.

create schema if not exists editorial;

create table editorial.topic_candidates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  topic_kind text not null,
  search_intent text not null,
  rationale text not null,
  status text not null default 'queued',
  priority smallint not null default 50,
  evidence_requirements jsonb not null default '[]'::jsonb,
  internal_link_targets text[] not null default '{}',
  generated_by text not null default 'editorial_plan',
  duplicate_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  admin_version integer not null default 1,
  constraint editorial_topic_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint editorial_topic_kind check (topic_kind in ('cornerstone', 'data_brief')),
  constraint editorial_topic_status check (status in ('queued', 'selected', 'drafted', 'rejected')),
  constraint editorial_topic_priority check (priority between 0 and 100),
  constraint editorial_topic_evidence_array check (jsonb_typeof(evidence_requirements) = 'array')
);

create table editorial.sources (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique,
  title text not null,
  publisher text not null,
  source_type text not null,
  published_at timestamptz,
  retrieved_at timestamptz not null default clock_timestamp(),
  last_checked_at timestamptz,
  link_status text not null default 'pending',
  http_status integer,
  licence_note text,
  content_hash text,
  review_required boolean not null default true,
  terms_reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint editorial_source_https check (canonical_url ~* '^https://'),
  constraint editorial_source_type check (source_type in ('official', 'employer', 'job_source', 'internal', 'research')),
  constraint editorial_source_status check (link_status in ('pending', 'healthy', 'redirected', 'broken', 'stale')),
  constraint editorial_source_http_status check (http_status is null or http_status between 100 and 599)
);

create table editorial.data_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  captured_at timestamptz not null default clock_timestamp(),
  source_checked_at timestamptz not null,
  metrics jsonb not null,
  source_summary jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint editorial_snapshot_key check (snapshot_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$'),
  constraint editorial_snapshot_metrics_object check (jsonb_typeof(metrics) = 'object'),
  constraint editorial_snapshot_sources_object check (jsonb_typeof(source_summary) = 'object'),
  constraint editorial_snapshot_hash check (content_hash ~ '^[a-f0-9]{64}$')
);

create table editorial.articles (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid unique references editorial.topic_candidates(id) on delete set null,
  snapshot_id uuid references editorial.data_snapshots(id) on delete set null,
  slug text not null unique,
  title text not null,
  description text not null,
  article_kind text not null,
  body_markdown text not null,
  status text not null default 'draft',
  deterministic boolean not null default false,
  fact_check_status text not null default 'pending',
  editorial_approval_status text not null default 'pending',
  internal_link_targets text[] not null default '{}',
  author_name text not null default 'SalaryPadi Editorial',
  scheduled_for timestamptz,
  published_at timestamptz,
  last_content_review_at timestamptz,
  next_review_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  admin_version integer not null default 1,
  constraint editorial_article_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint editorial_article_kind check (article_kind in ('cornerstone', 'data_brief')),
  constraint editorial_article_status check (status in ('draft', 'fact_check', 'editorial_queue', 'approved', 'scheduled', 'published', 'update_required', 'archived')),
  constraint editorial_fact_check check (fact_check_status in ('pending', 'passed', 'failed', 'needs_review')),
  constraint editorial_approval check (editorial_approval_status in ('pending', 'approved', 'rejected', 'not_required')),
  constraint editorial_article_publish_pair check ((status <> 'published') or published_at is not null),
  constraint editorial_article_archive_pair check ((status <> 'archived') or archived_at is not null)
);

create table editorial.article_sources (
  article_id uuid not null references editorial.articles(id) on delete cascade,
  source_id uuid not null references editorial.sources(id) on delete restrict,
  purpose text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (article_id, source_id),
  constraint editorial_article_source_purpose check (char_length(purpose) between 3 and 240)
);

create table editorial.claims (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references editorial.articles(id) on delete cascade,
  source_id uuid references editorial.sources(id) on delete restrict,
  claim_text text not null,
  claim_type text not null,
  status text not null default 'pending',
  requires_editorial_review boolean not null default true,
  evidence_note text,
  checked_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint editorial_claim_type check (claim_type in ('salary', 'tax', 'legal', 'company', 'employment', 'data', 'methodology')),
  constraint editorial_claim_status check (status in ('pending', 'verified', 'rejected')),
  constraint editorial_claim_evidence check (status <> 'verified' or (source_id is not null and checked_at is not null))
);

create table editorial.live_job_blocks (
  id uuid primary key default gen_random_uuid(),
  block_key text not null unique,
  article_id uuid references editorial.articles(id) on delete cascade,
  query_spec jsonb not null,
  max_jobs smallint not null default 12,
  status text not null default 'stale',
  last_revalidated_at timestamptz,
  expires_at timestamptz,
  active_job_count integer not null default 0,
  last_snapshot_id uuid references editorial.data_snapshots(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint editorial_block_key check (block_key ~ '^[a-z0-9_]+$'),
  constraint editorial_block_query check (jsonb_typeof(query_spec) = 'object'),
  constraint editorial_block_max check (max_jobs between 1 and 50),
  constraint editorial_block_status check (status in ('fresh', 'empty', 'stale', 'degraded')),
  constraint editorial_block_count check (active_job_count >= 0)
);

create table editorial.link_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references editorial.sources(id) on delete cascade,
  article_id uuid references editorial.articles(id) on delete cascade,
  url text not null,
  checked_at timestamptz not null default clock_timestamp(),
  status text not null,
  http_status integer,
  final_url text,
  error_code text,
  unique (url, checked_at),
  constraint editorial_link_target check (source_id is not null or article_id is not null),
  constraint editorial_link_https check (url ~* '^https://'),
  constraint editorial_link_status check (status in ('healthy', 'redirected', 'broken', 'timeout')),
  constraint editorial_link_error check (error_code is null or error_code ~ '^[a-z0-9_]{2,80}$')
);

create table editorial.audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_kind text not null,
  article_id uuid references editorial.articles(id) on delete cascade,
  severity text not null,
  code text not null,
  detail text not null,
  status text not null default 'open',
  detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (audit_kind, article_id, code, status),
  constraint editorial_audit_kind check (audit_kind in ('preflight', 'nightly', 'weekly')),
  constraint editorial_audit_severity check (severity in ('info', 'warning', 'critical')),
  constraint editorial_audit_code check (code ~ '^[a-z0-9_]{2,80}$'),
  constraint editorial_audit_status check (status in ('open', 'resolved', 'dismissed'))
);

create table editorial.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  task_key text not null,
  run_key text not null,
  severity text not null default 'warning',
  error_code text not null,
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  unique (task_key, run_key, error_code),
  constraint editorial_alert_severity check (severity in ('warning', 'critical')),
  constraint editorial_alert_status check (status in ('open', 'acknowledged', 'resolved')),
  constraint editorial_alert_summary check (jsonb_typeof(summary) = 'object')
);

create index editorial_articles_public on editorial.articles (published_at desc) where status = 'published';
create index editorial_articles_queue on editorial.articles (status, scheduled_for, updated_at);
create index editorial_sources_health on editorial.sources (link_status, last_checked_at);
create index editorial_findings_open on editorial.audit_findings (severity, detected_at desc) where status = 'open';

alter table editorial.topic_candidates enable row level security;
alter table editorial.topic_candidates force row level security;
alter table editorial.sources enable row level security;
alter table editorial.sources force row level security;
alter table editorial.data_snapshots enable row level security;
alter table editorial.data_snapshots force row level security;
alter table editorial.articles enable row level security;
alter table editorial.articles force row level security;
alter table editorial.article_sources enable row level security;
alter table editorial.article_sources force row level security;
alter table editorial.claims enable row level security;
alter table editorial.claims force row level security;
alter table editorial.live_job_blocks enable row level security;
alter table editorial.live_job_blocks force row level security;
alter table editorial.link_checks enable row level security;
alter table editorial.link_checks force row level security;
alter table editorial.audit_findings enable row level security;
alter table editorial.audit_findings force row level security;
alter table editorial.operational_alerts enable row level security;
alter table editorial.operational_alerts force row level security;

insert into private.worker_schedules (task_key, expected_interval, stale_after, owner_label) values
  ('editorial_job_snapshot', interval '24 hours', interval '27 hours', 'SalaryPadi editorial data owner'),
  ('editorial_topic_candidates', interval '24 hours', interval '27 hours', 'SalaryPadi managing editor'),
  ('editorial_draft', interval '24 hours', interval '27 hours', 'SalaryPadi managing editor'),
  ('editorial_preflight', interval '24 hours', interval '27 hours', 'SalaryPadi fact-check editor'),
  ('editorial_queue', interval '24 hours', interval '27 hours', 'SalaryPadi managing editor'),
  ('editorial_publish', interval '24 hours', interval '27 hours', 'SalaryPadi publishing editor'),
  ('editorial_live_blocks', interval '6 hours', interval '7 hours', 'SalaryPadi editorial data owner'),
  ('editorial_nightly_audit', interval '24 hours', interval '27 hours', 'SalaryPadi editorial operations owner'),
  ('editorial_weekly_audit', interval '7 days', interval '8 days', 'SalaryPadi SEO editor')
on conflict (task_key) do update set
  expected_interval = excluded.expected_interval,
  stale_after = excluded.stale_after,
  owner_label = excluded.owner_label,
  enabled = true,
  updated_at = clock_timestamp();

insert into editorial.topic_candidates (
  slug, title, topic_kind, search_intent, rationale, priority,
  evidence_requirements, internal_link_targets, generated_by, duplicate_key
) values
  ('remote-jobs-open-to-nigerians', 'Remote jobs open to Nigerians', 'cornerstone', 'remote jobs open to Nigerians', 'Evergreen entry point backed by active, eligibility-evidenced jobs.', 100, '["active job records", "country eligibility evidence", "source policy"]', array['/jobs/remote','/methodology','/tools/job-scam-checker'], 'launch_plan', 'remote-jobs-open-to-nigerians'),
  ('how-salarypadi-verifies-job-eligibility', 'How SalaryPadi verifies whether a job is open to Nigerians', 'cornerstone', 'job eligibility Nigeria', 'Explain the evidence contract without making vacancy claims.', 90, '["eligibility methodology", "source provenance"]', array['/methodology','/jobs/remote'], 'launch_plan', 'verify-job-eligibility'),
  ('how-to-check-a-remote-job-before-applying', 'How to check a remote job before applying', 'cornerstone', 'check remote job legitimacy', 'Safety-led application guide linked to the scam checker.', 89, '["official employer guidance", "SalaryPadi safety methodology"]', array['/tools/job-scam-checker','/trust-and-safety','/jobs'], 'launch_plan', 'check-remote-job'),
  ('read-a-job-description-for-country-restrictions', 'How to read a job description for country restrictions', 'cornerstone', 'remote job country restrictions', 'Teach candidates not to treat remote as worldwide.', 88, '["source examples without live vacancy prose", "eligibility methodology"]', array['/methodology','/jobs/remote'], 'launch_plan', 'country-restrictions'),
  ('salary-range-evidence-guide', 'How to assess salary range evidence in a job listing', 'cornerstone', 'job salary range evidence', 'Explain source-provided versus unknown pay without inventing benchmarks.', 87, '["salary methodology", "source-provided examples"]', array['/salaries','/methodology','/tools/offer-compare'], 'launch_plan', 'salary-range-evidence'),
  ('compare-job-offers-in-nigeria', 'How to compare job offers in Nigeria', 'cornerstone', 'compare job offers Nigeria', 'Connect compensation inputs to the deterministic comparison tool.', 86, '["reviewed tax sources", "tool methodology"]', array['/tools/offer-compare','/tools/take-home-pay','/salaries'], 'launch_plan', 'compare-offers-nigeria'),
  ('job-application-safety-checklist', 'Job application safety checklist', 'cornerstone', 'job application safety checklist', 'Practical no-statistics checklist for applicants.', 85, '["official fraud guidance", "SalaryPadi safety policy"]', array['/trust-and-safety','/tools/job-scam-checker'], 'launch_plan', 'application-safety'),
  ('understand-employment-types', 'Employee, contractor and freelance roles explained', 'cornerstone', 'employee contractor freelance difference', 'Clarify engagement labels; legal claims require review.', 84, '["reviewed employment sources", "jurisdiction caveat"]', array['/jobs','/methodology'], 'launch_plan', 'employment-types'),
  ('research-a-company-before-applying', 'How to research a company before applying', 'cornerstone', 'research company before applying', 'Use company evidence and source links without unsupported claims.', 83, '["company primary sources", "verification methodology"]', array['/companies','/trust-and-safety'], 'launch_plan', 'research-company'),
  ('build-a-source-aware-job-search', 'Build a source-aware job search', 'cornerstone', 'job search sources', 'Help users track provenance, freshness and deadlines.', 82, '["SalaryPadi source policy", "job freshness methodology"]', array['/jobs','/methodology'], 'launch_plan', 'source-aware-search'),
  ('job-deadlines-and-expiry', 'Job deadlines, expiry and missing listings explained', 'cornerstone', 'job listing expired meaning', 'Explain conservative lifecycle behavior.', 81, '["SalaryPadi lifecycle policy"]', array['/methodology','/jobs'], 'launch_plan', 'job-expiry'),
  ('save-and-track-job-applications', 'How to save and track job applications', 'cornerstone', 'track job applications', 'First-party workflow guide with no outcome claims.', 80, '["SalaryPadi product behavior"]', array['/saved','/applications','/jobs'], 'launch_plan', 'track-applications'),
  ('job-alerts-without-duplicates', 'How SalaryPadi job alerts avoid duplicates', 'cornerstone', 'job alerts duplicates', 'Explain idempotent alert matching and source restrictions.', 79, '["SalaryPadi alert methodology"]', array['/alerts','/methodology'], 'launch_plan', 'alerts-without-duplicates'),
  ('active-remote-jobs-nigeria-snapshot', 'Active remote jobs open to Nigerians: data snapshot', 'data_brief', 'active remote jobs Nigeria data', 'Deterministic count-only brief from a timestamped active-job snapshot.', 99, '["fresh active-job snapshot"]', array['/guides/remote-jobs-open-to-nigerians','/jobs/remote'], 'launch_plan', 'data-active-remote'),
  ('job-source-freshness-snapshot', 'SalaryPadi job source freshness snapshot', 'data_brief', 'SalaryPadi job freshness', 'Deterministic source-health brief without provider claims.', 98, '["fresh source-health snapshot"]', array['/methodology','/jobs'], 'launch_plan', 'data-source-freshness'),
  ('nigeria-eligibility-evidence-snapshot', 'Nigeria eligibility evidence in active jobs: data snapshot', 'data_brief', 'Nigeria job eligibility data', 'Deterministic breakdown of explicit versus unclear evidence.', 97, '["fresh eligibility snapshot"]', array['/jobs/remote','/methodology'], 'launch_plan', 'data-eligibility'),
  ('active-job-deadline-snapshot', 'Active job deadlines and expiry: data snapshot', 'data_brief', 'active job deadlines data', 'Deterministic deadline coverage from active records.', 96, '["fresh active-job snapshot"]', array['/jobs','/methodology'], 'launch_plan', 'data-deadlines')
on conflict (slug) do nothing;

insert into editorial.sources (
  canonical_url, title, publisher, source_type, link_status, http_status,
  review_required, terms_reviewed_at, licence_note
) values (
  'https://salarypadi.com/methodology', 'SalaryPadi methodology', 'SalaryPadi',
  'internal', 'healthy', 200, false, clock_timestamp(),
  'First-party methodology; revisions are reviewed through the editorial workflow.'
) on conflict (canonical_url) do nothing;

create or replace function api.editorial_capture_job_snapshot(
  p_snapshot_key text,
  p_source_checked_at timestamptz,
  p_metrics jsonb,
  p_source_summary jsonb,
  p_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform security.require_service_role();
  if p_snapshot_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$'
     or p_source_checked_at is null
     or p_source_checked_at > clock_timestamp() + interval '5 minutes'
     or jsonb_typeof(p_metrics) <> 'object'
     or jsonb_typeof(p_source_summary) <> 'object'
     or p_content_hash !~ '^[a-f0-9]{64}$'
     or coalesce((p_metrics->>'active_jobs')::integer, -1) < 0 then
    raise exception using errcode = '22023', message = 'invalid editorial snapshot';
  end if;
  insert into editorial.data_snapshots (
    snapshot_key, source_checked_at, metrics, source_summary, content_hash
  ) values (p_snapshot_key, p_source_checked_at, p_metrics, p_source_summary, p_content_hash)
  on conflict (snapshot_key) do update set
    source_checked_at = excluded.source_checked_at,
    metrics = excluded.metrics,
    source_summary = excluded.source_summary,
    content_hash = excluded.content_hash
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function api.editorial_generate_topic_candidates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected integer := 0;
begin
  perform security.require_service_role();
  update editorial.topic_candidates c
  set status = 'selected', updated_at = clock_timestamp(), admin_version = admin_version + 1
  where c.id = (
    select x.id from editorial.topic_candidates x
    where x.status = 'queued'
      and not exists (select 1 from editorial.articles a where a.candidate_id = x.id)
    order by x.priority desc, x.created_at, x.id limit 1
    for update skip locked
  );
  get diagnostics v_selected = row_count;
  return jsonb_build_object('selected', v_selected, 'queued', (
    select count(*) from editorial.topic_candidates where status = 'queued'
  ));
end;
$$;

create or replace function api.editorial_prepare_one_draft()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate editorial.topic_candidates%rowtype;
  v_snapshot editorial.data_snapshots%rowtype;
  v_article_id uuid;
  v_body text;
begin
  perform security.require_service_role();
  select * into v_candidate from editorial.topic_candidates c
  where c.status = 'selected'
    and not exists (select 1 from editorial.articles a where a.candidate_id = c.id)
  order by c.priority desc, c.created_at, c.id limit 1 for update skip locked;
  if not found then return jsonb_build_object('drafted', 0, 'reason', 'no_selected_candidate'); end if;

  select * into v_snapshot from editorial.data_snapshots
  order by captured_at desc, id desc limit 1;
  if v_candidate.topic_kind = 'data_brief' and v_snapshot.id is null then
    return jsonb_build_object('drafted', 0, 'reason', 'fresh_snapshot_required');
  end if;

  if v_candidate.topic_kind = 'data_brief' then
    v_body := 'Snapshot time: ' || to_char(v_snapshot.source_checked_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC') || E'\n\n'
      || 'Active jobs: ' || coalesce(v_snapshot.metrics->>'active_jobs', '0') || E'.\n\n'
      || 'Jobs with explicit Nigeria eligibility evidence: ' || coalesce(v_snapshot.metrics->>'nigeria_eligible', '0') || E'.\n\n'
      || 'Jobs with unclear Nigeria eligibility: ' || coalesce(v_snapshot.metrics->>'nigeria_unclear', '0') || E'.\n\n'
      || 'This is a deterministic snapshot, not a forecast or a claim of market completeness. Openings can change after the snapshot time.';
  else
    v_body := 'Editorial draft outline. This guide must not be published until every substantive claim has a source record, fact-check status, and editorial approval.'
      || E'\n\n## Reader question\n' || v_candidate.search_intent
      || E'\n\n## Evidence required\n' || v_candidate.evidence_requirements::text
      || E'\n\n## Internal routes\n' || array_to_string(v_candidate.internal_link_targets, ', ');
  end if;

  insert into editorial.articles (
    candidate_id, snapshot_id, slug, title, description, article_kind,
    body_markdown, deterministic, internal_link_targets, next_review_at
  ) values (
    v_candidate.id, case when v_candidate.topic_kind = 'data_brief' then v_snapshot.id else null end,
    v_candidate.slug, v_candidate.title, v_candidate.rationale, v_candidate.topic_kind,
    v_body, v_candidate.topic_kind = 'data_brief', v_candidate.internal_link_targets,
    clock_timestamp() + case when v_candidate.topic_kind = 'data_brief' then interval '1 day' else interval '90 days' end
  ) returning id into v_article_id;

  insert into editorial.article_sources (article_id, source_id, purpose)
  select v_article_id, s.id, 'SalaryPadi methodology and data provenance'
  from editorial.sources s where s.canonical_url = 'https://salarypadi.com/methodology';

  update editorial.topic_candidates set status = 'drafted', updated_at = clock_timestamp(),
    admin_version = admin_version + 1 where id = v_candidate.id;
  return jsonb_build_object('drafted', 1, 'article_id', v_article_id, 'kind', v_candidate.topic_kind);
end;
$$;

create or replace function api.editorial_run_preflight_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passed integer := 0;
  v_needs_review integer := 0;
begin
  perform security.require_service_role();
  delete from editorial.audit_findings where audit_kind = 'preflight' and status = 'open';

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', a.id, 'critical', 'possible_pii', 'Draft contains an email address, phone-like sequence, or private-key marker.'
  from editorial.articles a
  where a.status in ('draft','fact_check') and (
    a.body_markdown ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or a.body_markdown ~ '(^|[^0-9])[0-9]{10,14}([^0-9]|$)'
    or a.body_markdown ~* 'BEGIN [A-Z ]*PRIVATE KEY'
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', a.id, 'critical', 'unverified_claim', 'One or more claims are not verified against a source record.'
  from editorial.articles a
  where a.status in ('draft','fact_check') and exists (
    select 1 from editorial.claims c where c.article_id = a.id and c.status <> 'verified'
  ) on conflict do nothing;

  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'preflight', a.id, 'warning', 'fresh_snapshot_required', 'Deterministic data brief is missing a snapshot newer than 25 hours.'
  from editorial.articles a left join editorial.data_snapshots s on s.id = a.snapshot_id
  where a.status in ('draft','fact_check') and a.article_kind = 'data_brief'
    and (s.id is null or s.source_checked_at < clock_timestamp() - interval '25 hours')
  on conflict do nothing;

  update editorial.articles a set
    status = 'fact_check',
    fact_check_status = case when exists (
      select 1 from editorial.audit_findings f where f.article_id = a.id and f.audit_kind = 'preflight' and f.status = 'open'
    ) then 'needs_review' else 'passed' end,
    editorial_approval_status = case when a.deterministic and not exists (
      select 1 from editorial.claims c where c.article_id = a.id and c.requires_editorial_review
    ) then 'not_required' else a.editorial_approval_status end,
    updated_at = clock_timestamp(), admin_version = admin_version + 1
  where a.status in ('draft','fact_check');
  get diagnostics v_needs_review = row_count;
  select count(*) into v_passed from editorial.articles where status = 'fact_check' and fact_check_status = 'passed';
  return jsonb_build_object('checked', v_needs_review, 'passed', v_passed);
end;
$$;

create or replace function api.editorial_queue_ready()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  update editorial.articles set status = 'editorial_queue', scheduled_for = (
      date_trunc('day', clock_timestamp() at time zone 'Africa/Lagos') + interval '8 hours'
    ) at time zone 'Africa/Lagos',
    updated_at = clock_timestamp(), admin_version = admin_version + 1
  where status = 'fact_check' and fact_check_status = 'passed';
  get diagnostics v_count = row_count;
  return jsonb_build_object('queued', v_count);
end;
$$;

create or replace function api.editorial_publish_due()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  update editorial.articles a set status = 'published', published_at = coalesce(published_at, clock_timestamp()),
    last_content_review_at = clock_timestamp(), updated_at = clock_timestamp(), admin_version = admin_version + 1
  where a.status in ('editorial_queue','approved','scheduled')
    and coalesce(a.scheduled_for, clock_timestamp()) <= clock_timestamp()
    and a.fact_check_status = 'passed'
    and (
      (a.article_kind = 'data_brief' and a.deterministic and a.editorial_approval_status = 'not_required'
       and exists (select 1 from editorial.data_snapshots s where s.id = a.snapshot_id and s.source_checked_at >= clock_timestamp() - interval '25 hours'))
      or a.editorial_approval_status = 'approved'
    )
    and not exists (select 1 from editorial.claims c where c.article_id = a.id and c.status <> 'verified');
  get diagnostics v_count = row_count;
  return jsonb_build_object('published', v_count);
end;
$$;

create or replace function api.editorial_revalidate_live_blocks(
  p_snapshot_id uuid,
  p_checked_at timestamptz,
  p_active_job_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  if p_checked_at is null or p_active_job_count < 0 or not exists (
    select 1 from editorial.data_snapshots where id = p_snapshot_id
  ) then raise exception using errcode = '22023', message = 'invalid live block snapshot'; end if;
  update editorial.live_job_blocks set last_snapshot_id = p_snapshot_id,
    last_revalidated_at = p_checked_at, expires_at = p_checked_at + interval '6 hours 15 minutes',
    active_job_count = p_active_job_count,
    status = case when p_active_job_count > 0 then 'fresh' else 'empty' end,
    updated_at = clock_timestamp();
  get diagnostics v_count = row_count;
  return jsonb_build_object('revalidated', v_count, 'active_jobs', p_active_job_count);
end;
$$;

create or replace function api.editorial_link_targets()
returns table (source_id uuid, article_id uuid, url text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, null::uuid, s.canonical_url from editorial.sources s
  union all
  select null::uuid, a.id, x.url
  from editorial.articles a cross join lateral unnest(a.internal_link_targets) x(url)
  where x.url ~* '^https://'
$$;

create or replace function api.editorial_record_link_checks(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 100 then
    raise exception using errcode = '22023', message = 'invalid link check results';
  end if;
  insert into editorial.link_checks (source_id, article_id, url, status, http_status, final_url, error_code)
  select x.source_id, x.article_id, x.url, x.status, x.http_status, x.final_url, x.error_code
  from jsonb_to_recordset(p_results) x(source_id uuid, article_id uuid, url text, status text, http_status integer, final_url text, error_code text)
  where x.url ~* '^https://' and x.status in ('healthy','redirected','broken','timeout');
  get diagnostics v_count = row_count;
  update editorial.sources s set last_checked_at = c.checked_at, link_status = c.status,
    http_status = c.http_status, updated_at = clock_timestamp()
  from (
    select distinct on (source_id) source_id, checked_at, status, http_status
    from editorial.link_checks where source_id is not null order by source_id, checked_at desc
  ) c where s.id = c.source_id;
  return v_count;
end;
$$;

create or replace function api.editorial_run_nightly_audit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broken integer;
  v_stale integer;
begin
  perform security.require_service_role();
  update editorial.live_job_blocks set status = 'stale', updated_at = clock_timestamp()
  where expires_at < clock_timestamp() and status <> 'stale';
  get diagnostics v_stale = row_count;
  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'nightly', a.id, 'critical', 'broken_source_link', 'A cited source or article link failed its most recent check.'
  from editorial.articles a join editorial.article_sources ax on ax.article_id = a.id
  join editorial.sources s on s.id = ax.source_id
  where a.status = 'published' and s.link_status in ('broken','stale')
  on conflict do nothing;
  get diagnostics v_broken = row_count;
  update editorial.articles a set status = 'update_required', updated_at = clock_timestamp(), admin_version = admin_version + 1
  where a.status = 'published' and exists (
    select 1 from editorial.audit_findings f where f.article_id = a.id and f.audit_kind = 'nightly' and f.status = 'open' and f.severity = 'critical'
  );
  return jsonb_build_object('broken_findings', v_broken, 'stale_blocks', v_stale);
end;
$$;

create or replace function api.editorial_run_weekly_audit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'weekly', a.id, 'warning', 'thin_cornerstone', 'Published cornerstone contains fewer than 600 whitespace-separated words.'
  from editorial.articles a where a.status = 'published' and a.article_kind = 'cornerstone'
    and array_length(regexp_split_to_array(btrim(a.body_markdown), '\s+'), 1) < 600
  on conflict do nothing;
  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'weekly', a.id, 'warning', 'orphan_article', 'Published article has no recorded internal link targets.'
  from editorial.articles a where a.status = 'published' and cardinality(a.internal_link_targets) = 0
  on conflict do nothing;
  insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
  select 'weekly', a.id, 'warning', 'possible_cannibalization', 'Another published article has the same normalized title.'
  from editorial.articles a where a.status = 'published' and exists (
    select 1 from editorial.articles b where b.status = 'published' and b.id <> a.id and lower(b.title) = lower(a.title)
  ) on conflict do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('new_findings', v_count, 'open_findings', (select count(*) from editorial.audit_findings where status = 'open'));
end;
$$;

create or replace function api.editorial_record_failure(
  p_task_key text, p_run_key text, p_error_code text, p_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform security.require_service_role();
  if p_task_key !~ '^editorial_[a-z0-9_]+$' or p_error_code !~ '^[a-z0-9_]{2,80}$'
    or jsonb_typeof(p_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid editorial failure';
  end if;
  insert into editorial.operational_alerts (task_key, run_key, severity, error_code, summary)
  values (p_task_key, left(p_run_key,160), 'critical', p_error_code, p_summary)
  on conflict (task_key, run_key, error_code) do update set summary = excluded.summary
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function api.list_published_editorial()
returns table (
  id uuid, slug text, title text, description text, article_kind text,
  body_markdown text, author_name text, published_at timestamptz,
  updated_at timestamptz, internal_link_targets text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.description, a.article_kind, a.body_markdown,
    a.author_name, a.published_at, a.updated_at, a.internal_link_targets
  from editorial.articles a where a.status = 'published'
    and (a.next_review_at is null or a.next_review_at > clock_timestamp())
  order by a.published_at desc, a.id desc
$$;

create or replace function api.admin_list_editorial()
returns table (id uuid, title text, secondary text, status text, updated_at timestamptz, version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not security.has_staff_role('admin') or not security.is_aal2() then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  return query select a.id, a.title,
    (a.article_kind || ' | fact-check: ' || a.fact_check_status || ' | approval: ' || a.editorial_approval_status)::text,
    a.status, a.updated_at, a.admin_version
  from editorial.articles a order by
    case a.status when 'editorial_queue' then 0 when 'fact_check' then 1 when 'draft' then 2 else 3 end,
    a.updated_at desc;
end;
$$;

create or replace function api.transition_editorial(
  p_article_id uuid, p_expected_version integer, p_action text, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_article editorial.articles%rowtype;
begin
  if not security.has_staff_role('admin') or not security.is_aal2() then
    raise exception using errcode = '42501', message = 'admin role and AAL2 required';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'editorial reason required';
  end if;
  select * into v_article from editorial.articles where id = p_article_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'article not found'; end if;
  if v_article.admin_version <> p_expected_version then raise exception using errcode = '40001', message = 'stale editorial version'; end if;
  if p_action = 'approve' then
    if v_article.fact_check_status <> 'passed' or v_article.status not in ('fact_check','editorial_queue')
      or exists (select 1 from editorial.claims where article_id = p_article_id and status <> 'verified') then
      raise exception using errcode = '23514', message = 'fact-check and evidence gates failed';
    end if;
    update editorial.articles set status = 'approved', editorial_approval_status = 'approved',
      updated_at = clock_timestamp(), admin_version = admin_version + 1 where id = p_article_id;
  elsif p_action = 'schedule' then
    if v_article.editorial_approval_status <> 'approved' then raise exception using errcode = '23514', message = 'approval required'; end if;
    update editorial.articles set status = 'scheduled', scheduled_for = greatest(clock_timestamp(), coalesce(scheduled_for, clock_timestamp())),
      updated_at = clock_timestamp(), admin_version = admin_version + 1 where id = p_article_id;
  elsif p_action = 'publish' then
    if v_article.fact_check_status <> 'passed' or v_article.editorial_approval_status <> 'approved' then
      raise exception using errcode = '23514', message = 'approval required';
    end if;
    update editorial.articles set status = 'published', published_at = coalesce(published_at, clock_timestamp()),
      last_content_review_at = clock_timestamp(), updated_at = clock_timestamp(), admin_version = admin_version + 1 where id = p_article_id;
  elsif p_action = 'request_update' then
    update editorial.articles set status = 'update_required', updated_at = clock_timestamp(), admin_version = admin_version + 1 where id = p_article_id;
  elsif p_action = 'archive' then
    update editorial.articles set status = 'archived', archived_at = clock_timestamp(), updated_at = clock_timestamp(), admin_version = admin_version + 1 where id = p_article_id;
  else raise exception using errcode = '22023', message = 'unsupported editorial action'; end if;
  perform audit.write_event(
    'staff', 'editorial_' || p_action, 'editorial_article', p_article_id,
    p_action, jsonb_build_object('status', v_article.status),
    (select to_jsonb(a) - 'body_markdown' from editorial.articles a where a.id = p_article_id),
    array['status'], null, null, jsonb_build_object('reason', p_reason)
  );
  return true;
end;
$$;

insert into editorial.live_job_blocks (block_key, query_spec, max_jobs)
values ('remote_jobs_open_to_nigerians', '{"active":true,"work_mode":"remote","nigeria_eligibility":"eligible","source_indexing_permitted":true}', 12)
on conflict (block_key) do nothing;

revoke all on schema editorial from public, anon, authenticated;
revoke all on all tables in schema editorial from public, anon, authenticated;
revoke all on function api.editorial_capture_job_snapshot(text,timestamptz,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function api.editorial_generate_topic_candidates() from public, anon, authenticated;
revoke all on function api.editorial_prepare_one_draft() from public, anon, authenticated;
revoke all on function api.editorial_run_preflight_checks() from public, anon, authenticated;
revoke all on function api.editorial_queue_ready() from public, anon, authenticated;
revoke all on function api.editorial_publish_due() from public, anon, authenticated;
revoke all on function api.editorial_revalidate_live_blocks(uuid,timestamptz,integer) from public, anon, authenticated;
revoke all on function api.editorial_link_targets() from public, anon, authenticated;
revoke all on function api.editorial_record_link_checks(jsonb) from public, anon, authenticated;
revoke all on function api.editorial_run_nightly_audit() from public, anon, authenticated;
revoke all on function api.editorial_run_weekly_audit() from public, anon, authenticated;
revoke all on function api.editorial_record_failure(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function api.list_published_editorial() from public;
revoke all on function api.admin_list_editorial() from public, anon;
revoke all on function api.transition_editorial(uuid,integer,text,text) from public, anon;

grant execute on function api.editorial_capture_job_snapshot(text,timestamptz,jsonb,jsonb,text) to service_role;
grant execute on function api.editorial_generate_topic_candidates() to service_role;
grant execute on function api.editorial_prepare_one_draft() to service_role;
grant execute on function api.editorial_run_preflight_checks() to service_role;
grant execute on function api.editorial_queue_ready() to service_role;
grant execute on function api.editorial_publish_due() to service_role;
grant execute on function api.editorial_revalidate_live_blocks(uuid,timestamptz,integer) to service_role;
grant execute on function api.editorial_link_targets() to service_role;
grant execute on function api.editorial_record_link_checks(jsonb) to service_role;
grant execute on function api.editorial_run_nightly_audit() to service_role;
grant execute on function api.editorial_run_weekly_audit() to service_role;
grant execute on function api.editorial_record_failure(text,text,text,jsonb) to service_role;
grant execute on function api.list_published_editorial() to anon, authenticated, service_role;
grant execute on function api.admin_list_editorial() to authenticated;
grant execute on function api.transition_editorial(uuid,integer,text,text) to authenticated;

comment on table editorial.articles is 'Review-first editorial records. Only deterministic data briefs with fresh snapshots can auto-publish.';
comment on table editorial.data_snapshots is 'Timestamped, description-free aggregate evidence derived from active SalaryPadi job records.';
comment on table editorial.claims is 'Every substantive claim is separately checked; salary, tax, legal, company, and employment claims require editorial review.';
