# Deployment and rollback

SalaryPadi uses private repository `Ozaveshe/SalaryPadi`, Netlify project `salarypadi`, and dedicated Supabase project `bxelrhklsznmpksgrqep`. This document separates configured infrastructure from a successfully published and smoke-tested release.

## Environments

Use separate Supabase and web-hosting projects for local development, staging, and production. A release must never reuse AfroTools or LATMtools credentials.

Required web configuration:

| Variable                               | Production value                                   |
| -------------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | `https://salarypadi.com`                           |
| `NEXT_PUBLIC_SUPABASE_URL`             | Dedicated environment’s Supabase URL               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching publishable key                           |
| `REMOTIVE_SOURCE_ENABLED`              | `true` only while the reviewed pilot is approved   |
| `ATS_SOURCE_SYNC_ENABLED`              | `false` until a separately approved ATS activation |
| `ALLOW_DEMO_DATA`                      | Always `false`                                     |
| `ANALYTICS_PROVIDER`                   | `supabase_first_party`                             |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`      | `G-8W6LCTFSK2`                                     |
| `EMAIL_PROVIDER`                       | `resend`                                           |
| `CURRENCY_RATE_PROVIDER`               | `european_commission_inforeuro`                    |
| `TRANSACTIONAL_EMAIL_FROM`             | `SalaryPadi <updates@mail.salarypadi.com>`         |
| `TRANSACTIONAL_EMAIL_REPLY_TO`         | `support@salarypadi.com`                           |
| `RESEND_API_KEY`                       | Protected production secret, Functions scope only  |
| `SUPABASE_SERVICE_ROLE_KEY`            | Protected production secret, Functions scope only  |
| `JOB_SOURCE_SYNC_TOKEN`                | Independent protected internal-refresh bearer      |

Never expose a service-role key through a `NEXT_PUBLIC_*` variable. Production configuration rejects demo data.

Optional Netlify build configuration:

- `GITHUB_STATUS_TOKEN` is a protected, build-only fine-grained GitHub token with Metadata read and Actions read access to the private SalaryPadi repository. When present, `npm run deploy:verify` checks the latest `CI` workflow run for Netlify's `COMMIT_REF` and rejects a completed failed run before the application build. Missing credentials, a pending or absent run, and GitHub API failures are logged and skipped deliberately so a GitHub outage cannot take down deploys. The stronger dashboard-level control remains configuring Netlify to wait for required GitHub checks before publishing.

The GA4 tag is public configuration, but it remains entirely unloaded until the
versioned optional-analytics consent is granted. Keep enhanced measurement for
form interactions and site search disabled in the Google data stream, keep ad
signals and ad personalisation disabled, and do not reuse the AfroTools
measurement ID.

## Supabase preparation

1. Create a dedicated project and record its project reference in the secret manager/release record.
2. In Auth URL configuration, set the Site URL to the canonical origin and allow exactly the required `/auth/confirm` URLs for new token-hash email links plus `/auth/callback` during legacy-link compatibility.
3. Enable and test the approved MFA factor for staff accounts.
4. Keep the Data API exposed schemas restricted to `api`, matching `supabase/config.toml`.
5. Link the CLI only after verifying the project reference in both the command and dashboard:

```powershell
supabase link --project-ref <salarypadi-project-ref>
supabase db push --dry-run
supabase db push
```

6. Apply migrations in filename order. Do not edit an applied migration; add a new timestamped forward migration.
7. Run the database test suite locally against a clean stack and against a disposable staging project before production:

```powershell
supabase db reset
supabase test db
```

8. Bootstrap the first administrator using the two-person procedure in [Operations](OPERATIONS.md), then verify AAL2 access and audit output.

The hosted migration set through `20260710001000` is applied and recorded. Live API types are generated in `src/lib/supabase/database.types.ts`; the Phase Two operations suite adds 37 pgTAP assertions for worker authorization, idempotency, alert claims, analytics aggregation, rate provenance, maintenance, invoker-only public wrappers, narrow internal-routine resolution, and bounded source cadence. The repository-wide schema suite also requires forced RLS on every new private operations table. Supabase Auth uses `https://salarypadi.com` as its Site URL while retaining the Netlify production and preview confirmation/callback routes needed for rollback and deploy previews. Authentication email templates must send `TokenHash` to `/auth/confirm`; do not restore fragment or same-browser PKCE-only links.

The repository also prepares `20260711053000_ats_source_authorization.sql` and `20260711054000_ats_snapshot_lifecycle.sql`. Treat both as unapplied until the release evidence records the exact hosted migration versions and passing database tests. Applying them creates a fail-closed authorization/lifecycle boundary and registers the operational task; it does not configure, authorize, or enable an employer ATS source.

Before applying the ATS migrations:

