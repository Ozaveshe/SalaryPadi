# Career data operations

Entry point; procedures live in [OPERATIONS.md](OPERATIONS.md), source policy
in [source-rights.md](source-rights.md) and
[JOB_SOURCE_POLICY_MATRIX.md](JOB_SOURCE_POLICY_MATRIX.md), board onboarding
in [board discovery scripts](../scripts) and
[inventory-expansion.md](inventory-expansion.md).

## What the operator can do today

- `/admin/jobs` — approve / expire / remove / restore, with mandatory reason,
  optimistic version and dual audit trail (AAL2 admin only).
- `/admin/sources` — enable / disable / request review; rights auto-expire on
  lapsed review with a critical alert; fail-closed everywhere.
- `/admin/source-health` — per-source 14-day runs, rights state, supply
  canary, apply-link failures, open alerts.
- `/admin/imports` — read-only by design (no blind retry).
- `/admin/duplicates` — open a protected case-detail route, compare full job
  text and field-by-field source, terms, location, eligibility, salary and
  freshness evidence, then keep either canonical job or dismiss the match;
  confirmation relinks source occurrences and records immutable canonical plus
  staff audit evidence (AAL2 data-quality/admin).
- `/admin/company-claims` — claim / verify / reject / revoke; each row states
  whether the claimant's email matches an official domain, and verifying a
  mismatch requires an `override:domain_mismatch` reason
  (`20260809140000`).
- Board onboarding — probe scripts → board registry → policy-chain
  registration SQL (data rows, deliberately outside the migration chain).

## Known gaps (ranked in the completion audit)

1. The job admin resource still renders a generic 4-column table: no job detail
   view, no search, `admin_list('jobs')` caps at 200 rows by `updated_at` —
   an operator cannot find a reported job. Duplicate review now has a dedicated
   evidence-bearing detail route.
2. No operator job intake (URL / structured form / bulk upload UI); the CSV
   grant machinery exists in the database with no caller.
3. No employer-matching, eligibility-review or salary-evidence-review queues.
4. Employer-submitted salary evidence cites the submitted numbers as their
   own source, and eligibility is stamped `manually_verified`/0.80 without a
   reviewer asserting it.
