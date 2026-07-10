# Security and privacy

This document describes the repository’s current controls and the work required before production launch. It is an engineering review, not a claim of legal compliance or a substitute for jurisdiction-specific privacy advice.

## Security model

SalaryPadi handles public job metadata, private career activity, employer submissions, community workplace reports, salary data, and privileged moderation operations. The highest-risk outcomes are account takeover, disclosure of contributor identity or salary, unsafe publication of personal/defamatory content, unauthorized staff actions, source-policy violations, and malicious outbound links.

The application follows these boundaries:

| Data class              | Examples                                                                    | Handling                                                         |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Public                  | Approved jobs, source attribution, redacted reviews, thresholded aggregates | Read through approved server logic or `api` views only           |
| Account-private         | Saved jobs, applications, alerts, own submissions and reports               | Owner-scoped RLS; private no-store pages                         |
| Moderation-confidential | Raw salary submissions, review/interview text, reports, cases, flags        | Private schema; moderator/admin access with AAL2                 |
| Restricted operations   | Staff roles, audit events, raw imports, aggregate refresh                   | Reviewed SQL or narrowly granted security-definer functions      |
| Secrets                 | Service-role key, deployment credentials                                    | Server environment or secret manager only; never `NEXT_PUBLIC_*` |

## Implemented controls

- Supabase sessions are checked with verified claims; protected routes redirect anonymous users.
- Staff authorization is enforced in both the application and database. Privileged moderation and role changes require an AAL2 session.
- Base tables use row-level security, with force-RLS on the protected schemas. PostgREST exposes only the `api` schema in the local configuration.
- Security-definer functions set an empty search path and use explicit schema references.
- State-changing HTTP routes reject cross-origin requests, validate bounded inputs, and use safe redirect paths.
- Production rejects a missing, non-HTTPS, or loopback canonical origin so metadata and same-origin checks cannot silently use localhost.
- External destinations accept HTTPS URLs under explicit fixed-host policy; suffix-collision hosts are rejected and source HTML is converted to plain text.
- A nonce-based Content Security Policy, frame denial, MIME sniffing protection, restrictive permissions policy, and no-store headers protect browser surfaces.
- Contribution, alert, employer-submission, privacy-request, and reporting functions enforce per-account database rate limits.
- Moderation transitions require a reason, use an expected version to prevent stale writes, and append actor/action state to audit records.
- Raw community content is private. Reviews and interview experiences publish from a separate redacted projection.
- Salary publication uses distinct-contributor thresholds, a 24-hour lag, a 36-month window, rounded values, and sparse-cell suppression. Individual salary submissions are never exposed through the public API.
- Demo data is opt-in and rejected when `NODE_ENV=production`.
- Analytics currently defaults to a privacy-safe no-op and blocks sensitive free-text/salary fields from its typed event surface.

## Privacy operations

The database supports correction, export, account-deletion, and contribution-deletion requests. Requests must be handled by a named privacy owner under a documented jurisdiction-specific timetable before accounts are opened to the public.

Operational rules:

- Never copy raw contributions or account identifiers into issue trackers, analytics, chat tools, or ordinary application logs.
- Verify the requester through the authenticated account before fulfilling an export, correction, or deletion.
- Keep public redactions and aggregate refreshes in the same operational change as a contribution withdrawal or deletion.
- Ensure backups, derived aggregates, audit requirements, and legal holds are addressed in the organization’s retention policy.
- Record only the minimum resolution evidence needed; do not paste the sensitive payload into the audit reason.

No automated retention/purge scheduler is included in this repository. `retention_expires_at` exists for raw source records, but a production operator must implement and verify deletion before any source policy allows raw-payload retention. Remotive data must not be durably archived in the interim.

## Secrets and environment

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe project identifiers and must be configured together.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Do not place it in `.env` committed files, client bundles, preview logs, CI output, or browser code. Prefer a short server-side scheduled job with its own narrowly scoped secret store.
- Rotate a secret immediately after suspected exposure and review the audit trail for use during the exposure window.
- Use separate Supabase projects and credentials for development, test, staging, and production.
- Do not use the configured AfroTools or LATMtools projects for SalaryPadi.

## Known launch blockers and residual risks

- No dedicated hosted SalaryPadi Supabase project or production deployment has been verified.
- Staff pages require AAL2, but factor enrolment and challenge must be tested end to end against the chosen Supabase project before staff access is enabled.
- Database rate limits are account-based. Add edge/network abuse controls and alerting before a public contribution launch; a corporate email match is only a signal, not proof of company ownership.
- No retention worker, alert delivery worker, import scheduler, aggregate scheduler, production log sink, or incident alert integration is configured here.
- Human moderation remains necessary for personal information, threats, harassment, confidential material, defamation risk, manipulation, and employer brigading.
- The scam checker is an educational, explainable heuristic. It does not fetch or certify a URL and cannot guarantee legitimacy.
- Source availability and terms can change independently of a successful application build.
- The current `npm audit --omit=dev` reports two moderate PostCSS advisories inside Next.js 16.2.10. That is the current latest stable Next.js release and still pins PostCSS 8.4.31; npm proposes an unsafe forced downgrade to Next.js 9.3.3, so the finding remains an explicitly accepted launch risk pending an upstream release.
- Dependency findings can change after this review. Run `npm audit --omit=dev` during every release; assess exploitability and supported upgrades rather than applying forced/downgrade fixes blindly.

## Incident response

1. Contain: disable the affected source or route, revoke/rotate credentials, suspend the account, or unpublish the affected projection.
2. Preserve: record timestamps, affected identifiers, deployment revision, and relevant immutable audit events without expanding access to raw sensitive data.
3. Assess: identify data classes, accounts, source rights, and public surfaces involved.
4. Eradicate: patch the smallest responsible boundary, invalidate sessions if needed, and apply a forward-only database migration.
5. Recover: redeploy, re-run focused unit/database/browser tests, verify health and affected user journeys, and monitor for recurrence.
6. Notify: follow the organization’s approved legal, provider, and user-notification process. Do not improvise disclosure obligations in an incident channel.
7. Learn: add a regression test and update this runbook.

## Pre-launch security gate

- Dedicated SalaryPadi projects exist for staging and production; cross-project keys are rejected.
- Staff MFA enrolment, challenge, recovery, and role revocation have been tested with two operators.
- All migrations and pgTAP tests pass on a clean database and a staging clone.
- Owner isolation and public-projection privacy thresholds have been retested after the final migration.
- CSP/security headers, authentication gates, open-redirect defenses, external links, and no-store behavior are verified in a production build.
- A moderator, privacy owner, security contact, source owner, and incident commander are named.
- Backups and a restore drill are verified; retention and deletion jobs are active.
- Monitoring covers web errors, auth anomalies, moderation backlog, source failure/staleness, aggregate failures, and job validity.
- Secrets are stored only in provider secret stores and dependency/security findings have an explicit disposition.
