begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, editorial, security;
select plan(10);

-- Synthetic editorial fixtures exist only inside this rolled-back test.
insert into editorial.data_snapshots (
  id, snapshot_key, source_checked_at, metrics, source_summary, content_hash
) values (
  '00000000-0000-4000-8000-000000000126', '2099-01-01T00:00Z',
  clock_timestamp(),
  '{"active_jobs":10,"indexable_jobs":8,"nigeria_eligible":6,"nigeria_unclear":4}',
  '{}', repeat('a', 64)
);

insert into editorial.articles (
  id, slug, title, description, article_kind, body_markdown,
  status, deterministic, next_review_at
) values (
  '00000000-0000-4000-8000-000000000127', 'active-job-deadline-snapshot',
  'Synthetic audit history fixture', 'Local regression fixture', 'data_brief',
  'Previous snapshot', 'update_required', true, clock_timestamp() - interval '1 day'
);

insert into editorial.audit_findings (
  audit_kind, article_id, severity, code, detail, status, resolved_at
)
select 'nightly', '00000000-0000-4000-8000-000000000127'::uuid,
  'warning', code, 'Synthetic recurring finding', status,
  case when status = 'resolved' then '2026-01-01T00:00:00Z'::timestamptz end
from unnest(array['fresh_snapshot_required', 'review_overdue', 'possible_duplicate']) code
cross join unnest(array['open', 'resolved']) status;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$select api.editorial_prepare_one_draft()$$,
  'the real draft refresh resolves recurring findings without a unique conflict'
);
select is(
  (select status from editorial.articles where id = '00000000-0000-4000-8000-000000000127'),
  'draft', 'refresh keeps the article behind the publication gate'
);
select is(
  (select snapshot_id from editorial.articles where id = '00000000-0000-4000-8000-000000000127'),
  '00000000-0000-4000-8000-000000000126'::uuid,
  'the refreshed draft uses the fresh snapshot'
);
select is(
  (select count(*)::integer from editorial.audit_findings
   where article_id = '00000000-0000-4000-8000-000000000127' and status = 'resolved'),
  6, 'all three prior and newly resolved findings remain as history'
);
select is(
  (select count(*)::integer from editorial.audit_findings
   where article_id = '00000000-0000-4000-8000-000000000127' and status = 'open'),
  0, 'refresh resolves all three applicable open findings'
);
select is(
  (select count(*)::integer from editorial.audit_findings
   where article_id = '00000000-0000-4000-8000-000000000127'
     and resolved_at = '2026-01-01T00:00:00Z'::timestamptz),
  3, 'prior resolution timestamps are not rewritten or deleted'
);

insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
values ('nightly', '00000000-0000-4000-8000-000000000127',
  'warning', 'fresh_snapshot_required', 'Synthetic next occurrence');

select throws_ok(
  $$insert into editorial.audit_findings (audit_kind, article_id, severity, code, detail)
    values ('nightly', '00000000-0000-4000-8000-000000000127',
      'warning', 'fresh_snapshot_required', 'Synthetic duplicate open occurrence')$$,
  '23505', null, 'duplicate open findings still fail the uniqueness gate'
);
select is(
  (select count(*)::integer from editorial.audit_findings
   where article_id = '00000000-0000-4000-8000-000000000127' and status = 'open'),
  1, 'the rejected duplicate cannot create a second open finding'
);

update editorial.articles set status = 'update_required', snapshot_id = null
where id = '00000000-0000-4000-8000-000000000127';
select lives_ok(
  $$select api.editorial_prepare_one_draft()$$,
  'a later draft refresh can resolve the same finding again'
);
select is(
  (select count(*)::integer from editorial.audit_findings
   where article_id = '00000000-0000-4000-8000-000000000127' and status = 'resolved'),
  7, 'the repeated refresh appends resolution history without losing prior evidence'
);

select * from finish();
rollback;
