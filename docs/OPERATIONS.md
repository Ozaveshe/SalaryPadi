# Moderation and operations runbook

This runbook covers day-to-day handling of community contributions, reports, employer submissions, data sources, aggregates, privacy requests, and incidents. A dedicated SalaryPadi Supabase project is required; never run these procedures against AfroTools or LATMtools.

## Current operational ownership

Oza is the founder and interim accountable operator for Phase Two. These are role addresses, not separate staff identities; all four aliases currently deliver into the access-controlled `support@salarypadi.com` mailbox.

| Responsibility                                     | Interim owner | Contact                   | Internal response target                                                              |
| -------------------------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| Moderation, user support, and emergency takedown   | Oza           | `support@salarypadi.com`  | Imminent harm or exposed PII: same-day containment; ordinary queue: two business days |
| Privacy, export, correction, and deletion requests | Oza           | `privacy@salarypadi.com`  | Acknowledge within two business days; verify identity before action                   |
| Security and incident coordination                 | Oza           | `security@salarypadi.com` | High-severity alert: same-day triage and containment                                  |
| Job-source terms, provenance, and data quality     | Oza           | `sources@salarypadi.com`  | Stale/failed source: triage within four hours during operating days                   |
| Releases, workers, database, and rollback          | Oza           | `ops@salarypadi.com`      | Failed scheduled run: triage before its stale threshold                               |

The named owner may delegate work, but not accountability. Add a second named AAL2 administrator before removing the bootstrap account or beginning a 24/7 on-call claim. Do not describe these internal targets as statutory deadlines.

## Roles and access

- `moderator`: review contributions and reports, redact public copy, reject unsafe submissions, and escalate difficult cases.
- `data_quality`: manage jobs, imports, normalization, sources, and duplicate/expiry decisions.
- `admin`: manage roles, resolve escalated/restore actions, inspect audit records, and perform other privileged operations.

Every staff operation requires an authenticated active account. Moderation and administrative database transitions also require an AAL2 session. Staff should use named accounts; shared accounts are prohibited.

### Bootstrap the first administrator

The normal role function cannot create the first admin because there is no existing admin to authorize it. Bootstrap once, through a reviewed migration or a restricted SQL session:

1. Have the intended administrator sign in so `private.profiles` contains their auth user ID.
2. Obtain two-person review of the exact user UUID and reason. For the first single-founder bootstrap only, record the project-owner authorization as an explicit exception and do no privileged work before MFA is verified.
3. In a restricted transaction, insert the role and inspect the returned row:

```sql
begin;

insert into private.user_roles (user_id, role, granted_by, reason)
select user_id, 'admin'::private.staff_role, null, 'Initial admin bootstrap: change-ticket-ID'
from private.profiles
where user_id = '00000000-0000-0000-0000-000000000000'
returning user_id, role, granted_at;

commit;
```

4. Immediately enrol an approved TOTP factor, verify an AAL2 session, and open `/admin`. The human operator must control the authenticator secret; an automation agent must not retain it.
5. Record the recovery path: a Supabase organization owner can remove a lost factor after identity verification, then the admin must enrol a replacement before resuming privileged work. Factor removal is an incident and must be checked in Auth audit logs.

The initial production bootstrap completed on 2026-07-10: the active `support@salarypadi.com` administrator enrolled the `SalaryPadi admin` TOTP factor and reached the protected control room at AAL2. The factor secret and one-time codes were controlled only by the human operator. See the [Phase Two release record](PHASE_TWO_RELEASE_RECORD.md) for the separated production evidence.

Abort if no row is returned or the UUID is wrong. Subsequent grants and revocations must use the audited staff-role API from an existing AAL2 administrator. Keep at least two active administrators, and never remove the last active admin.

## Contribution moderation

New salary, review, and interview submissions enter `pending` and receive a moderation case. Raw submissions are private; no text becomes public by submission alone.

