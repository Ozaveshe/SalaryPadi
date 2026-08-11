-- Turn the fuzzy duplicate queue into a reviewed, auditable workflow.
-- Detection remains advisory: a data-quality operator must explicitly keep
-- the first job, keep the second job, or dismiss the candidate. Confirming a
-- pair links every source occurrence to the selected canonical job without
-- rewriting either source record.

begin;

alter table audit.job_duplicate_candidates
  add column if not exists version integer not null default 1,
  add column if not exists canonical_job_id uuid references app.jobs(id) on delete restrict,
  add column if not exists resolution_reason text;

alter table audit.job_duplicate_candidates
  drop constraint if exists job_duplicate_candidate_status;
alter table audit.job_duplicate_candidates
  add constraint job_duplicate_candidate_status check (
    status in ('pending', 'confirmed', 'dismissed', 'superseded')
  ),
  add constraint job_duplicate_candidate_version check (version > 0),
  add constraint job_duplicate_candidate_resolution check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null
      and canonical_job_id is null and resolution_reason is null)
    or
    (status <> 'pending' and reviewed_at is not null and reviewed_by is not null
      and resolution_reason is not null
      and char_length(resolution_reason) between 3 and 500
      and ((status = 'confirmed' and canonical_job_id is not null)
        or (status in ('dismissed', 'superseded'))))
  );

alter table audit.canonical_job_events
  drop constraint if exists canonical_job_events_type;
alter table audit.canonical_job_events
  add constraint canonical_job_events_type check (
    event_type in (
      'canonical_created', 'authority_changed', 'exact_linked',
      'reviewed_fuzzy_linked', 'closed'
    )
  );

