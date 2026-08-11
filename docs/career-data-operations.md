# Career data operations

Entry point; procedures live in [OPERATIONS.md](OPERATIONS.md), source policy
in [source-rights.md](source-rights.md) and
[JOB_SOURCE_POLICY_MATRIX.md](JOB_SOURCE_POLICY_MATRIX.md), board onboarding
in [board discovery scripts](../scripts) and
[inventory-expansion.md](inventory-expansion.md).

## What the operator can do today

- `/admin/jobs` — search by job/source/company identifiers and inspect a
  protected evidence-rich detail view (AAL2 data-quality/admin). Status
  transitions remain AAL2 admin-only and require a reason, optimistic version
  and dual audit trail.
- `/admin/jobs/intake` — AAL2 data-quality/admin staff can retain a source URL,
  source statement, normalized job fields and explicit eligibility evidence in
  a pending moderation case. Intake never publishes directly; only an AAL2
  admin can approve after reviewing the protected detail.
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

1. No bulk upload UI; the CSV grant machinery exists in the database with no
   caller. URL-backed structured operator intake now uses the normal moderation
   queue.
2. No employer-matching, eligibility-review or salary-evidence-review queues.
