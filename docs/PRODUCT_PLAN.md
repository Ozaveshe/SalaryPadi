# SalaryPadi Product Plan

Last updated: 2026-07-10

## Product outcome

SalaryPadi is the career truth layer for Africans: a mobile-first place to find jobs a candidate can actually apply for, understand the real value of compensation, assess the employer and vacancy, and decide what to do next. The launch market is Nigeria, with explicit modelling for later country expansion.

The MVP is intentionally narrower than a social network or employer ATS. Its complete loop is:

1. Discover a source-attributed vacancy.
2. Confirm country, work-authorisation, timezone and employment eligibility without treating the word “remote” as evidence.
3. Inspect compensation, employer context, source freshness and explainable trust indicators.
4. Save or apply on the employer’s trusted external site and privately track progress.
5. Contribute salary, review or interview evidence through a moderated, anonymous public process.
6. Use the take-home, offer comparison and scam-checking tools for a practical decision.

## Phase 0 existing-state audit

Status: complete.

- The repository was an unborn Git repository containing only `.git/`; there was no user code or history to preserve.
- There was no package manifest, application, design system, database, authentication, test suite, CI, deployment configuration, environment file or repository-local guidance.
- The official current Next.js scaffolder was used on 2026-07-10. The foundation is Next.js 16.2.10, React 19.2.4, TypeScript 5.9, Tailwind CSS 4.3 and the App Router on Node.js 24.
- The dedicated hosted project is Supabase `bxelrhklsznmpksgrqep`. Its Data API exposes only `api`; the unrelated AfroTools and LATMtools projects remain out of scope.
- The private GitHub repository is `Ozaveshe/SalaryPadi`. Netlify project `salarypadi` is configured for the production build and public Supabase variables.
- Current official framework documentation was checked before choosing the stack. Statutory and source-policy research is recorded below and in the rule/source metadata committed with the implementation.

## Product and design principles

- Start with the user’s task, not a marketing hero. Search is the first primary control on the home page.
- Use compact, data-rich results and progressive disclosure instead of nested cards.
- State evidence and uncertainty plainly. A badge says exactly what was verified; it never promises safety.
- Keep employer-provided, public factual, community-reported and SalaryPadi-calculated information visually and semantically separate.
- Render public content on the server by default and add client JavaScript only where interaction requires it.
- Use semantic tokens and native HTML controls, visible focus states, 44px preferred touch targets, reduced-motion support and WCAG 2.2 AA contrast.
- Development fixtures are opt-in, visibly marked and blocked in production.

## Information architecture and route inventory

Routes are implemented only when their current phase provides useful behaviour. Protected and sparse routes are noindexed.

| Route                                                                               | Phase | Access    | Functional outcome                                         |
| ----------------------------------------------------------------------------------- | ----- | --------- | ---------------------------------------------------------- |
| `/`                                                                                 | 1–2   | Public    | Search-first home, verified jobs, salary entry and tools   |
| `/about`, `/methodology`, `/trust-and-safety`, `/privacy`, `/terms`                 | 1     | Public    | Trust, provenance, moderation and privacy commitments      |
| `/auth/sign-in`, `/auth/callback`                                                   | 1     | Public    | Supabase magic-link/OTP authentication                     |
| `/admin`                                                                            | 1     | Admin     | Protected operations overview                              |
| `/jobs`, `/jobs/remote`, `/jobs/nigeria`                                            | 2     | Public    | URL-persisted search, filters, sorting and pagination      |
| `/jobs/[slug]`                                                                      | 2     | Public    | Job detail, truth card, source evidence and external apply |
| `/saved`, `/applications`, `/alerts`                                                | 2     | Signed in | Private saved jobs, application tracker and alerts         |
| `/admin/jobs`, `/admin/imports`, `/admin/sources`                                   | 2     | Admin     | Job/source/import moderation and retry controls            |
| `/companies`, `/companies/[slug]`                                                   | 3     | Public    | Company facts, jobs and confidence-labelled intelligence   |
| `/companies/[slug]/salaries`                                                        | 3     | Public    | Thresholded salary aggregates                              |
| `/companies/[slug]/reviews`                                                         | 3     | Public    | Approved reviews and confidence labels                     |
| `/companies/[slug]/interviews`                                                      | 3     | Public    | Approved interview experiences                             |
| `/salaries`, `/salaries/[country]/[role]`                                           | 3     | Public    | Search and safely broadened/suppressed aggregates          |
| `/contribute`, `/contribute/salary`, `/contribute/review`, `/contribute/interview`  | 3     | Signed in | Validated pending contributions                            |
| `/admin/companies`, `/admin/moderation`, `/admin/reports`, `/admin/users`           | 3     | Admin     | Moderation, reports and role-aware operations              |
| `/tools`, `/tools/take-home-pay`, `/tools/offer-compare`, `/tools/job-scam-checker` | 4     | Public    | Three complete decision tools                              |
| `/post-a-job`                                                                       | 5     | Signed in | Moderated employer submission                              |
| `/admin/calculation-rules`                                                          | 4–5   | Admin     | Versioned payroll-rule inspection and management           |