1. Verify the connected project URL is exactly `https://bxelrhklsznmpksgrqep.supabase.co` and the project reference is `bxelrhklsznmpksgrqep`.
2. Review the authorization backfill for the existing employer-submission and Remotive rows. Unknown active sources will be paused.
3. Run the complete pgTAP suite on a clean local or disposable staging database, including authorization expiry/revocation, configuration drift, private-table privilege, generic budget, destination path, snapshot idempotency, partial/quarantine, and two-complete-omission cases.
4. Confirm generated API types do not expose private ATS configuration or authorization evidence to browser clients.
5. Prepare a forward-fix migration and source-pause procedure. Do not rely on a destructive down migration.

After applying them, and before allowing any ATS provider acquisition, verify an empty authorized-source list, a false claim for an unconfigured candidate, no public access to private ATS tables/evidence, and unchanged Remotive public/noindex/email-suppression behavior. Moniepoint and M-KOPA must remain absent or disabled until written permission is recorded.

## Web build and deployment

Use Node.js 22 LTS. The provider must support a Next.js Node server, dynamic request headers/cookies, proxy execution, and per-request CSP nonces.

Production is hosted by Netlify project `salarypadi`. Hostinger remains authoritative for DNS: the apex `A` record points to `75.2.60.5`, while `www` is a CNAME to `salarypadi.netlify.app`; Netlify owns certificate issuance and redirects `www` to the canonical apex.

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Deploy the immutable artifact produced from the reviewed Git revision. Standard commands are:

```text
Install: npm ci
Build:   npm run build
Start:   npm run start
```

Do not deploy as a static export; authentication, CSP, server-side source reads, and route handlers require the Node runtime.

## Transactional email and scheduled workers

- Hostinger is authoritative for the root mailbox records. `support@salarypadi.com` is the primary inbox; `privacy@`, `security@`, `sources@`, and `ops@` are aliases into it.
- Resend domain `mail.salarypadi.com` is verified in `eu-west-1`. SPF, DKIM, and return-path records are isolated on the subdomain so the Hostinger root mailbox SPF is not replaced.
- Supabase Auth uses the Resend SMTP integration and sender `SalaryPadi <updates@mail.salarypadi.com>`. Alert delivery uses a separate sending-only API key restricted to the SalaryPadi domain.
- Open/click tracking is not enabled. Alert mail contains only the recipient address, the matching public job facts, and SalaryPadi links; private notes, salary inputs, contribution text, and analytics identifiers are never included.

Published production deploys register these Netlify schedules:

| Function                 | Schedule (UTC)       | Stale after | Purpose                                                                                                                                                  |
| ------------------------ | -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `job-source-sync`        | `5 1,13 * * *`       | 14 hours    | Enforce source policy, read or revalidate the shared public Remotive cache, replace the description-free alert snapshot, and record source/import health |
| `ats-source-sync`        | `35 2,8,14,20 * * *` | 14 hours    | Record a safe skip while `ATS_SOURCE_SYNC_ENABLED=false`; otherwise claim at most two currently authorized employer ATS sources per invocation           |
| `alert-delivery`         | `*/10 * * * *`       | 35 minutes  | Claim due daily/weekly alerts idempotently and send matching jobs                                                                                        |
| `currency-rates`         | `25 2 * * *`         | 36 hours    | Store the current European Commission InforEuro monthly reference set and provenance                                                                     |
| `operations-maintenance` | `45 2 * * *`         | 36 hours    | Expire jobs, process aggregate queues, retry/dead-letter deliveries, and enforce retention                                                               |

The ATS schedule is operational scaffolding, not source authorization. Keep `ATS_SOURCE_SYNC_ENABLED=false`; with no seeded employer source/configuration, it must make no provider request. After written permission and final policy/config review, a controlled one-off gate activation may perform the claimed review-only production dry run. Return the gate to false while reviewing budget, snapshot, quarantine, moderation, and kill-switch evidence; leaving it true for schedules requires a separate named approval.

The `Production freshness` GitHub Actions workflow runs at 03:43, 09:43, 15:43, and 21:43 UTC, deliberately offset from the production browser canaries. It checks `/api/health`, every registered scheduled worker, and the key public routes through `node scripts/verify-production-freshness.mjs`. A failed check fails the workflow so GitHub's repository-owner workflow-failure email is the baseline alert channel; it requires no repository secret or external service.

After every production deploy, record the deploy's UTC published-at timestamp, then use Netlify's scheduled-function **Run now** control once for each function. After the runs finish, replace manual worker-row inspection with the exact timestamp check:

```powershell
node scripts/verify-production-freshness.mjs --expect-deploy-freshness 2026-07-13T14:00:00Z
```

