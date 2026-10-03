begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, editorial;
select plan(3);

-- Synthetic editorial fixtures in a rolled-back database test only.
insert into editorial.articles (id, slug, title, description, article_kind, body_markdown)
values ('ee000000-0000-4000-8000-000000000149', 'recurring-finding-fixture', 'Fixture', 'Fixture', 'cornerstone', 'Fixture');
insert into editorial.audit_findings (article_id, audit_kind, code, severity, detail, status, resolved_at)
values ('ee000000-0000-4000-8000-000000000149', 'preflight', 'fresh_snapshot_required', 'critical', 'Historical incident', 'resolved', now());
insert into editorial.audit_findings (article_id, audit_kind, code, severity, detail)
values ('ee000000-0000-4000-8000-000000000149', 'preflight', 'fresh_snapshot_required', 'critical', 'Recurring incident');
select lives_ok($$
  update editorial.audit_findings set status = 'resolved', resolved_at = now()
  where article_id = 'ee000000-0000-4000-8000-000000000149' and status = 'open'
$$, 'a repeat incident can resolve without colliding with history');
select is((select count(*)::integer from editorial.audit_findings where article_id = 'ee000000-0000-4000-8000-000000000149' and status = 'resolved'), 2, 'both resolved incidents retain their history');
insert into editorial.audit_findings (article_id, audit_kind, code, severity, detail)
values ('ee000000-0000-4000-8000-000000000149', 'preflight', 'fresh_snapshot_required', 'critical', 'Open incident');
select throws_ok($$
  insert into editorial.audit_findings (article_id, audit_kind, code, severity, detail)
  values ('ee000000-0000-4000-8000-000000000149', 'preflight', 'fresh_snapshot_required', 'critical', 'Duplicate open incident')
$$, '23505', null, 'duplicate open incidents remain blocked');
select * from finish();
rollback;