## Data model

PostgreSQL is the source of truth. Public identifiers are UUIDs; public page identity uses unique slugs. Enum-like values use constrained text or PostgreSQL enums where migrations remain easy to evolve. Money is stored as integer minor units plus ISO currency and original pay period; normalized values never overwrite original values.

Core identity and access:

- `profiles`, `user_roles`
- Supabase `auth.users` as the identity provider
- role helpers that derive privileges from server-validated database state, never client claims alone

Company and job ingestion:

- `companies`, `company_aliases`, `company_locations`, `company_claims`, `company_benefits`
- `job_sources`, `import_runs`, `raw_job_records`, `jobs`, `job_locations`, `job_eligibility`
- `skills`, `job_skills`
- source ID uniqueness and content/fingerprint uniqueness support idempotency and deduplication
- raw payload storage is permitted only when the source policy allows it

Private candidate data:

- `saved_jobs`, `applications`, `alerts`
- every row is owner-scoped by RLS and absent from public aggregates

Community intelligence:

- `salary_submissions`, `salary_aggregates`, `company_reviews`, `interview_experiences`
- authenticated ownership is private; public reads use approved, redacted projections or aggregates
- employer-role-country salary aggregates require a configurable minimum of three sufficiently similar approved submissions

Trust, moderation and operations:

- `reports`, `moderation_cases`, `moderation_actions`
- immutable moderation actions preserve actor, reason, timestamp, previous state and new state
- `employer_job_submissions`, `calculation_rule_versions`, `currency_rate_metadata`, `analytics_consents`

## Authorisation and row-level security

- RLS is enabled for every application-owned table.
- Public tables expose only approved/public rows through explicit SELECT policies or safe views.
- Owner tables compare `auth.uid()` to `user_id` for SELECT/INSERT/UPDATE/DELETE.
- Community submissions are account-linked but never publicly expose `user_id`.
- Moderators and administrators use database role membership checked by a `security definer` helper with a fixed `search_path`.
- Administrative writes require both server-side role checks and RLS; the service-role key is never browser-exposed.
- Moderation state changes use constrained transitions and append an audit action.
- Account deletion and export are supported by explicit server workflows; deletion policy distinguishes legal/abuse retention from user-facing removal.

## Data-source strategy

Priority order:

1. Moderated, verified employer submissions.
2. Explicit partner feeds.
3. Permitted job APIs with documented attribution and storage rules.
4. Selected employer ATS feeds after employer/source terms are reviewed.
5. Moderated manual additions.

All adapters implement the same boundary: fetch, validate raw response, map to a source record, normalize, hash, deduplicate, upsert, mark last-seen and expire missing jobs. Eligibility evidence is stored separately from the classification. A direct employer source wins when fingerprints collide.

No adapter for LinkedIn, Glassdoor or Indeed is permitted. SalaryPadi never copies third-party reviews, salary submissions or interview experiences.

### Source-policy matrix

