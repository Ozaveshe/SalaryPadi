begin;

create or replace function security.remove_reported_content(
  p_kind private.report_target_kind,
  p_target text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer := 0; v_total integer := 0;
begin
  case p_kind
    when 'job' then
      update app.jobs
      set status = 'removed'
      where id::text = p_target or slug = p_target;
    when 'company' then
      update app.companies
      set record_status = 'removed', verification_status = 'suspended'
      where id::text = p_target or slug = p_target;
    when 'review' then
      update app.review_publications
      set publication_status = 'removed'
      where id::text = p_target;
    when 'interview' then
      update app.interview_publications
      set publication_status = 'removed'
      where id::text = p_target;
    when 'feed_post' then
      update community.feed_posts
      set status = 'removed', removed_at = clock_timestamp()
      where id::text = p_target and status = 'published';
    when 'forum_thread' then
      update community.forum_threads
      set status = 'removed', removed_at = clock_timestamp()
      where id::text = p_target and status = 'published';
    when 'forum_reply' then
      update community.forum_replies
      set status = 'removed', removed_at = clock_timestamp()
      where id::text = p_target and status = 'published';
  end case;
  get diagnostics v_changed = row_count;
  v_total := v_total + v_changed;
  return v_total > 0;
end;
$$;

revoke all on function security.remove_reported_content(private.report_target_kind, text)
from public, anon, authenticated;

commit;
