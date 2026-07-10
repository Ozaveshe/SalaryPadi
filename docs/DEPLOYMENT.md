# Deployment and rollback

SalaryPadi uses private repository `Ozaveshe/SalaryPadi`, Netlify project `salarypadi`, and dedicated Supabase project `bxelrhklsznmpksgrqep`. This document separates configured infrastructure from a successfully published and smoke-tested release.

## Environments

Use separate Supabase and web-hosting projects for local development, staging, and production. A release must never reuse AfroTools or LATMtools credentials.

Required web configuration:

| Variable                               | Production value                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | `https://salarypadi.com`                                                          |
| `NEXT_PUBLIC_SUPABASE_URL`             | Dedicated environment’s Supabase URL                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching publishable key                                                          |
| `REMOTIVE_SOURCE_ENABLED`              | `true` only while the reviewed pilot is approved                                  |
| `ALLOW_DEMO_DATA`                      | Always `false`                                                                    |
| `ANALYTICS_PROVIDER`                   | `none` until a privacy-reviewed adapter exists                                    |
| `SUPABASE_SERVICE_ROLE_KEY`            | Omit from the web application unless a reviewed server-only operation requires it |

Never expose a service-role key through a `NEXT_PUBLIC_*` variable. Production configuration rejects demo data.

## Supabase preparation

1. Create a dedicated project and record its project reference in the secret manager/release record.
2. In Auth URL configuration, set the Site URL to the canonical origin and allow exactly the required `/auth/callback` URLs for the environment.
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

The hosted migration set through `20260710000500` is applied and recorded. Live API types are generated in `src/lib/supabase/database.types.ts`; the four pgTAP suites pass against the hosted database. Supabase Auth uses `https://salarypadi.com` as its Site URL while retaining the Netlify production and preview callbacks needed for rollback and deploy previews.

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

## Staging verification

Use a dedicated staging backend and non-sensitive test accounts.

- Confirm `/api/health` returns `status: ok` and the expected configuration flags. This is a configuration probe, not a dependency-connectivity check.
- Verify canonical URLs, robots rules, sitemaps, 404/error states, and security headers on the deployed origin.
- Complete public search, job attribution/application, take-home pay, offer comparison, and scam-checker journeys on mobile and desktop.
- Complete sign-in callback, sign-out, save/remove, application status, alerts, contributions, reporting, and employer submission.
- Verify one ordinary user cannot access another user’s rows using the pgTAP ownership tests and a browser smoke.
- Verify admin denial for ordinary users, AAL1 denial for staff, AAL2 staff access, stale-version rejection, and audit creation.
- Approve redacted review/interview test data and a threshold-crossing salary batch; verify no identity fields or sparse values reach public responses.
- Verify source attribution and that Remotive-backed pages remain `noindex` without `JobPosting` schema.
- Verify cross-origin state changes, unsafe redirects, non-HTTPS destinations, oversized inputs, and raw HTML are rejected.

## Production release order

1. Confirm on-call, moderation, privacy, source, and database owners.
2. Record the release revision, dependency-audit disposition, migrations, configuration diff, and rollback artifact.
3. Back up the production database and verify restore status.
4. Apply backward-compatible database migrations first.
5. Deploy the web artifact.
6. Start any new worker only after both schema and web compatibility are verified. This repository currently ships no import, alert, purge, or aggregate scheduler.
7. Perform production smoke checks without creating real-looking public data.
8. Monitor errors, auth, queues, source health, and aggregate jobs through the agreed observation window.

## Rollback

### Web rollback

Redeploy the previous known-good immutable artifact and restore its environment configuration. Then verify health, auth cookies, private cache headers, CSP, and affected user journeys.

### Source rollback

Set `REMOTIVE_SOURCE_ENABLED=false` to stop the live pilot immediately. For database-backed sources, pause/disable the source and expire or remove content that cannot be trusted.

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
- worker/schedule health, when such workers exist.

End the release record with one outcome: `released`, `rolled back`, or `blocked`. A prepared artifact or green local build is not a live release.
