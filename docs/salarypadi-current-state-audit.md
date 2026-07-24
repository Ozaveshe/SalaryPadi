# SalaryPadi — Current State Audit

Date: 2026-07-24. Basis: full-repository inspection, production database
inspection, live-route capture, and the operating history recorded in
`docs/` and the project memory.

## Architecture (verified)

| Layer              | Implementation                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend + backend | Next.js 16 App Router (server components, streamed Suspense), single deployment                                                                                                                                                                                             |
| Hosting            | Netlify (site `salarypadi`, auto-deploy from `main`); 26 scheduled functions (workers) on cron                                                                                                                                                                              |
| Database           | Supabase Postgres, schemas `app` / `api` (public views, security_invoker+barrier) / `private` / `ingest` / `security` / `audit` / `community` / `editorial`; RLS forced everywhere                                                                                          |
| ORM                | None — supabase-js against `api` views with strict zod row contracts (`select("*")` + strict schema is a known landmine; columns must be named)                                                                                                                             |
| Types              | `src/lib/supabase/database.types.ts` is hand-curated; never regenerate                                                                                                                                                                                                      |
| Auth               | Supabase Auth; viewer resolution in `src/lib/auth/dal.ts`; unconfigured backend degrades to sign-in redirect                                                                                                                                                                |
| Design system      | Hand-rolled tokens in `src/app/globals.css` (forest/coral/gold/sand palette, `status`/`surface`/`stack`/`data-list` vocabulary); Lucide icons                                                                                                                               |
| Ingestion          | ATS engine (`src/lib/jobs/ats/`: greenhouse, lever, ashby, workable descriptors) + secondary-feed engine (`getSecondarySourceFeed` + remotive/jobicy/himalayas descriptors) + blob snapshots; 3-gate source authorization (JSON registry + DB policy row + env kill switch) |
| Company model      | `app.companies` + aliases/domains/legal entities/locations + `company_fact_citations` (incl. `regulatory_license`) + 100-company African catalog manifest                                                                                                                   |
| Salary models      | `app.salary_benchmarks` (US BLS + UK ONS reviewed snapshots), `app.salary_data_sources`, community aggregate cells with privacy thresholds (3+ contributors), `private.salary_submissions`                                                                                  |
| Contributions      | `/contribute/*` flows → private tables → moderation → published aggregates; zero community volume to date                                                                                                                                                                   |
| Moderation/admin   | RPC-level moderation queues, `private.moderation_actions` (append-only), staff roles; no rich admin UI                                                                                                                                                                      |
| Analytics          | Opt-in Google Analytics on public pages only; no product event taxonomy                                                                                                                                                                                                     |
| Testing            | 1,200+ vitest unit tests (node env; components via renderToStaticMarkup), pgTAP suite replaying the migration chain, env-less Playwright browser journeys; CI: format/lint/type/coverage/audit/build + pgTAP + journeys                                                     |

Build, tests, lint and typecheck are green on `main` as of this audit
(the npm-audit gate has broken three times this week on new upstream
advisories — sharp, Next, postcss — and needs watching).

## Route capture (live)

- `/` — coverage stats, hiring strip, tiered vacancy preview. Sound.
- `/jobs` — single-column list, 10/page, Nigeria-first tiering. Cards
  leak internal vocabulary (below).
- `/jobs/[slug]` — Job Truth Card dominates: evidence tables, eligibility
  scope wording, source policy detail before candidate content.
- `/companies` — all ~110 companies on one page, no search, no
  pagination. Cards show zero-count evidence lines.
- `/companies/[slug]` — 614-line god-page: facts `<dl>`, citations,
  jobs, community evidence counts, interviews, benefits, employer
  responses stacked with equal weight; no tabs.
- `/salaries` — search + method cards + role directory + two benchmark
  sections. Solid bones, methodology-forward presentation.
- `/salaries/ng/[role]` — aggregate slot + disclosed-pay jobs +
  benchmarks (recently built; closest page to target design).
- `/insights` — effectively empty; prominent nav slot with no content.
- `/contribute` — six equal-weight options mixing candidate and
  employer actions.
- Admin — no UI; operations run through SQL/RPCs.

## Customer-facing problems (ranked)

