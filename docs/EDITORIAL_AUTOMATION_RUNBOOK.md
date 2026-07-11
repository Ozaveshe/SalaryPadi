# Editorial automation runbook

## Operating contract

SalaryPadi publishes evidence, not content volume. Topic candidates, sources,
claims, drafts, checks, approvals, schedules, publication state, live blocks,
audits and failures are separate records. The system never inserts expiring job
titles into article prose. The evergreen remote-jobs guide renders a live block
from active jobs whose policy permits indexing and whose eligibility evidence
explicitly supports Nigeria.

Only a `data_brief` marked `deterministic` can publish without a human approval,
and only when it has a snapshot newer than 25 hours, passed preflight, and has no
unverified claims. Salary, tax, legal, company and employment claims always need
a source record, verification and editorial approval. A failed run leaves all
article states unchanged.

## Schedule

Netlify schedules use UTC; WAT is UTC+1 year-round.

| WAT              | UTC cron       | Worker                       | Result                                                            |
| ---------------- | -------------- | ---------------------------- | ----------------------------------------------------------------- |
| 05:00 daily      | `0 4 * * *`    | `editorial_job_snapshot`     | Description-free active-job metrics and source freshness snapshot |
| 05:15 daily      | `15 4 * * *`   | `editorial_topic_candidates` | Select one non-duplicate queued topic                             |
| 05:30 daily      | `30 4 * * *`   | `editorial_draft`            | Prepare one outline or deterministic brief                        |
| 06:00 daily      | `0 5 * * *`    | `editorial_preflight`        | Source, claim, duplicate, PII, freshness and link gates           |
| 07:00 daily      | `0 6 * * *`    | `editorial_queue`            | Move passed work to the editorial queue                           |
| 09:00 daily      | `0 8 * * *`    | `editorial_publish`          | Publish approved work and eligible deterministic briefs           |
| Every 6 hours    | `10 */6 * * *` | `editorial_live_blocks`      | Refresh block counts and six-hour expiry                          |
| 23:30 WAT daily  | `30 22 * * *`  | `editorial_nightly_audit`    | Bounded link checks, broken sources and stale blocks              |
| 23:45 WAT Sunday | `45 22 * * 0`  | `editorial_weekly_audit`     | Thin, orphan and exact-cannibalization findings                   |

`private.worker_runs` provides unique `(task_key, run_key)` locks and append-only
run history. Duplicate scheduled deliveries return without executing. Worker
health becomes degraded after a failure and stale after the configured threshold.

## Launch queue

The migration prepares 12 cornerstone candidates and four deterministic data
briefs. Cornerstones remain review-gated. The four briefs cover active remote
jobs, source freshness, Nigeria eligibility evidence and deadline coverage. No
candidate contains a fake statistic, salary, employer claim or automatic year.

## Monitoring and failure response

- `/api/health` reports every editorial worker and the automation gate.
- `editorial.operational_alerts` deduplicates task failures by task/run/error.
- `editorial.audit_findings` stores preflight, nightly and weekly findings.
- A broken cited source moves a published database article to `update_required`;
  it is not silently rewritten.
- A stale live block becomes `stale`. The page recomputes from active jobs and
  shows an honest empty state rather than cached or fixture vacancies.
- The nightly checker accepts only HTTPS, rejects credentials, custom ports,
  localhost and private-address literals, does not follow redirects, and checks
  at most 50 links per run.

## Emergency controls

1. Set `EDITORIAL_AUTOMATION_ENABLED=false` in Netlify to stop every editorial
   task immediately. Existing publication states are unchanged.
2. Disable an individual row in `private.worker_schedules` for monitoring and
   then keep its Netlify function disabled until the incident is resolved.
3. Archive or mark affected articles `update_required` from `/admin/editorial`.
4. Do not manually publish around a failed fact-check, source, snapshot or claim
   gate. Repair evidence, rerun checks, and record the approval reason.
5. Re-enable only after the worker succeeds and `/api/health` reports fresh.

## Credentials

Editorial workers reuse the SalaryPadi-only `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The project URL must be
`https://bxelrhklsznmpksgrqep.supabase.co`. They also read the current
description-free job catalog; no new provider credential is introduced. Never
use another product's Supabase project or expose the service-role key to browser
code.
