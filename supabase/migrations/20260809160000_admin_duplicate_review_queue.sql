-- A read-only staff queue for job-duplicate candidates. Detection
-- (audit.job_duplicate_candidates) already runs at ingestion, but nothing
-- surfaced the backlog: near-duplicate pairs accumulated with no way for an
-- operator to see or investigate them. This exposes the pending pairs through
-- the standard admin_list contract (guarded by security.can_manage_jobs), so
-- staff can review them against the existing job tools. Resolution actions
-- (confirm / dismiss) are intentionally not wired here — that needs a reviewed
-- transition and a canonical-link path — so the queue is view-only for now.
--
-- Apply timing: standalone, code-independent. Safe before or after deploy.

begin;

create or replace function api.admin_list_duplicates()
returns table(
  id uuid, title text, secondary text, status text,
  updated_at timestamptz, version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    left(coalesce(lj.title, 'Untitled role'), 300),
    left(
      concat_ws(
        ' · ',
        'possible duplicate of: ' || coalesce(rj.title, 'Untitled role'),
        'title similarity ' || to_char(d.title_similarity, 'FM0.00'),
        d.evidence ->> 'reason'
      ),
      500
    ),
    d.status,
    coalesce(d.reviewed_at, d.created_at),
    1
  from audit.job_duplicate_candidates d
  join app.jobs lj on lj.id = d.left_job_id
  join app.jobs rj on rj.id = d.right_job_id
  where (select security.can_manage_jobs())
  order by (d.status <> 'pending'), d.created_at desc, d.id
  limit 200
$$;

comment on function api.admin_list_duplicates() is
  'Read-only queue of near-duplicate job pairs for operator review. Guarded by '
  'security.can_manage_jobs(). No resolution action is exposed here.';

revoke all on function api.admin_list_duplicates() from public, anon;
grant execute on function api.admin_list_duplicates() to authenticated;

commit;
