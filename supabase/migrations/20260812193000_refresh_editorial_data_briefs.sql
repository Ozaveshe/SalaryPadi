-- Keep deterministic data briefs publishable after their initial candidate has
-- been consumed. The launch workflow could create a brief once, but it never
-- attached a newer snapshot to an existing brief. All four briefs therefore
-- aged out and the shared body template also tripped duplicate-content checks.

create or replace function security.render_editorial_data_brief(
  p_slug text,
  p_checked_at timestamptz,
  p_metrics jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checked text := to_char(p_checked_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC');
  v_active text := coalesce(p_metrics->>'active_jobs', '0');
  v_indexable text := coalesce(p_metrics->>'indexable_jobs', '0');
  v_remote text := coalesce(p_metrics->>'remote_jobs', '0');
  v_eligible text := coalesce(p_metrics->>'nigeria_eligible', '0');
  v_unclear text := coalesce(p_metrics->>'nigeria_unclear', '0');
  v_with_deadlines text := coalesce(p_metrics->>'jobs_with_deadlines', '0');
  v_without_deadlines text := coalesce(p_metrics->>'jobs_without_deadlines', '0');
begin
  if p_slug = 'active-remote-jobs-nigeria-snapshot' then
    return 'At ' || v_checked || ', SalaryPadi counted ' || v_remote
      || ' remote roles in its canonical active-job inventory. This brief is a reproducible product-data snapshot, not a forecast and not an estimate of every remote vacancy in Nigeria. The complete active catalogue contained '
      || v_active || ' roles, and ' || v_indexable
      || ' records were attached to source policies that permit public search indexing.'
      || E'\n\n## What open to Nigerians means\n\n'
      || 'SalaryPadi records Nigerian eligibility only when a vacancy or its source supplies explicit applicant-location evidence. At the snapshot time, '
      || v_eligible || ' active roles had that evidence, while ' || v_unclear
      || ' remained unclear. A generic worldwide or remote label is not silently converted into Nigerian eligibility. Unclear means the source did not provide enough evidence; it does not prove exclusion.'
      || E'\n\n## How to use this count\n\n'
      || 'Use the remote-jobs page to inspect current Job Truth Cards, work arrangement, source freshness, and eligibility notes. Counts can change after capture as employers publish, close, or correct vacancies. Always open the original vacancy before applying.'
      || E'\n\n## Method\n\n'
      || 'The scheduled snapshot reads canonical open records whose known deadline has not passed, then groups stored work-mode and eligibility fields. SalaryPadi preserves unknowns instead of guessing. The snapshot, source summary, and content hash are stored for audit, and publication is blocked when the evidence is more than twenty-five hours old.';
  elsif p_slug = 'job-source-freshness-snapshot' then
    return 'SalaryPadi captured its canonical job catalogue at ' || v_checked
      || '. The snapshot contained ' || v_active || ' active roles; ' || v_indexable
      || ' were linked to current source policies that permit public search indexing. This is a first-party operational snapshot of SalaryPadi records, not a claim about the size of the wider labour market.'
      || E'\n\n## What freshness covers\n\n'
      || 'A job stays active only while its stored lifecycle evidence supports that state. A record can leave the active catalogue when its deadline passes, its source confirms closure, or repeated source checks reach the conservative absence threshold. Missing deadlines remain unknown rather than being invented. At capture time, '
      || v_with_deadlines || ' active roles had an explicit deadline and ' || v_without_deadlines
      || ' did not.'
      || E'\n\n## Why the indexable count is smaller\n\n'
      || 'Some supplemental records can help a visitor without carrying the provenance or reuse rights needed for public search indexing. SalaryPadi excludes those records from the indexable count. This separation prevents catalogue volume from being presented as stronger evidence than the source policy allows.'
      || E'\n\n## Reproduction notes\n\n'
      || 'The scheduled worker queries canonical open records, applies deadline and source-policy gates, stores aggregate metrics with a source summary and content hash, and checks the methodology link. Publication fails closed if the snapshot is stale or a cited source is unhealthy.';
  elsif p_slug = 'nigeria-eligibility-evidence-snapshot' then
    return 'At ' || v_checked || ', explicit source evidence supported Nigerian applicants for '
      || v_eligible || ' active SalaryPadi jobs. Another ' || v_unclear
      || ' active records had unclear Nigerian eligibility. The underlying catalogue held ' || v_active
      || ' active roles. These are evidence states inside SalaryPadi, not hiring probabilities and not a statement that every unclear employer rejects Nigerian applicants.'
      || E'\n\n## Evidence before inference\n\n'
      || 'SalaryPadi does not treat remote, worldwide, Europe, Africa, or an omitted location as automatic Nigerian eligibility. An eligible label requires an explicit country, region, or applicant-location rule from the vacancy or its governed source. When evidence is incomplete, the product preserves unclear and asks the reader to verify the original posting.'
      || E'\n\n## Reading the numbers\n\n'
      || 'The same snapshot counted ' || v_remote || ' remote jobs and ' || v_indexable
      || ' indexable active records. Those groups can overlap, but they answer different questions: work arrangement describes where work happens; eligibility describes who the employer says may apply; indexability describes whether SalaryPadi may expose the record to search engines.'
      || E'\n\n## Method and limits\n\n'
      || 'A scheduled worker groups canonical open jobs by stored eligibility evidence, records the metrics and source summary with a content hash, and attaches this brief to that immutable snapshot. Openings and wording can change after capture. Readers should inspect the Job Truth Card and original vacancy before applying.';
  elsif p_slug = 'active-job-deadline-snapshot' then
    return 'SalaryPadi counted ' || v_active || ' active jobs at ' || v_checked
      || '. Of those records, ' || v_with_deadlines || ' included an explicit application deadline and '
      || v_without_deadlines || ' did not. This brief reports the stored catalogue exactly as captured; a missing deadline remains unknown and is never converted into an invented closing date.'
      || E'\n\n## What active means\n\n'
      || 'A record is active when the canonical lifecycle has not established that it is closed. A known past deadline removes a job from active counts. SalaryPadi can also close a record when the source confirms closure or when repeated absence checks reach the conservative lifecycle threshold. A role may still close between the snapshot and a reader opening it.'
      || E'\n\n## Why deadlines matter\n\n'
      || 'An explicit deadline helps applicants prioritise work, but the absence of one is not evidence that a vacancy is permanent. Readers should check the original posting immediately before investing time in an application. The jobs page exposes deadline and freshness evidence where available.'
      || E'\n\n## Reproducible method\n\n'
      || 'The scheduled snapshot reads canonical open records, excludes known expired deadlines, and groups remaining jobs by whether a deadline value is stored. It also recorded '
      || v_indexable || ' indexable active jobs. Metrics, source summary, and a content hash are retained. Preflight blocks publication when the attached snapshot is older than twenty-five hours or evidence checks fail.';
  end if;

  raise exception using errcode = '22023', message = 'unsupported editorial data brief';
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
  v_article editorial.articles%rowtype;
  v_article_id uuid;
  v_source_id uuid;
  v_body text;
begin
  perform security.require_service_role();

  select * into v_snapshot
  from editorial.data_snapshots snapshot
  order by snapshot.captured_at desc, snapshot.id desc
  limit 1;

  if v_snapshot.id is not null
     and v_snapshot.source_checked_at >= clock_timestamp() - interval '25 hours' then
    select * into v_article
    from editorial.articles article
    where article.article_kind = 'data_brief'
      and article.deterministic
      and article.snapshot_id is distinct from v_snapshot.id
      and (
        article.status = 'update_required'
        or (article.status = 'fact_check' and article.fact_check_status = 'needs_review')
        or (article.status = 'published'
          and article.next_review_at <= clock_timestamp() + interval '24 hours')
      )
    order by
      case article.status when 'update_required' then 0 when 'fact_check' then 1 else 2 end,
      article.next_review_at nulls first,
      article.updated_at,
      article.id
    limit 1 for update skip locked;

    if found then
      v_body := security.render_editorial_data_brief(
        v_article.slug, v_snapshot.source_checked_at, v_snapshot.metrics
      );
      select source.id into v_source_id
      from editorial.sources source
      where source.canonical_url = 'https://salarypadi.com/methodology';
      if v_source_id is null then
        return jsonb_build_object('drafted', 0, 'reason', 'methodology_source_required');
      end if;

      update editorial.articles
      set snapshot_id = v_snapshot.id,
        body_markdown = v_body,
        status = 'draft',
        fact_check_status = 'pending',
        editorial_approval_status = 'not_required',
        scheduled_for = null,
        published_at = null,
        last_content_review_at = null,
        next_review_at = clock_timestamp() + interval '7 days',
        updated_at = clock_timestamp(),
        admin_version = admin_version + 1
      where id = v_article.id;

      delete from editorial.claims where article_id = v_article.id;
      insert into editorial.claims (
        article_id, source_id, claim_text, claim_type, status,
        requires_editorial_review, evidence_note, checked_at
      ) values
        (v_article.id, v_source_id,
          'Active jobs: ' || coalesce(v_snapshot.metrics->>'active_jobs', '0'),
          'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
          v_snapshot.source_checked_at),
        (v_article.id, v_source_id,
          'Indexable active jobs: ' || coalesce(v_snapshot.metrics->>'indexable_jobs', '0'),
          'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
          v_snapshot.source_checked_at),
        (v_article.id, v_source_id,
          'Nigeria-eligible active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_eligible', '0'),
          'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
          v_snapshot.source_checked_at),
        (v_article.id, v_source_id,
          'Nigeria-unclear active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_unclear', '0'),
          'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
          v_snapshot.source_checked_at);

      update editorial.audit_findings
      set status = 'resolved', resolved_at = clock_timestamp()
      where article_id = v_article.id
        and status = 'open'
        and code in ('fresh_snapshot_required', 'review_overdue', 'possible_duplicate');

      return jsonb_build_object(
        'drafted', 1,
        'article_id', v_article.id,
        'kind', 'data_brief',
        'refreshed', true,
        'snapshot_id', v_snapshot.id
      );
    end if;
  end if;

  select * into v_candidate
  from editorial.topic_candidates candidate
  where candidate.status = 'selected'
    and not exists (
      select 1 from editorial.articles article
      where article.candidate_id = candidate.id
    )
    and exists (
      select 1 from editorial.evidence_packs pack
      where pack.candidate_id = candidate.id
        and pack.status in ('draft', 'reviewed')
    )
  order by candidate.priority desc, candidate.created_at, candidate.id
  limit 1 for update skip locked;
  if not found then
    return jsonb_build_object('drafted', 0, 'reason', 'no_evidence_backed_candidate');
  end if;

  if v_candidate.topic_kind = 'data_brief'
     and (v_snapshot.id is null
       or v_snapshot.source_checked_at < clock_timestamp() - interval '25 hours') then
    return jsonb_build_object('drafted', 0, 'reason', 'fresh_snapshot_required');
  end if;

  select source.id into v_source_id
  from editorial.sources source
  where source.canonical_url = 'https://salarypadi.com/methodology';
  if v_source_id is null then
    return jsonb_build_object('drafted', 0, 'reason', 'methodology_source_required');
  end if;

  if v_candidate.topic_kind = 'data_brief' then
    v_body := security.render_editorial_data_brief(
      v_candidate.slug, v_snapshot.source_checked_at, v_snapshot.metrics
    );
  else
    v_body := 'Editorial draft outline. This cornerstone must not be published until every substantive claim has a cited source, a completed fact check, and explicit human approval.'
      || E'\n\n## Reader question\n\n' || v_candidate.search_intent
      || E'\n\n## Evidence required\n\n' || v_candidate.evidence_requirements::text
      || E'\n\n## Internal routes\n\n' || array_to_string(v_candidate.internal_link_targets, ', ')
      || E'\n\n[HUMAN REVIEW REQUIRED BEFORE PUBLICATION]';
  end if;

  insert into editorial.articles (
    candidate_id, snapshot_id, slug, title, description, article_kind,
    body_markdown, deterministic, internal_link_targets, next_review_at
  ) values (
    v_candidate.id,
    case when v_candidate.topic_kind = 'data_brief' then v_snapshot.id else null end,
    v_candidate.slug, v_candidate.title, v_candidate.rationale,
    v_candidate.topic_kind, v_body,
    v_candidate.topic_kind = 'data_brief',
    v_candidate.internal_link_targets,
    clock_timestamp() + case
      when v_candidate.topic_kind = 'data_brief' then interval '7 days'
      else interval '90 days'
    end
  ) returning id into v_article_id;

  insert into editorial.article_sources (article_id, source_id, purpose)
  values (v_article_id, v_source_id, 'SalaryPadi methodology and data provenance');

  if v_candidate.topic_kind = 'data_brief' then
    insert into editorial.claims (
      article_id, source_id, claim_text, claim_type, status,
      requires_editorial_review, evidence_note, checked_at
    ) values
      (v_article_id, v_source_id,
        'Active jobs: ' || coalesce(v_snapshot.metrics->>'active_jobs', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Indexable active jobs: ' || coalesce(v_snapshot.metrics->>'indexable_jobs', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Nigeria-eligible active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_eligible', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at),
      (v_article_id, v_source_id,
        'Nigeria-unclear active jobs: ' || coalesce(v_snapshot.metrics->>'nigeria_unclear', '0'),
        'data', 'verified', false, 'Snapshot ' || v_snapshot.id::text,
        v_snapshot.source_checked_at);
  end if;

  update editorial.topic_candidates
  set status = 'drafted', updated_at = clock_timestamp(),
    admin_version = admin_version + 1
  where id = v_candidate.id;
  return jsonb_build_object(
    'drafted', 1,
    'article_id', v_article_id,
    'kind', v_candidate.topic_kind,
    'deterministic', v_candidate.topic_kind = 'data_brief',
    'refreshed', false
  );
end;
$$;

revoke all on function security.render_editorial_data_brief(text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;

comment on function security.render_editorial_data_brief(text, timestamptz, jsonb) is
  'Renders differentiated first-party data briefs from a verified SalaryPadi snapshot. Internal only.';

comment on function api.editorial_prepare_one_draft() is
  'Refreshes one due deterministic brief before drafting a new evidence-backed candidate.';