1. Claim the case. The versioned transition moves it to `in_review`.
2. Check identity leakage, names of non-public individuals, contact details, threats, hate/harassment, confidential material, unverifiable accusations, spam, duplicates, employer brigading, and salary manipulation.
3. Normalize the company and role family. Salary approval is blocked until normalization is complete.
4. For reviews/interviews, prepare a minimum necessary public payload. Remove personal identifiers and unsupported claims while preserving useful workplace evidence.
5. Choose exactly one action and enter a specific, non-sensitive reason code/note:
   - `redact` keeps the item in review and stores the reviewed public payload.
   - `approve` publishes the redacted projection or queues a salary aggregate refresh.
   - `request_revision` returns an item that the contributor can safely correct.
   - `reject` closes unsafe, unverifiable, or out-of-scope content.
   - `escalate` sends legal, threat, identity, or high-impact uncertainty to an admin.
   - `merge_duplicate` links a compatible case and closes the duplicate.
6. Re-read the public projection, not only the raw submission, before completing approval.

Only an admin may approve/reject an escalated case or restore removed content. `remove` is used for an already approved item; `restore` requires a fresh review. Expected-version failures mean another operator changed the case: reload it rather than resubmitting stale data.

## Reports and emergency takedowns

Reports are private, account-linked, rate-limited, and placed into a moderation case.

- For imminent harm, exposed personal information, credential theft, or clearly malicious application links, hide/disable the public item first and preserve its identifiers for review.
- For contested workplace claims, avoid adjudicating facts in public notes. Escalate and seek the minimum evidence needed under the organization’s policy.
- Never reveal a reporter or contributor to an employer through admin copy, exports, or support messages.
- Record the decision, reason code, changed fields, and linked case. Do not paste sensitive raw content into the reason.
- After removing or restoring salary/review data, refresh affected aggregates and verify that sparse cells remain suppressed.

The current escalation owner and response targets are recorded above. Escalate legal interpretation or statutory notification decisions to qualified counsel; do not improvise them in a moderation note.

## Employer submissions

Employer submissions are pending by default. A matching corporate email domain is a review signal, not proof of authority.

1. Validate the company identity and applicant-facing domain independently.
2. Review the role, employment/engagement type, salary units, location, work authorization, eligibility evidence, and expiry date.
3. Open the application destination in an isolated browser and reject credential collection, payment requests, URL shorteners, unexpected downloads, or domain mismatch.
4. Deduplicate against active source and employer listings.
5. Publish only after a reviewer can explain every public field and destination.
6. Recheck edits and expire/remove roles that can no longer be verified.

## Source operations

- Keep the Remotive pilot within the contract in [Data sources](DATA_SOURCES.md).
- On a provider policy change, set `REMOTIVE_SOURCE_ENABLED=false` immediately; code deployment is not required for that toggle.
- Database-backed sources can be paused/disabled independently. Do not use a source failure as permission to invent or reuse stale jobs.
- Monitor last successful import, error count, schema failures, stale/expired ratios, duplicate rate, and outbound destination changes.

The production `job-source-sync` worker validates the Remotive feed twice daily, replaces a description-free alert catalog, and records an import run without persisting source descriptions. Public pages use a separate twelve-hour cache; together these two consumers stay within four normal provider reads per day, and ordinary CI never calls the live feed. A worker success proves source validation and operational freshness, not a durable description copy. Set `REMOTIVE_SOURCE_ENABLED=false` when the policy or provider is in doubt; the worker must honor that switch before any provider call.

## Aggregate refresh

The daily `operations-maintenance` worker processes salary and company-rating queues through the restricted maintenance RPC. For an incident-only manual recovery, a restricted database operator can run:

```sql
select security.refresh_salary_aggregates();
select security.refresh_company_ratings();
```

Run this after a moderation batch and after withdrawals/removals. Then verify:

- salary cells have at least three distinct contributors;
- p25/p75 appear only at five or more distinct contributors;
- the 24-hour publication lag and 36-month lookback are respected;
- one contributor cannot inflate a cell with repeated submissions;
- removed/withdrawn contributions no longer affect current snapshots;
- public views expose no account or source-contribution identifiers.

The automated path runs only from a Netlify Function with a Functions-only production secret. Do not place the service-role key in browser code, build logs, preview contexts, or the repository.

