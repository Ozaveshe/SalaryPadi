# Canonical job lifecycle

Entry point; the deep material lives in [job-lifecycle.md](job-lifecycle.md)
and [canonical-job-model.md](canonical-job-model.md).

## What production enforces (2026-08-09)

- Identity: `app.jobs` with `dedup_fingerprint` (v2: title + company +
  location + arrangement + canonicalised destination), exact-merge trigger,
  authority ladder direct(400) > ATS(300) > partner(200) > feed(100).
  Receipts in `ingest.job_source_occurrences` are append-only behind the
  canonical row, purged only by per-source retention.
- States: `job_status` (draft/pending/published/expired/removed/rejected) ×
  `job_lifecycle_state` (open/checking/closed), kept consistent by triggers.
  Jobs are never hard-deleted; closure is a status transition with a reason.
- Closure rules run in `api.worker_run_job_lifecycle` every 15 minutes:
  1. `deadline_elapsed` — `valid_through` passed.
  2. `manual_reconfirmation_overdue` — direct/manual jobs unconfirmed 30 days.
  3. `source_absence_window_elapsed` (since `20260809130000`) — a sourced job
     its source has not shown for 7 days, **only** when that source kept
     importing successfully since well after the last sighting. A paused or
     failing source closes nothing.
  4. Snapshot-absence fast path: ≥2 successful omissions in complete
     snapshots, 30-minute grace, never on a failed fetch.
- Publication gate is the `jobs_public_read` policy: published, open,
  non-fixture, deadline live, cached provenance present, and (since
  `20260809130000`) apply link not confirmed broken — broken means two
  consecutive definitive failures (404/410/451), so one transient response
  cannot unpublish.

## Known not-yet

The eleven-state vocabulary in `src/lib/canonical/job-lifecycle.ts` is a
specification under test. Receipt provenance columns
(`parser_version`, `rights_classification`, `application_destination_kind`,
`source_published_at`, `ingestion_status`) have no writer. ATS adapters do
not paginate. Jobs with no `posted_at` cannot age (`posting-age.ts` documents
the gap).
