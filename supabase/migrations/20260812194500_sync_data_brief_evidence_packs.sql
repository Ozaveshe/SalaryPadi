-- A refreshed deterministic brief must carry an evidence pack for the same
-- snapshot. Early launch briefs predated the evidence-pack trigger, so merely
-- refreshing their article row left preflight correctly blocked.

create or replace function security.sync_data_brief_evidence_pack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.article_kind = 'data_brief'
     and new.deterministic
     and new.candidate_id is not null
     and new.snapshot_id is not null
     and new.snapshot_id is distinct from old.snapshot_id then
    insert into editorial.evidence_packs (
      candidate_id,
      snapshot_id,
      signal_summary,
      source_summary,
      claim_constraints,
      status
    ) values (
      new.candidate_id,
      new.snapshot_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', signal.signal_kind,
          'key', signal.signal_key,
          'window_start', signal.window_start,
          'window_end', signal.window_end,
          'impressions', signal.impressions,
          'clicks', signal.clicks,
          'product_events', signal.product_events,
          'checked_at', signal.source_checked_at
        ) order by signal.source_checked_at desc)
        from (
          select * from editorial.topic_signals
          where source_checked_at >= clock_timestamp() - interval '90 days'
          order by source_checked_at desc
          limit 30
        ) signal
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'source_id', source.id,
          'canonical_url', source.canonical_url,
          'publisher', source.publisher,
          'last_checked_at', source.last_checked_at,
          'link_status', source.link_status
        ) order by source.canonical_url)
        from editorial.sources source
        where source.link_status in ('healthy', 'redirected')
      ), '[]'::jsonb),
      '["No claim without a cited source or reproducible snapshot.","PII and private contribution text are prohibited.","Tax, salary, legal, employer and workplace claims require human approval.","Copyrighted third-party prose must not be copied or paraphrased."]'::jsonb,
      'draft'
    )
    on conflict (candidate_id) do update
    set snapshot_id = excluded.snapshot_id,
      signal_summary = excluded.signal_summary,
      source_summary = excluded.source_summary,
      claim_constraints = excluded.claim_constraints,
      status = 'draft',
      prepared_at = clock_timestamp(),
      reviewed_at = null,
      reviewed_by = null,
      updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists editorial_articles_sync_data_brief_evidence_pack
  on editorial.articles;
create trigger editorial_articles_sync_data_brief_evidence_pack
before update of snapshot_id on editorial.articles
for each row execute function security.sync_data_brief_evidence_pack();

insert into editorial.evidence_packs (
  candidate_id,
  snapshot_id,
  signal_summary,
  source_summary,
  claim_constraints,
  status
)
select
  article.candidate_id,
  article.snapshot_id,
  '[]'::jsonb,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'source_id', source.id,
      'canonical_url', source.canonical_url,
      'publisher', source.publisher,
      'last_checked_at', source.last_checked_at,
      'link_status', source.link_status
    ) order by source.canonical_url)
    from editorial.sources source
    where source.link_status in ('healthy', 'redirected')
  ), '[]'::jsonb),
  '["No claim without a cited source or reproducible snapshot.","PII and private contribution text are prohibited.","Tax, salary, legal, employer and workplace claims require human approval.","Copyrighted third-party prose must not be copied or paraphrased."]'::jsonb,
  'draft'
from editorial.articles article
where article.article_kind = 'data_brief'
  and article.deterministic
  and article.candidate_id is not null
  and article.snapshot_id is not null
on conflict (candidate_id) do nothing;

revoke all on function security.sync_data_brief_evidence_pack()
  from public, anon, authenticated, service_role;

comment on function security.sync_data_brief_evidence_pack() is
  'Keeps a deterministic brief evidence pack aligned with its refreshed snapshot. Internal only.';
