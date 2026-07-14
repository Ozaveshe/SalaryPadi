# SalaryPadi 14-day job-supply pilot report

Status: **not started; implementation not deployed; no new source activated**.

The production-truth evidence captured on 13 July 2026 showed 38 visible in-memory Remotive jobs but zero durable raw records and zero durable canonical jobs. Those 38 are not counted as new canonical supply. Current evidenced external capacity is therefore **0/day**, against the target of **at least 500 new canonical jobs/day**.

This report intentionally contains no fabricated pilot results. The 14 daily rows in `job-supply-pilot-14-day.json` remain `not_run` with null metrics until a separately approved deployment and source activation creates real run evidence.

The machine report also contains one source rollup row for every registry adapter. Run time, duration, fetched, accepted, new canonical, updated, duplicate, rejected, closed, eligibility and error metrics are null—not zero—because the pilot has not run.

## What the pilot will measure

- `canonical_created` events per day after validation and exact deduplication;
- raw occurrences separately, so repeats cannot inflate yield;
- accepted, duplicate, rejected, updated and closed counts per source;
- explicit Nigeria/Africa eligibility, Nigeria-local and unclear eligibility;
- lifecycle transitions, broken application links and fuzzy-review backlog;
- policy status, last successful run, review deadline and missing dependencies;
- zero Google Jobs/structured-data submission for Remotive and Jobicy.

## Start gate

The four already-applied production migration versions (20260713172319, 20260713172330, 20260713172341, 20260713172351) are now represented by their byte-equivalent SQL in the repository; production was not changed. The pilot may start only after the repository migration and pgTAP suites pass in an isolated database, at least one external source has complete written rights, every dependency in the policy registry is verified, expected capacity has an evidence reference, workers pass quality gates, and deployment/source activation receives explicit approval.

## Outcome

Infrastructure readiness is implemented in the worktree. Supply outcome is **unproven**. The exact external blockers are listed in [`docs/JOB_SOURCE_POLICY_MATRIX.md`](../docs/JOB_SOURCE_POLICY_MATRIX.md) and the machine report.