1. **Internal vocabulary leaks everywhere.** `formatEnum` prints raw
   enums: "Unknown" (experience), "Unspecified" (arrangement),
   "Unclear" eligibility statements, "Location not stated",
   "Not stated by the source", evidence-lane and coverage phrasing on
   truth surfaces. Every uncertain field renders its uncertainty.
2. **Diagnostic-first hierarchy.** Job pages present verification
   machinery before the role; the compact trust summary + collapsed
   drawer pattern does not exist yet.
3. **Badge soup.** Cards stack 4–6 status chips (eligibility + path +
   arrangement + experience + salary) instead of one candidate-facing
   eligibility statement.
4. **No company logos.** No logo fields exist on the company model; no
   monogram fallback; cards and profiles are text-only.
5. **Companies page does not scale.** No search/filter/pagination;
   zero-value evidence counts render ("0 salaries · 0 reviews").
6. **No saved jobs surface, no alert-creation from search** (alert
   tables exist; `/alerts` is disconnected from the search flow).
7. **Insights is an empty prominent destination.**
8. **Contribution page mixes audiences** (employer posting beside
   anonymous salary sharing).
9. **Navigation** exposes methodology-weight items at top level.

## Data-quality problems

- ~219 active public jobs vs the 20,000 target; five employer boards +
  two request-time feeds.
- Company-domain/logo coverage: logos 0%; domains good for catalog
  companies, absent for feed-only employers (feed jobs resolve to
  name-keyed company stubs).
- Eligibility classifier is conservative-good but "unspecified"
  arrangement/experience dominates ATS records (Greenhouse/Workable do
  not declare them).
- Application-link validation exists (`apply-link-check` worker) but
  has no public reporting and no dashboard.
- Dedup is fingerprint-based per source; no cross-source syndication
  clustering yet (not currently a live problem at 5 direct boards).

## Schema/index notes

- `api.jobs` read path is cached-provenance backed (12 ms anon) —
  healthy to ~10k rows; re-verify plans beyond that.
- `app.jobs` lacks a trigram/text index for company/title search at
  directory scale (needed for Release 2 search).
- Companies list view aggregates citations per row; fine at 110, needs
  pagination + limits at 1,000+.
- No `logo_*` columns on companies (Release 2 migration).
- `ingest.job_occurrence_links` prune + 26h worker outage caused a
  temporary public withdrawal of two boards (fail-closed worked; noted
  as expected post-outage behavior).

## SEO

- Server-rendered; JobPosting/Organization JSON-LD present with policy
  gating; landing pages exist with honest indexability gates.
- Gaps: no segmented sitemaps for jobs/companies/salaries; paginated
  company/job URLs don't exist yet (no pagination); benchmark "Evidence
  date range" label is misleading for reviewed snapshots (reads as
  future-dated); role pages noindex until local aggregates exist (by
  design).

## Accessibility

- Strong base: labelled inputs, aria-hidden icons, aria-labels on
  visuals, semantic elements, skip link, Intl formatting (recent design
  audit fixed placeholders/autocomplete/tabular figures).
- Gaps: heading levels inside cards (h2 in cards under h2 sections),
  focus-visible audit incomplete on custom controls, no
  reduced-motion coverage statement, dialog/tab patterns unused so far.

## Security & privacy

- Strong: forced RLS, security-definer discipline (tested), 3-gate
  source authorization, sanitized descriptions (metadata-only storage
  for ATS), append-only audit tables, salary privacy thresholds.
- Watch: employer HTML is currently never rendered (placeholder text)
  — any future description rendering must sanitize; admin access
  logging exists at DB level only; npm-audit gate churn.

## Broken/incomplete

- `/insights` (empty), `/alerts` (disconnected), employer flows
  (partial), review/benefit display (counts only — interviews now
  render, reviews still don't), admin UI (absent).

## Migration requirements identified

Release 1: none (presentation-layer only).
Release 2: company `logo_url/logo_source/logo_status/logo_last_checked_at/logo_attribution/banner_url`, saved-jobs table (exists? verify `app.saved_jobs` — present via set_job_saved RPC), directory search indexes (pg_trgm), company claim tables (partially present via `my_company_claims`).
Release 3: source-registry extensions (rate limits, stale thresholds, takedown contact), board-registry table, link-check result surfacing.
Release 4: salary submission field extensions (equity/bonus granularity), contribution session tracking.
Release 5: analytics event store or third-party wiring; insights metric snapshots table.
