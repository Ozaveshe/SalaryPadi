# SalaryPadi

SalaryPadi is an Africa-first job and career-intelligence product. The current launch market is Nigeria. It combines source-attributed remote jobs, private job tracking, moderated salary and workplace contributions, and local decision tools for take-home pay, offer comparison, and job-scam screening.

The repository is deployable without fabricated data: public tools and trust pages work without a backend, the constrained Remotive pilot can be disabled, and account-backed features clearly require a dedicated SalaryPadi Supabase project.

## What is included

- Searchable remote-job pages with explicit location-eligibility evidence, source attribution, freshness, and external application links.
- Private saved jobs, application tracking, and job alerts through Supabase Auth and row-level security.
- Moderated salary, company-review, and interview contributions with private raw submissions and redacted public projections.
- Employer job submissions that remain pending until reviewed.
- Admin surfaces protected by both a staff role and an AAL2 session.
- Nigeria take-home pay, side-by-side offer comparison, and an explainable job-scam checker.
- Scheduled source-health, alert-delivery, currency-rate, retention, expiry, and aggregate-maintenance workers with idempotent run evidence.
- Consent-gated first-party analytics that stores daily event totals only, plus reviewed European Commission InforEuro reference rates.
- Canonical metadata, sitemaps, robots controls, structured data, accessibility foundations, CSP nonces, and baseline security headers.

## Prerequisites

- Node.js 22 LTS and npm.
- A dedicated SalaryPadi Supabase project for authentication or persistent data. Never reuse the AfroTools or LATMtools projects.
- Docker and the Supabase CLI only when running the database locally.

## Start locally

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. With the Supabase values left blank, public pages and local-only tools remain available; authenticated features show setup-aware states. `REMOTIVE_SOURCE_ENABLED=true` enables the reviewed remote-job pilot and performs a server-side source read cached for six hours.

Before using accounts, set these values in `.env.local` from a dedicated SalaryPadi project:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`SUPABASE_SERVICE_ROLE_KEY` is optional and must remain server-only. The browser application does not need it. See [Deployment](docs/DEPLOYMENT.md) before adding it to any environment.

## Database setup

The local Supabase configuration exposes only the `api` schema through PostgREST. Migrations are ordered and forward-only:

1. `20260710000100_foundation.sql` — accounts, staff roles, privacy requests, rate limits, and audit records.
2. `20260710000200_jobs.sql` — sources, jobs, eligibility, saved jobs, applications, alerts, and employer submissions.
3. `20260710000300_intelligence.sql` — contributions, moderation, public projections, privacy thresholds, and aggregates.
4. `20260710000400_public_product_integration.sql` — public job/company projections used by the production application.
5. `20260710000500_lock_internal_routines.sql` — removes implicit PUBLIC execution from internal and API routines.
6. `20260710000600_operations_phase_two.sql` — worker schedules and run evidence, alert delivery, aggregate-only analytics, reviewed currency-rate provenance, and retention maintenance.
7. `20260710000700_harden_public_operational_wrappers.sql` — moves privileged analytics/health implementations behind invoker-only API wrappers.
8. `20260710000800_allow_operational_wrapper_resolution.sql` — grants only the schema resolution required by those explicit wrappers.
9. `20260710000900_force_operations_rls.sql` — forces RLS for table owners on every new private operations table.

With Docker running and the Supabase CLI installed:

```powershell
supabase start
supabase db reset
supabase test db
```

`supabase db reset` destroys the local database only. Never point local reset commands at a hosted project. Remote migration and first-admin procedures are documented in [Deployment](docs/DEPLOYMENT.md) and [Operations](docs/OPERATIONS.md).

## Quality commands

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Production builds deliberately require an explicit non-loopback HTTPS origin. For a local artifact check, use a reserved test origin without deploying it:

```powershell
$env:NEXT_PUBLIC_APP_URL = "https://salarypadi.test"
npm run build
```

`npm run quality` runs lint, type checking, unit tests, and a production build, so set that origin first. Playwright starts the application automatically. CI keeps deterministic build gates independent of Remotive, runs public browser journeys against the live pilot when available, and records a separate non-blocking live-source probe for upstream outages.

## Repository map

```text
src/app/                 Next.js routes and route handlers
src/components/          Shared product UI
src/lib/                 Domain logic, validation, repositories, and security helpers
supabase/migrations/     Versioned database schema and database API
supabase/tests/database/ pgTAP ownership, moderation, and privacy tests
tests/e2e/               Public browser and accessibility journeys
docs/                    Product, source, security, deployment, and operations guidance
netlify/functions/       Scheduled production workers and their shared adapters
```

## Operational documentation

- [Product plan](docs/PRODUCT_PLAN.md)
- [Data sources and provenance](docs/DATA_SOURCES.md)
- [Security and privacy](docs/SECURITY.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Moderation and operations](docs/OPERATIONS.md)

## Production operations

Production uses the dedicated Supabase project `bxelrhklsznmpksgrqep`, Netlify project `salarypadi`, and Hostinger-managed `salarypadi.com` DNS and mailbox. Resend sends authentication and alert email from the verified `mail.salarypadi.com` subdomain. Operational contacts route to the `support@salarypadi.com` mailbox through the aliases documented in [Operations](docs/OPERATIONS.md).

The scheduled workers run only from a published Netlify production deploy. Their service-role and Resend keys are Functions-only protected variables; they must never be copied into `.env.local`, GitHub Actions, preview logs, or browser code. A release is not operationally complete until the workers have each produced a successful live run and `/api/health` reports them within their stale thresholds.
