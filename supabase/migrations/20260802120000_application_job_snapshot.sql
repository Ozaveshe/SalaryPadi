-- Preserve the job as the user saw it when they applied.
--
-- private.applications stored only job_id, so the tracker rendered every
-- historical application from the *live* job row. That means a user's own
-- record of their career rewrites itself whenever the employer edits the
-- posting: a retitled role, a changed salary, or a purged job silently alters
-- what the person remembers applying to. For a product whose whole argument
-- is that records should be traceable and stable, that is the wrong way
-- round — the public job may change freely, but the user's history must not.
--
-- The snapshot is captured once, at the moment the application is recorded,
-- and never updated afterwards. Later job closure is already tracked
-- separately on app.jobs, so a closed job shows as closed *today* without
-- disturbing what was true then.

begin;

alter table private.applications
  add column if not exists job_snapshot jsonb,
  add column if not exists snapshot_captured_at timestamptz;

comment on column private.applications.job_snapshot is
  'The job as the user saw it at application time: title, employer, location, work arrangement, salary text, destination. Written once and never updated — the live job may change, this may not.';
comment on column private.applications.snapshot_captured_at is
  'When the snapshot was taken. Null for applications recorded before snapshots existed.';

-- Shape check rather than a full schema: the snapshot is a historical record,
-- so a future field addition must not invalidate rows already written.
alter table private.applications
  add constraint applications_job_snapshot_shape
  check (
    job_snapshot is null
    or (
      jsonb_typeof(job_snapshot) = 'object'
      and job_snapshot ? 'title'
      and job_snapshot ? 'companyName'
      and jsonb_typeof(job_snapshot -> 'title') = 'string'
    )
  );

-- A snapshot without its timestamp cannot be reasoned about; require both or
-- neither.
alter table private.applications
  add constraint applications_snapshot_paired
  check (
    (job_snapshot is null and snapshot_captured_at is null)
    or (job_snapshot is not null and snapshot_captured_at is not null)
  );

commit;
