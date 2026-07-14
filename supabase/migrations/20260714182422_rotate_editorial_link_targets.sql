alter table editorial.link_checks
  drop constraint if exists link_checks_url_checked_at_key;

alter table editorial.link_checks
  add constraint editorial_link_target_exactly_one
  check ((source_id is null) <> (article_id is null)) not valid;

do $$
begin
  if not exists (
    select 1
    from editorial.link_checks
    where (source_id is null) = (article_id is null)
  ) then
    alter table editorial.link_checks
      validate constraint editorial_link_target_exactly_one;
  end if;
end;
$$;

create index if not exists editorial_link_checks_source_history
  on editorial.link_checks (source_id, md5(url), checked_at desc)
  where source_id is not null;

create index if not exists editorial_link_checks_article_history
  on editorial.link_checks (article_id, md5(url), checked_at desc)
  where article_id is not null;

create or replace function api.editorial_link_targets()
returns table (source_id uuid, article_id uuid, url text)
language sql
stable
security definer
set search_path = ''
as $$
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
  limit 50
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
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 50 then
    raise exception using errcode = '22023', message = 'invalid link check results';
  end if;

  insert into editorial.link_checks (
    source_id, article_id, url, status, http_status, final_url, error_code
  )
  select
    result.source_id, result.article_id, result.url, result.status,
    result.http_status, result.final_url, result.error_code
  from jsonb_to_recordset(p_results) result(
    source_id uuid, article_id uuid, url text, status text,
    http_status integer, final_url text, error_code text
  )
  where result.url ~* '^https://'
    and result.status in ('healthy', 'redirected', 'broken', 'timeout')
    and (result.http_status is null or result.http_status between 100 and 599)
    and (result.final_url is null or result.final_url ~* '^https://')
    and (
      (result.status in ('healthy', 'redirected') and result.error_code is null)
      or (result.status in ('broken', 'timeout')
        and result.error_code ~ '^[a-z0-9_]{2,80}$')
    )
    and (
      (
        result.source_id is not null and result.article_id is null
        and exists (
          select 1
          from editorial.sources source
          where source.id = result.source_id
            and source.canonical_url = result.url
        )
      )
      or (
        result.article_id is not null and result.source_id is null
        and exists (
          select 1
          from editorial.articles article
          where article.id = result.article_id
            and result.url = any(article.internal_link_targets)
        )
      )
    );
  get diagnostics v_count = row_count;

  update editorial.sources source
  set last_checked_at = latest.checked_at,
      link_status = case latest.status when 'timeout' then 'stale' else latest.status end,
      http_status = latest.http_status,
      updated_at = clock_timestamp()
  from (
    select distinct on (source_id)
      source_id, checked_at, status, http_status
    from editorial.link_checks
    where source_id is not null
    order by source_id, checked_at desc, id desc
  ) latest
  where source.id = latest.source_id;

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
  v_broken_source integer := 0;
  v_broken_internal integer := 0;
  v_unavailable_internal integer := 0;
  v_stale integer := 0;
begin
  perform security.require_service_role();

  update editorial.live_job_blocks
  set status = 'stale', updated_at = clock_timestamp()
  where expires_at < clock_timestamp() and status <> 'stale';
  get diagnostics v_stale = row_count;

  insert into editorial.audit_findings (
    audit_kind, article_id, severity, code, detail
  )
  select distinct
    'nightly', article.id, 'critical', 'broken_source_link',
    'A cited source failed its most recent check.'
  from editorial.articles article
  join editorial.article_sources article_source
    on article_source.article_id = article.id
  join editorial.sources source on source.id = article_source.source_id
  where article.status = 'published'
    and source.link_status in ('broken', 'stale')
  on conflict do nothing;
  get diagnostics v_broken_source = row_count;

  with latest as (
    select distinct on (check_result.article_id, check_result.url)
      check_result.article_id, check_result.url, check_result.status
    from editorial.link_checks check_result
    where check_result.article_id is not null
    order by check_result.article_id, check_result.url,
      check_result.checked_at desc, check_result.id desc
  )
  insert into editorial.audit_findings (
    audit_kind, article_id, severity, code, detail
  )
  select distinct
    'nightly', article.id, 'critical', 'broken_internal_link',
    'An internal article link failed its most recent check.'
  from editorial.articles article
  join latest on latest.article_id = article.id
  where article.status = 'published' and latest.status = 'broken'
  on conflict do nothing;
  get diagnostics v_broken_internal = row_count;

  with latest as (
    select distinct on (check_result.article_id, check_result.url)
      check_result.article_id, check_result.url, check_result.status
    from editorial.link_checks check_result
    where check_result.article_id is not null
    order by check_result.article_id, check_result.url,
      check_result.checked_at desc, check_result.id desc
  )
  insert into editorial.audit_findings (
    audit_kind, article_id, severity, code, detail
  )
  select distinct
    'nightly', article.id, 'warning', 'internal_link_check_unavailable',
    'An internal article link check timed out and remains unverified.'
  from editorial.articles article
  join latest on latest.article_id = article.id
  where article.status = 'published' and latest.status = 'timeout'
  on conflict do nothing;
  get diagnostics v_unavailable_internal = row_count;

  update editorial.articles article
  set status = 'update_required',
      updated_at = clock_timestamp(),
      admin_version = admin_version + 1
  where article.status = 'published'
    and exists (
      select 1
      from editorial.audit_findings finding
      where finding.article_id = article.id
        and finding.audit_kind = 'nightly'
        and finding.status = 'open'
        and finding.severity = 'critical'
    );

  return jsonb_build_object(
    'broken_findings', v_broken_source + v_broken_internal,
    'broken_source_findings', v_broken_source,
    'broken_internal_link_findings', v_broken_internal,
    'unavailable_internal_link_findings', v_unavailable_internal,
    'stale_blocks', v_stale
  );
end;
$$;
