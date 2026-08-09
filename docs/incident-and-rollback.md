# Incident and rollback

Entry point; the operative procedures live in
[DEPLOYMENT.md](DEPLOYMENT.md) (§ Rollback), [OPERATIONS.md](OPERATIONS.md)
(incident quick actions, worker recovery, maintenance mode) and
[SECURITY.md](SECURITY.md). This page adds only what those do not say.

## Standing rules

- Migrations are forward-only; never a destructive down migration, never
  `migration repair` against production. Database changes reach production
  when an operator applies them — deploys do not run migrations.
- Contain sources first (`*_SOURCE_ENABLED=false`, pause in DB), then roll
  the web artifact back in Netlify, then reconcile.
- `/api/health` returns 503 whenever any registered worker is missing,
  never-run, stale or failed — by design, so the canary sees it. Supply
  capacity (`job_supply_ready`) is reported in the payload but deliberately
  does not pin the HTTP status.
- A missed platform invocation of a daily worker self-heals at its next
  slot but costs up to ~24 h of degraded health; `worker_start` failures
  before a run id exist only in function logs (documented in
  `netlify/functions/_shared/runtime.ts`).

## Deploy coupling register (keep current)

| Migration                                                    | Coupling                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260809120000_application_snapshot_capture`                | Apply WITH the deploy that ships the widened application schema (repo builds after 2026-08-09 probe and fall back, so after-deploy is also safe)           |
| `20260809130000_source_absence_closure_and_broken_link_gate` | Standalone; safe before or after deploy. First lifecycle run will close the accumulated zombie cohort — expect a one-time spike in `source_absence_closed` |
| `20260809140000_company_claim_domain_guard`                  | Standalone; safe before or after deploy                                                                                                                    |
| (precedent) `20260728190000_application_cv_in_list`          | The pattern this register exists to record                                                                                                                 |
