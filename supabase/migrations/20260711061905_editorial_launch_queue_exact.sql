-- Keep the requested launch package exact: 12 cornerstone guides and four
-- deterministic data briefs. Product-help content can be proposed later.
delete from editorial.topic_candidates
where slug = 'save-and-track-job-applications'
  and topic_kind = 'cornerstone'
  and status in ('queued', 'selected')
  and not exists (
    select 1 from editorial.articles a
    where a.candidate_id = editorial.topic_candidates.id
  );