## Worker and email operations

| Task key                 | Netlify function         | UTC schedule             | Success evidence                                                              | Failure action                                                                |
| ------------------------ | ------------------------ | ------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `job_source_sync`        | `job-source-sync`        | Daily at 01:05 and 13:05 | Source import row, description-free catalog count, and successful tracked run | Disable source on terms/schema failure; never substitute fabricated jobs      |
| `alert_delivery`         | `alert-delivery`         | Every ten minutes        | Claimed/sent/skipped/failed counts; provider message ID only                  | Retry with idempotency; terminal failures move to `dead` for operator review  |
| `currency_rates`         | `currency-rates`         | Daily at 02:25           | Reviewed InforEuro rate set, data month, source URL, and 42 cross-rates       | Keep the last disclosed set; UI must label it stale and allow manual override |
| `operations_maintenance` | `operations-maintenance` | Daily at 02:45           | Expiry, retention, delivery recovery, and aggregate counts                    | Run the focused RPC only after diagnosing the failed step                     |

Every function first creates an idempotent `private.worker_runs` row. Scheduled invocation keys prevent a duplicate Netlify delivery from running the same interval twice. Normal logs contain task keys, counts, provider-safe IDs, and error codes only—never recipient addresses, alert queries, contribution text, salary amounts, or secrets.

Alert delivery currently claims at most one recipient every ten minutes, for a hard ceiling of 144 claims per day before retries. Monitor pending count and oldest due delivery; move to a queue/background dispatcher before expected due volume reaches 100 per day or an item waits more than 20 minutes. Do not raise the per-invocation claim cap while the function remains under the 30-second scheduled-function deadline.

Authentication and alert email uses the verified `mail.salarypadi.com` Resend domain. Supabase Auth and the alert worker use separate restricted credentials. Auth templates use one-time token hashes verified by `/auth/confirm`, allowing a link to be opened safely in a different browser from the request. Open/click tracking is disabled. When testing delivery, send to an operational mailbox, confirm the visible sender and reply-to, and remove any synthetic alert after proof.

## Privacy requests

Assign every correction, export, account-deletion, and contribution-deletion request to `privacy@salarypadi.com`. Verify account ownership, identify derived/public copies, record the narrow resolution, and refresh affected projections/aggregates. Aggregate-only analytics counts are retained for 90 days; worker/delivery evidence for 180 days; reference-rate sets for 24 months. Account, contribution, audit, backup, legal-hold, and statutory timelines require case-specific review and must not be shortened by the maintenance worker.

## Daily checks

- `/api/health` responds, reports the expected provider configuration, and shows all four tracked workers inside their stale thresholds. Source-provider availability still needs its own run evidence.
- Public pages, sign-in, save/apply/alert flows, and admin gates behave as expected.
- Source freshness and outbound application links are within policy.
- Moderation, report, employer-submission, aggregate-refresh, and privacy queues have named owners and no unbounded age.
- Error, auth, and source-failure alerts have no unexplained spikes.
- No secret, raw contribution, salary amount, email, or application note appears in ordinary logs/analytics.

## Release checks

Follow [Deployment](DEPLOYMENT.md). Record the Git revision, migration set, environment change, test evidence, operator, and rollback artifact. Keep web deployment, database migration, scheduled jobs, and live smoke proof as separate evidence.

## Incident quick actions

| Incident                               | First safe action                                                      |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Remotive terms or availability problem | Set `REMOTIVE_SOURCE_ENABLED=false`                                    |
| Malicious/incorrect job destination    | Disable/remove the listing and preserve identifiers                    |
| Sensitive community content published  | Remove the public projection; restrict case access; escalate           |
| Account or staff compromise            | Suspend access, revoke sessions/role, rotate affected credentials      |
| Service-role exposure                  | Rotate immediately, inspect audit/data changes, redeploy clean secrets |
| Bad web release                        | Roll back to the previous immutable web artifact                       |
| Bad database migration                 | Stop writes if necessary and apply a reviewed forward-fix migration    |

After containment, use the complete incident process in [Security](SECURITY.md).