Post-deploy mode requires every registered worker's `last_started_at` from `/api/health` to be strictly newer than the supplied deploy timestamp. It also retains the normal freshness and public-route checks. Use `--json` for a single machine-readable result; the default output prints one summary line per check. A configured schedule or a merely recent pre-deploy run is not post-deploy execution proof.

## Staging verification

Use a dedicated staging backend and non-sensitive test accounts.

- Confirm `/api/health` returns `status: ok` and the expected configuration flags. This is a configuration probe, not a dependency-connectivity check.
- Verify canonical URLs, robots rules, sitemaps, 404/error states, and security headers on the deployed origin.
- Complete public search, job attribution/application, take-home pay, offer comparison, and scam-checker journeys on mobile and desktop.
- Complete sign-in callback, sign-out, save/remove, application status, alerts, contributions, reporting, and employer submission.
- Verify one ordinary user cannot access another user’s rows using the pgTAP ownership tests and a browser smoke.
- Verify admin denial for ordinary users, AAL1 denial for staff, AAL2 staff access, stale-version rejection, and audit creation.
- Approve redacted review/interview test data and a threshold-crossing salary batch; verify no identity fields or sparse values reach public responses.
- Verify source attribution and that Remotive-backed pages remain `noindex` without `JobPosting` schema. Run the same `live-jobs.spec.ts` canary used by the scheduled production workflow.
- Verify the service-role ATS list/get/claim boundary returns no employer source unless its current terms, authorization, company, cadence, private configuration, and publication policy all agree.
- With a disabled staging fixture only, prove a policy/configuration change pauses the source, a partial/quarantined snapshot cannot close jobs, and only two consecutive complete omissions expire a published job.
- Verify cross-origin state changes, unsafe redirects, non-HTTPS destinations, oversized inputs, and raw HTML are rejected.

## Production release order

1. Confirm on-call, moderation, privacy, source, and database owners.
2. Record the release revision, dependency-audit disposition, migrations, configuration diff, and rollback artifact.
3. Back up the production database and verify restore status.
4. Apply backward-compatible database migrations first.
5. Deploy the web artifact.
6. Start each scheduled worker only after both schema and web compatibility are verified; run it manually once, then run `node scripts/verify-production-freshness.mjs --expect-deploy-freshness <deploy-UTC-timestamp>` and retain its output with the run ID, deploy ID, summary, and stale threshold. The ATS worker must produce a disabled safe skip with zero provider requests while `ATS_SOURCE_SYNC_ENABLED=false`.
7. Perform production smoke checks without creating real-looking public data.
8. Monitor errors, auth, queues, source health, and aggregate jobs through the agreed observation window.

## Rollback

### Web rollback

Redeploy the previous known-good immutable artifact and restore its environment configuration. Then verify health, auth cookies, private cache headers, CSP, and affected user journeys.

### Source rollback

Set `REMOTIVE_SOURCE_ENABLED=false` to stop the live pilot immediately. For database-backed sources, pause/disable the source and expire or remove content that cannot be trusted.

For an ATS-wide rollback, first set `ATS_SOURCE_SYNC_ENABLED=false`. For an individual future employer source, set the source to `paused` and its private configuration to `enabled=false`. If permission was withdrawn, record revocation and the non-sensitive reason. Company suspension/removal, authorization expiry/revocation, source pause, configuration disable, and the environment gate independently stop acquisition. Verify list/get returns no row, a new fetch claim returns false, no snapshot can begin/finalize, and public policy excludes its jobs. Use a reviewed forward migration if the database boundary itself is defective.

### Database rollback

Treat migrations as forward-only. Do not run destructive down migrations or restore the entire database merely to undo an application release. Stop affected writes if necessary, deploy a reviewed compatibility fix, and add a new migration that restores safe behavior. Use a point-in-time/database restore only under the approved disaster-recovery procedure, with explicit assessment of data loss and external side effects.

## Release evidence

Close every release with separate proof for:

- repository revision and clean build;
- CI checks;
- migration application and database tests;
- web deployment artifact;
- production route/header smoke;
- live dependency/source health;
- worker/schedule health for every registered production task, including a passing timestamp-bound `--expect-deploy-freshness` result after the manual post-deploy runs.

If the release includes ATS infrastructure, record separately that `ATS_SOURCE_SYNC_ENABLED=false`, candidate employers remain disabled, the authorized-source list is empty, the scheduled worker produced a safe skip, and no provider request occurred. If a later release enables a source, add the written-permission evidence reference, exact source/config policy, budget claim, complete snapshot outcome, quarantine count, public moderation result, and kill-switch smoke without including private correspondence or payloads.

End the release record with one outcome: `released`, `rolled back`, or `blocked`. A prepared artifact or green local build is not a live release.

The current production closeout is recorded as **released** in [Phase Two production release record](PHASE_TWO_RELEASE_RECORD.md).