| Source                          | Status                   | Full description storage                                     | Indexing / `JobPosting`           | Attribution / destination                              | Decision                                                                             |
| ------------------------------- | ------------------------ | ------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Verified employer submission    | Intake implemented       | Yes, after authorisation confirmation                        | Yes, only while approved and open | Employer application URL                               | Primary first-party path once the backend and moderation owner exist                 |
| Remotive public API             | Active constrained pilot | Active response cache only; no durable raw/full-text archive | No indexing or `JobPosting`       | Visible Remotive attribution and returned Remotive URL | Enabled by default, at most four refreshes daily, with an explicit unavailable state |
| Greenhouse Job Board API        | Architecture only        | Per-employer review required                                 | Per-employer review required      | Original employer/ATS URL                              | Do not enable globally; approve one employer at a time                               |
| Lever / Ashby public job boards | Architecture only        | Per-employer review required                                 | Per-employer review required      | Original employer/ATS URL                              | Do not enable until terms and employer scope are recorded                            |
| Development fixtures            | Development/test only    | Local synthetic records                                      | Never in production               | Clearly labelled                                       | Guarded by `ALLOW_DEMO_DATA`; production fails closed                                |

Each active `job_sources` row records terms URL, terms-review date, attribution, storage, indexing, structured-data permission, destination rule, refresh interval, last success and status.

## Implementation phases

### Phase 1 — Foundation

- Next.js App Router, strict TypeScript, linting and repeatable installs.
- Token-based visual system, responsive shell, skip link, semantic landmarks and reduced motion.
- Supabase SSR clients, sign-in/callback/sign-out, protected route boundary and server-side admin checks.
- Initial migration with tables, constraints, triggers, indexes and deny-by-default RLS.
- Trust/legal pages and a functional admin overview.
- Verification: lint, typecheck, unit tests, production build and unauthenticated route checks.

### Phase 2 — Job vertical slice

- Source adapter contract and one policy-approved adapter end to end.
- Validation, normalization, eligibility classification, salary/location normalization, fingerprinting, idempotency and expiry.
- Search, accessible filters, shareable URL state, relevance/newest/salary sorts and bounded pagination.
- Job detail with Job Truth Card, safe external apply, source/freshness evidence, WhatsApp sharing and report action.
- Saved jobs, application tracker, alerts and job/import/source administration.

### Phase 3 — Company and salary intelligence

- Company facts, active/previous jobs, benefits and confidence/freshness labels.
- Authenticated salary, review and interview submissions, all pending by default.
- Moderation transitions, redaction, reports and immutable audit trail.
- Thresholded salary aggregates and minimum review sample rules; individual raw salaries are never public.

### Phase 4 — Tools

- Nigeria take-home calculator driven by versioned, effective-dated authoritative rules.
- Offer comparison with currency/pay-period normalization, guaranteed value, benefit value, personal work costs and non-financial differences.
- Explainable text/answer-based scam checker with cautious risk language and no URL fetching.

### Phase 5 — Growth and discoverability

- Per-route metadata, canonical URLs, breadcrumbs, segmented sitemaps and robots rules.
- Valid source-permitted `JobPosting`, `Organization` and `BreadcrumbList` JSON-LD only.
- Expired-job search handling and noindex controls for private/thin/sparse surfaces.
- Privacy-safe analytics event abstraction with a denylist for salary, free text, notes, email and other PII.
- Employer submission, sharing, caching and performance tuning.

### Phase 6 — Launch hardening

- Security, privacy and abuse review; CSP and baseline security headers.
- Keyboard, screen-reader semantics, axe checks, reduced motion and 360/768/desktop visual QA.
- Loading, empty, error and retry states.
- Full tests, production build, dependency audit, environment example, deployment guide and operations runbook.

## Test strategy

Unit tests cover normalization, eligibility evidence, fingerprints, expiry, salary aggregation/privacy thresholds, payroll rules, offer comparison and scam flags.

Database/integration tests cover RLS ownership, admin authorization, contribution state, moderation transitions, import idempotency and employer submission. These require either a dedicated SalaryPadi project or a local Supabase stack.

Playwright covers search/filter, job/apply, authentication gates, saving/tracking/alerts, contributions, all tools, moderation and reporting. Public no-credential flows must run in CI; authenticated tests use a dedicated test project and seeded accounts.

