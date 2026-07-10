# Moderation and operations runbook

This runbook covers day-to-day handling of community contributions, reports, employer submissions, data sources, aggregates, privacy requests, and incidents. A dedicated SalaryPadi Supabase project is required; never run these procedures against AfroTools or LATMtools.

## Roles and access

- `moderator`: review contributions and reports, redact public copy, reject unsafe submissions, and escalate difficult cases.
- `data_quality`: manage jobs, imports, normalization, sources, and duplicate/expiry decisions.
- `admin`: manage roles, resolve escalated/restore actions, inspect audit records, and perform other privileged operations.

Every staff operation requires an authenticated active account. Moderation and administrative database transitions also require an AAL2 session. Staff should use named accounts; shared accounts are prohibited.

### Bootstrap the first administrator

The normal role function cannot create the first admin because there is no existing admin to authorize it. Bootstrap once, through a reviewed migration or a restricted SQL session:

1. Have the intended administrator sign in so `private.profiles` contains their auth user ID.
2. Enrol an approved MFA factor and verify the project can issue an AAL2 session.
3. Obtain two-person review of the exact user UUID and reason.
4. In a transaction, insert the role and inspect the returned row:

```sql
begin;

insert into private.user_roles (user_id, role, granted_by, reason)
select user_id, 'admin'::private.staff_role, null, 'Initial admin bootstrap: change-ticket-ID'
from private.profiles
where user_id = '00000000-0000-0000-0000-000000000000'
returning user_id, role, granted_at;

commit;
```

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

The organization must name an escalation owner and publish response targets before launch. The repository does not itself create an on-call rotation or legal/takedown mailbox.

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

No scheduled import worker is shipped in this repository. The current Remotive adapter reads and caches the live source directly. Database import tables support a future reviewed pipeline; they are not evidence that a scheduler is running.

## Aggregate refresh

Approval/removal queues affected salary or company-rating metrics, but no scheduler consumes that queue in this repository. Until a reviewed server-side worker exists, a restricted database operator can run:

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

Automate this only from a server-side job whose secret is stored outside the repository. Do not place the service-role key in browser code.

## Privacy requests

Assign every correction, export, account-deletion, and contribution-deletion request to the privacy owner. Verify account ownership, identify derived/public copies, record the narrow resolution, and refresh affected projections/aggregates. The organization must define applicable deadlines, backup treatment, legal holds, and deletion proof before launch.

## Daily checks

- `/api/health` responds and reports the expected backend/source configuration. This endpoint does not prove database or Remotive connectivity.
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
