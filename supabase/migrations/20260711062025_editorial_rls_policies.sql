-- Make the fail-closed direct-access boundary explicit for database linting.
-- Public editorial reads remain limited to a narrow security-invoker function.

create policy editorial_articles_public_read on editorial.articles
for select to anon, authenticated
using (
  status = 'published'
  and (next_review_at is null or next_review_at > clock_timestamp())
);

grant usage on schema editorial to anon, authenticated;
grant select (
  id, slug, title, description, article_kind, body_markdown, author_name,
  published_at, updated_at, internal_link_targets
) on editorial.articles to anon, authenticated;

alter function api.list_published_editorial() security invoker;

create policy editorial_topic_candidates_no_direct_access on editorial.topic_candidates
for all to anon, authenticated using (false) with check (false);
create policy editorial_sources_no_direct_access on editorial.sources
for all to anon, authenticated using (false) with check (false);
create policy editorial_snapshots_no_direct_access on editorial.data_snapshots
for all to anon, authenticated using (false) with check (false);
create policy editorial_article_sources_no_direct_access on editorial.article_sources
for all to anon, authenticated using (false) with check (false);
create policy editorial_claims_no_direct_access on editorial.claims
for all to anon, authenticated using (false) with check (false);
create policy editorial_live_blocks_no_direct_access on editorial.live_job_blocks
for all to anon, authenticated using (false) with check (false);
create policy editorial_link_checks_no_direct_access on editorial.link_checks
for all to anon, authenticated using (false) with check (false);
create policy editorial_audit_findings_no_direct_access on editorial.audit_findings
for all to anon, authenticated using (false) with check (false);
create policy editorial_operational_alerts_no_direct_access on editorial.operational_alerts
for all to anon, authenticated using (false) with check (false);
