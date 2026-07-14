begin;

-- Link targets expose unpublished editorial source and article metadata. Keep
-- the grant restriction and also assert the caller inside the SECURITY DEFINER
-- boundary so accidental future grants cannot turn this into a metadata leak.
create or replace function api.editorial_link_targets()
returns table (source_id uuid, article_id uuid, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();

  return query
  with targets as (
    select
      source.id as source_id,
      null::uuid as article_id,
      source.canonical_url as url,
      (
        select max(check_result.checked_at)
        from editorial.link_checks check_result
        where check_result.source_id = source.id
          and md5(check_result.url) = md5(source.canonical_url)
          and check_result.url = source.canonical_url
      ) as last_checked
    from editorial.sources source

    union all

    select distinct
      null::uuid as source_id,
      article.id as article_id,
      target.url,
      (
        select max(check_result.checked_at)
        from editorial.link_checks check_result
        where check_result.article_id = article.id
          and md5(check_result.url) = md5(target.url)
          and check_result.url = target.url
      ) as last_checked
    from editorial.articles article
    cross join lateral unnest(article.internal_link_targets) target(url)
    where target.url ~* '^https://'
  )
  select targets.source_id, targets.article_id, targets.url
  from targets
  order by targets.last_checked nulls first, targets.url,
    targets.source_id nulls last, targets.article_id nulls last
  limit 50;
end;
$$;

revoke all on function api.editorial_link_targets()
from public, anon, authenticated;
grant execute on function api.editorial_link_targets() to service_role;

commit;