Quality gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run build`
- dependency audit
- accessibility and responsive browser checks
- structured-data checks

## Security and privacy risks

| Risk                            | Initial control                                                                 | Residual / operational requirement                              |
| ------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Contributor identity disclosure | RLS, safe public views, no identity fields in browser payloads                  | Review logs/exports and moderator access regularly              |
| Stored XSS/defamation/doxxing   | Plain-text rendering, server validation, moderation, redaction, CSP             | Human moderation and takedown SLA remain necessary              |
| Admin/auth bypass               | SSR auth, server role checks, RLS, no client-only authority                     | Test every protected endpoint against anonymous/member accounts |
| CSRF                            | SameSite auth cookies, Origin checks and framework protections on state changes | Verify deployment proxy preserves correct host/origin           |
| Job/apply phishing              | URL validation, source evidence, report workflow, risk indicators               | Verification is not a safety guarantee; recheck sources         |
| SSRF                            | Initial scam checker does not fetch URLs; adapters use fixed source hosts       | Threat-model any future fetch/preview feature before launch     |
| Salary re-identification        | Minimum sample threshold, grouping/broadening, no raw public rows               | Monitor sparse dimensions and insider access                    |
| Analytics leakage               | Typed allowlisted events; prohibited-field runtime guard                        | Audit downstream vendor configuration before enabling           |
| Stale tax/currency output       | Versioned effective dates, source links, freshness notices                      | Named owner and review cadence required                         |
| Supply-chain compromise         | Lockfile, minimal dependencies, CI audit                                        | Current transitive advisories require upstream monitoring       |

The product is designed with the Nigeria Data Protection Act in mind, but documentation and controls do not by themselves constitute legal compliance.

## External credentials and decisions needed

- A project-specific SalaryPadi Supabase MCP target would improve future operations; project-scoped CLI and dashboard access are active now.
- The canonical custom domain is `https://salarypadi.com`. Hostinger is authoritative for DNS and Netlify serves the production application; the `netlify.app` origin remains available for deploy previews and rollback diagnostics.
- Transactional email configuration for authentication and alerts.
- A recurring terms-review owner for the active Remotive pilot and each future source.
- Currency-rate provider and licensing decision before any automated live rates; the MVP uses explicit user-entered rates.
- Privacy-safe analytics provider decision; analytics remains a no-op until explicitly configured.
- Human moderation owner, appeal/takedown channel and operational response targets.

## Decisions and assumptions

- Nigeria is the default market, represented as `NG`, not a hardcoded only market.
- English is the launch language.
- Authentication uses Supabase cookie-based SSR sessions and passwordless email initially.
- External employer application is the MVP apply path.
- No payslip uploads, arbitrary URL fetching, billing, CV builder, social graph, direct messaging or hosted one-click applications.
- Public salary data is suppressed below the configurable threshold of three; review ratings use a separate configurable threshold.
- Currency conversions identify their rate, source and timestamp and are estimates.
- Until a dedicated backend exists, credential-dependent flows fail closed with a useful setup state; they do not silently store private data in the browser.

## Phase log

### 2026-07-10 — Phase 0

- Completed empty-repository and environment audit.
- Confirmed the configured Supabase target belongs to AfroTools and did not access it.
- Checked current official Next.js, Tailwind, Supabase SSR and Playwright guidance.
- Scaffolded the application foundation and documented architecture, route scope, data/source strategy, risks, tests and blockers.
- Remaining external blockers: a dedicated SalaryPadi Supabase project, deployment origin, transactional email, moderation ownership and production provider decisions.

### 2026-07-10 — Phase 1

- Completed the responsive application shell, semantic token system, trust pages, Supabase SSR boundary, passwordless sign-in flow, protected-route proxy, role-aware data access layer and AAL2 admin requirement.
- Prepared versioned PostgreSQL migrations with deny-by-default RLS, owner isolation, staff-role helpers, audited operations and pgTAP integration coverage.
- Verified type checking, linting, unit tests and a production build.
- External blocker: the migrations cannot be applied or exercised against a live project until a dedicated SalaryPadi Supabase project is created.

### 2026-07-10 — Phase 2

- Enabled a terms-reviewed Remotive pilot with fixed-host fetching, runtime schema validation, readable plain-text sanitisation, explicit eligibility evidence, salary/location normalisation, fingerprints, deduplication, bounded search and expiry handling.
- Completed search, filters, detail pages, Job Truth Cards, required attribution, external application, WhatsApp sharing and honest unavailable/empty states.
- Implemented private saved jobs, application tracking and alerts through owner-scoped database RPCs; browser execution remains credential-gated.
- Remotive pages are deliberately noindexed and omit `JobPosting` markup because its documented sharing permission does not grant third-party job-search submission rights.

