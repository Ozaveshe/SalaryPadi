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
```

## Operational documentation

- [Product plan](docs/PRODUCT_PLAN.md)
- [Data sources and provenance](docs/DATA_SOURCES.md)
- [Security and privacy](docs/SECURITY.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Moderation and operations](docs/OPERATIONS.md)

## Current external dependencies

A real production launch still requires a dedicated hosted Supabase project, a configured deployment target and canonical origin, a tested staff MFA journey, named moderation/privacy owners, and production monitoring. Do not describe a local build or an unapplied migration as a live deployment.
