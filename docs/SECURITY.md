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
- Two Netlify edge rate-limit rules bound direct scripted use of the server-key-backed tool APIs (`/api/tools/*`, 20/60s per IP) and the OTP sign-in and auth routes (`/api/auth/*`, 10/60s per IP), which would otherwise allow one IP to flood third-party mailboxes with magic-link email.
- The anonymous first-party analytics counter is capped at one million events per day per event/route cell, so direct PostgREST calls cannot overflow or run the counter to absurd values; the fixed allow-listed key space already prevents row growth.
- Moderation transitions require a reason, use an expected version to prevent stale writes, and append actor/action state to audit records.
- Raw community content is private. Reviews and interview experiences publish from a separate redacted projection.
- Salary publication uses distinct-contributor thresholds, a 24-hour lag, a 36-month window, rounded values, and sparse-cell suppression. Individual salary submissions are never exposed through the public API.
- Demo data is opt-in and rejected when `NODE_ENV=production`.
- Analytics requires an explicit same-origin consent cookie, accepts only allowlisted events and coarse route groups, blocks sensitive free-text/salary fields, and stores daily aggregate counts without account, email, IP, user-agent, session, or event-level identifiers.

## Privacy operations

The database supports correction, export, account-deletion, and contribution-deletion requests. Requests must be handled by a named privacy owner under a documented jurisdiction-specific timetable before accounts are opened to the public.

Operational rules:

- Never copy raw contributions or account identifiers into issue trackers, analytics, chat tools, or ordinary application logs.
- Verify the requester through the authenticated account before fulfilling an export, correction, or deletion.
- Keep public redactions and aggregate refreshes in the same operational change as a contribution withdrawal or deletion.
- Ensure backups, derived aggregates, audit requirements, and legal holds are addressed in the organization’s retention policy.
- Record only the minimum resolution evidence needed; do not paste the sensitive payload into the audit reason.

The daily maintenance worker removes aggregate analytics counts after 90 days, worker and delivery evidence after 180 days, and currency reference sets after 24 months. It also deletes expired raw source records, but the Remotive policy remains stricter: descriptions are not durably stored at all. Account data, community submissions, immutable audit needs, backups, legal holds, and verified privacy requests follow the case-specific process in [Operations](OPERATIONS.md), not a blanket timer.

## Secrets and environment

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe project identifiers and must be configured together.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Do not place it in `.env` committed files, client bundles, preview logs, CI output, or browser code. Prefer a short server-side scheduled job with its own narrowly scoped secret store.
- `RESEND_API_KEY` is a separate sending-only key restricted to `mail.salarypadi.com`. It and the service-role key are Netlify production secrets scoped only to Functions.
- Rotate a secret immediately after suspected exposure and review the audit trail for use during the exposure window.
- Use separate Supabase projects and credentials for development, test, staging, and production.
- Do not use the configured AfroTools or LATMtools projects for SalaryPadi.

## Provider and data-region record

- Account, private career, moderation, operational, and first-party aggregate analytics data is stored in the dedicated Supabase project `bxelrhklsznmpksgrqep` in AWS `eu-north-1`.
- Authentication and alert email is sent through Resend's `eu-west-1` sending region from the isolated `mail.salarypadi.com` domain. Delivery necessarily discloses the recipient address and message contents to the mail provider; tracking metrics are not enabled.
- Netlify serves the web application and scheduled Functions through its managed platform and global delivery network. One site-scoped Blob stores only the current description-free Remotive alert catalog and is overwritten on each successful sync; no catalog history is retained. Hostinger is authoritative for DNS and the operational mailbox. Their current subprocessors and transfer terms must be reviewed through the provider contracts; this repository does not freeze a provider's live subprocessor list.
- European Commission InforEuro is fetched as public monthly reference data. No user or account data is sent with that request.

## Residual risks and operating requirements

- Dedicated Supabase project `bxelrhklsznmpksgrqep` is configured and the operations migration is applied; every new production deploy still requires separate hosted build, scheduler, database-advisor, and route proof.
- Staff pages require AAL2. The first production administrator's human-controlled TOTP factor and protected `/admin` session were verified on 2026-07-10; add a second named recovery administrator before relying on continuous staff coverage.
- Database rate limits are account-based. Add edge/network abuse controls and alerting before a public contribution launch; a corporate email match is only a signal, not proof of company ownership.
- Four tracked workers cover source validation, alert delivery, currency references, expiry, retention, and aggregate maintenance. A production log sink and external incident paging integration are still not configured, so Oza must inspect Netlify/Supabase health inside the documented stale thresholds.
- Human moderation remains necessary for personal information, threats, harassment, confidential material, defamation risk, manipulation, and employer brigading.
- The scam checker is an educational, explainable heuristic. It does not fetch or certify a URL and cannot guarantee legitimacy.
- Source availability and terms can change independently of a successful application build.
- `/api/health` (and the anon-executable `api.get_worker_health` behind it) intentionally reports configuration booleans and worker freshness without authentication because the deployment and operations runbooks and the scheduled smoke workflow consume it. This is an accepted reconnaissance trade-off: it exposes no secret values, only operational topology. Revisit if worker failure timing ever becomes a meaningful abuse signal.
- Next.js 16.2.10 is the current stable release and still pins an affected PostCSS version. The lockfile uses a tested `postcss@8.5.10` override; `npm audit` reports zero known vulnerabilities. Re-test the override on every Next.js upgrade and remove it once the framework pins a fixed compatible version.
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
- A moderator, privacy owner, security contact, source owner, and incident commander are named with monitored aliases and response targets.
- Backups and a restore drill are verified; retention and deletion jobs are active.
- Monitoring covers web errors, auth anomalies, moderation backlog, source failure/staleness, aggregate failures, and job validity.
- Secrets are stored only in provider secret stores and dependency/security findings have an explicit disposition.