create or replace function api.admin_list_duplicates()
returns table(
  id uuid, title text, secondary text, status text,
  updated_at timestamptz, version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;

  return query
  select
    candidate.id,
    left('First: ' || coalesce(left_root.title, 'Untitled role'), 300),
    left(
      concat_ws(
        ' · ',
        'Second: ' || coalesce(right_root.title, 'Untitled role'),
        'first job ' || left_root.id::text || ' [' || left_root.status::text || ']',
        'second job ' || right_root.id::text || ' [' || right_root.status::text || ']',
        coalesce(company.display_name, 'Unknown employer'),
        'title similarity ' || to_char(candidate.title_similarity, 'FM0.00'),
        'application hosts ' || coalesce(candidate.evidence ->> 'left_application_host', 'unknown')
          || ' / ' || coalesce(candidate.evidence ->> 'right_application_host', 'unknown'),
        case when candidate.status = 'pending' then 'awaiting human decision'
          else 'decision: ' || candidate.status || ' — ' || candidate.resolution_reason end
      ),
      500
    ),
    candidate.status,
    coalesce(candidate.reviewed_at, candidate.created_at),
    candidate.version
  from audit.job_duplicate_candidates candidate
  join app.jobs left_source on left_source.id = candidate.left_job_id
  join app.jobs right_source on right_source.id = candidate.right_job_id
  join app.jobs left_root on left_root.id = coalesce(left_source.canonical_job_id, left_source.id)
  join app.jobs right_root on right_root.id = coalesce(right_source.canonical_job_id, right_source.id)
  left join app.companies company on company.id = left_root.company_id
  order by (candidate.status <> 'pending'), candidate.created_at desc, candidate.id
  limit 200;
end;
$$;

comment on function api.admin_list_duplicates() is
  'AAL2 data-quality queue showing the current canonical roots for each fuzzy '
  'duplicate candidate and enough evidence for an explicit human decision.';

create or replace function api.transition_job_duplicate_candidate(
  p_candidate_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate audit.job_duplicate_candidates%rowtype;
  v_left app.jobs%rowtype;
  v_right app.jobs%rowtype;
  v_canonical app.jobs%rowtype;
  v_duplicate app.jobs%rowtype;
  v_left_root_id uuid;
  v_right_root_id uuid;
begin
  if not (select security.can_manage_jobs()) then
    raise exception using errcode = '42501', message = 'job operations access required';
  end if;
  if p_candidate_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_action not in ('keep_first', 'keep_second', 'dismiss')
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'invalid duplicate decision';
  end if;

  select * into v_candidate
  from audit.job_duplicate_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'duplicate candidate not found';
  end if;
  if v_candidate.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale duplicate candidate version';
  end if;
  if v_candidate.status <> 'pending' then
    raise exception using errcode = '23514', message = 'duplicate candidate is already resolved';
  end if;

  if p_action = 'dismiss' then
    update audit.job_duplicate_candidates
    set status = 'dismissed', reviewed_at = clock_timestamp(),
        reviewed_by = (select auth.uid()), resolution_reason = btrim(p_reason),
        version = version + 1
    where id = p_candidate_id;

    perform audit.write_event(
      'staff', 'admin.duplicates.dismiss', 'job_duplicate_candidate', p_candidate_id,
      'dismiss', jsonb_build_object('status', 'pending', 'version', p_expected_version),
      jsonb_build_object('status', 'dismissed', 'version', p_expected_version + 1),
      array['status', 'reviewed_at', 'reviewed_by', 'resolution_reason', 'version'],
      null, null, jsonb_build_object('reason', btrim(p_reason))
    );
    return true;
  end if;

  select coalesce(job.canonical_job_id, job.id) into v_left_root_id
  from app.jobs job where job.id = v_candidate.left_job_id;
  select coalesce(job.canonical_job_id, job.id) into v_right_root_id
  from app.jobs job where job.id = v_candidate.right_job_id;
  if v_left_root_id is null or v_right_root_id is null then
    raise exception using errcode = 'P0002', message = 'duplicate candidate job not found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(v_left_root_id, v_right_root_id)::text || ':' ||
      greatest(v_left_root_id, v_right_root_id)::text,
      0
    )
  );
  select * into v_left from app.jobs where id = v_left_root_id for update;
  select * into v_right from app.jobs where id = v_right_root_id for update;
  if v_left.id is null or v_right.id is null then
    raise exception using errcode = 'P0002', message = 'duplicate candidate job not found';
  end if;

  if v_left.id = v_right.id then
    update audit.job_duplicate_candidates
    set status = 'superseded', reviewed_at = clock_timestamp(),
        reviewed_by = (select auth.uid()), canonical_job_id = v_left.id,
        resolution_reason = 'Both jobs already resolve to the same canonical job.',
        version = version + 1
    where id = p_candidate_id;
    return true;
  end if;

  if p_action = 'keep_first' then
    v_canonical := v_left;
    v_duplicate := v_right;
  else
    v_canonical := v_right;
    v_duplicate := v_left;
  end if;
  if v_canonical.status in ('removed', 'rejected') then
    raise exception using errcode = '23514', message = 'selected canonical job is not eligible';
  end if;

  update app.jobs
  set canonical_job_id = v_canonical.id, updated_at = clock_timestamp()
  where id = v_duplicate.id or canonical_job_id = v_duplicate.id;

  update ingest.job_occurrence_links
  set canonical_job_id = v_canonical.id,
      match_kind = 'reviewed_fuzzy', linked_at = clock_timestamp()
  where canonical_job_id = v_duplicate.id or source_job_id = v_duplicate.id;

  insert into audit.canonical_job_events (
    event_key, event_type, canonical_job_id, source_job_id, source_id, evidence
  ) values (
    'reviewed_fuzzy_linked:' || p_candidate_id::text,
    'reviewed_fuzzy_linked', v_canonical.id, v_duplicate.id, v_duplicate.source_id,
    jsonb_build_object(
      'candidate_id', p_candidate_id,
      'decision', p_action,
      'reason', btrim(p_reason),
      'title_similarity', v_candidate.title_similarity
    )
  );

  update audit.job_duplicate_candidates
  set status = 'confirmed', reviewed_at = clock_timestamp(),
      reviewed_by = (select auth.uid()), canonical_job_id = v_canonical.id,
      resolution_reason = btrim(p_reason), version = version + 1
  where id = p_candidate_id;

  update audit.job_duplicate_candidates candidate
  set status = 'superseded', reviewed_at = clock_timestamp(),
      reviewed_by = (select auth.uid()), canonical_job_id = v_canonical.id,
      resolution_reason = 'Both jobs now resolve to the same canonical job.',
      version = version + 1
  where candidate.id <> p_candidate_id
    and candidate.status = 'pending'
    and (select coalesce(job.canonical_job_id, job.id)
         from app.jobs job where job.id = candidate.left_job_id)
      = (select coalesce(job.canonical_job_id, job.id)
         from app.jobs job where job.id = candidate.right_job_id);

  perform audit.write_event(
    'staff', 'admin.duplicates.' || p_action, 'job_duplicate_candidate', p_candidate_id,
    p_action, jsonb_build_object('status', 'pending', 'version', p_expected_version),
    jsonb_build_object(
      'status', 'confirmed', 'version', p_expected_version + 1,
      'canonical_job_id', v_canonical.id, 'linked_job_id', v_duplicate.id
    ),
    array['status', 'canonical_job_id', 'reviewed_at', 'reviewed_by',
      'resolution_reason', 'version'],
    null, null, jsonb_build_object('reason', btrim(p_reason))
  );
  return true;
end;
$$;

comment on function api.transition_job_duplicate_candidate(uuid,integer,text,text) is
  'AAL2 data-quality decision for one fuzzy job pair. A confirmation preserves '
  'both source jobs, links the duplicate to the chosen canonical root, relinks '
  'occurrences, and appends canonical plus staff audit evidence.';

revoke all on function api.admin_list_duplicates() from public, anon;
grant execute on function api.admin_list_duplicates() to authenticated;
revoke all on function api.transition_job_duplicate_candidate(uuid,integer,text,text)
from public, anon;
grant execute on function api.transition_job_duplicate_candidate(uuid,integer,text,text)
to authenticated;

commit;