### 2026-07-10 — Phase 3

- Completed factual company pages, moderated salary/review/interview submissions, reporting, safe aggregate queries, confidence labels and privacy thresholds.
- Database logic delays aggregate publication after approval, uses distinct-contributor thresholds, limits stale reviews and keeps contributor identity out of public projections.
- Added moderation/admin queue contracts, constrained transitions, reason/version checks and immutable audit actions.
- External blocker: live ownership, moderation and RLS journeys require the dedicated backend and isolated test accounts.

### 2026-07-10 — Phase 4

- Completed a versioned Nigeria 2026 take-home-pay engine with explicit pension, NHF and health inputs, authoritative sources, warnings and print/share output.
- Completed offer comparison with user-supplied FX rates, pay-period normalisation, benefits, personal work costs, deductions, contract differences and evidence-grounded negotiation points.
- Completed the local-only scam checker with cautious risk tiers, individual evidence, verification steps and no URL fetching.
- Covered payroll, offer and scam domains with boundary-heavy unit tests and exercised all three tools in real browsers at 360px, 768px and desktop.

### 2026-07-10 — Phase 5

- Added canonical metadata, robots controls, segmented sitemaps, internal linking and sanitised Organization/Breadcrumb JSON-LD.
- Added a privacy-safe analytics event boundary that rejects salary values, free text, notes, email and other prohibited fields.
- Completed moderated employer intake, visible outcome feedback, sharing controls and six-hour source caching.
- Structured-data browser tests confirm the constrained source never emits `JobPosting`.

### 2026-07-10 — Phase 6

- Added strict production-origin validation, per-request nonce CSP, security/cache headers, cross-origin mutation rejection, redirect/URL hardening, bounded inputs and fixed source hosts.
- Added unit, pgTAP and Playwright suites, CI, dependency-audit guidance, environment examples, deployment/rollback documentation and an operations runbook.
- Public browser journeys, axe WCAG A/AA checks, structured data and no-horizontal-overflow checks pass at 360px, 768px and desktop; authenticated and AAL2 admin specs are present but intentionally skip without isolated storage-state credentials.
- PostgreSQL migrations and pgTAP tests received static review, but cannot be executed locally because Supabase CLI and Docker are unavailable.
- Residual dependency risk: `npm audit --omit=dev` reports two moderate transitive PostCSS advisories inside the current Next.js release; npm's proposed downgrade is unsafe, so this remains documented for upstream monitoring.

### 2026-07-10 — Hosted production continuation

- Created the private GitHub repository and Netlify project, then configured the site with the dedicated SalaryPadi Supabase URL and publishable key. No service-role key is used by the web app.
- Applied five forward migrations to Supabase `bxelrhklsznmpksgrqep`, exposed only the `api` schema, configured production/local/preview auth callbacks, retained confirmed email, and enabled TOTP MFA.
- Generated TypeScript definitions from the live `api` schema and wired the Supabase clients to them.
- Ran 133 pgTAP assertions against the hosted database. The first pass found implicit PUBLIC execution on internal security-definer functions; migration `20260710000500_lock_internal_routines.sql` removed existing and future implicit grants. All four suites then reported zero failures.
- Supabase Security Advisor reports zero errors and zero warnings. Six informational RLS items are deliberately policy-less internal worker tables and therefore fail closed.
- Added database-backed jobs and company intelligence, privacy request handling, a working staff TOTP enrol/challenge flow, and source-permitted `JobPosting` structured data.
- Formatting, lint, live-schema typecheck, 163 unit tests, and the 54-route production build pass. The immutable Netlify cloud deployment serves the homepage, live jobs, health endpoint, calculators, CSP and security headers successfully; the local Windows CLI edge packager remains unsuitable for middleware packaging.
- Connected `salarypadi.com` through Hostinger DNS using Netlify's external-DNS targets, registered `www.salarypadi.com` as an alias, and set the apex as the canonical application and Supabase Auth origin.
