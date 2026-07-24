# Product Overhaul — Delivery Report

Date: 2026-07-24. Mandate: the product-overhaul brief (Phases 0–18,
Releases 1–5). Companion docs: `salarypadi-current-state-audit.md`,
`salarypadi-product-overhaul.md`, `salarypadi-data-source-register.md`.

## Shipped (PRs #36–#42, all merged to main and deployed)

### Release 1 — presentation layer (complete)

- Public presentation boundary `src/lib/presentation/public-field.ts`:
  uncertainty sentinels map to omission or one candidate-facing
  statement, never a printed label. Enforced by the prohibited-label
  regression test (`src/lib/presentation/prohibited-labels.test.ts`),
  which renders JobCard, JobQuickFacts and JobTrustSummary against
  fully-uncertain fixtures.
- Job cards: one eligibility statement, facts only when known, salary
  badge, source + freshness footer.
- Job detail: quick-facts grid, compact trust line, collapsed "How
  SalaryPadi verified this information" drawer (Truth Card dump and
  eligibility-status chip removed), sticky mobile Apply bar.
- Company identity: deterministic monogram folded into `CompanyLogo`
  (verified/permitted logo still resolves first); slots on job cards,
  job detail and the directory. A logo slot is never empty and never
  fabricated.
- Navigation: Insights behind `NEXT_PUBLIC_FEATURE_INSIGHTS` (still
  reachable from the footer), distinct For-Employers footer group,
  internal vocabulary removed from filters and forms.

### Release 2 — jobs and company experience (complete)

- Two-column desktop jobs route: `?selected=<slug>` server-rendered
  quick-view pane; back button, filters and pagination survive; mobile
  unchanged.
- `/companies`: search (name/industry/category), Hiring-now filter,
  A–Z index, 30-per-page crawlable pagination, honest dual empty
  states.
- Pre-existing and verified rather than rebuilt: `/saved`,
  `/applications`, `/alerts` (with search-prefilled creation), company
  profile tabs, logo-API adapter (`LOGO_DEV_PUBLISHABLE_KEY` +
  `/api/company-logos`), email adapter (Resend env + alert worker).

### Release 3 — inventory platform (infrastructure complete; growth ongoing)

- ReliefWeb connector shipped dark: schema restricted to
  registry-permitted fields, bounded African-duty-station request,
  metadata-only normalization, four independent stops (registry entry,
  `RELIEFWEB_SOURCE_ENABLED`, DB policy row, appname credential).
  Activation runbook in `.env.example` and the source register.
- Jumia Greenhouse board registered (6th authorized board; probe round
  of ~45 tenants; wrong-tenant `branch` rejected). 8 roles stored, held
  pending until non-NG country packs activate; NG postings will publish
  automatically on the 6-hourly cadence.
- Ops dashboard confirmed already present (`/admin/source-health`).
- Dedup (fingerprint + fuzzy review queue) and the link checker were
  already in place.

### Release 4 — salaries (search-first shipped; flow decision below)

- Salary hub role searches now answer with the live disclosed-pay jobs
  lane and the matching role-family page link even when the community
  aggregate is under threshold. Lanes stay separate and labelled.
- Role pages (`/salaries/ng/[role]`) already carried the three lanes
  (local evidence / disclosed pay / US+UK benchmarks) with
  "reference period" framing.
- Contribution privacy: the contribution shell now states the full
  privacy contract (no individual records ever public, ≥3-contribution
  cohort threshold, no sub-threshold counts, deletable, employer never
  sees identity).

### Release 5 — insights and growth (core shipped)

- Job Market Pulse on `/insights`: deterministic counts over the
  verified snapshot (active jobs, 7-day postings, hiring companies,
  disclosure rate, work-mode mix, top stated locations) with scope and
  limitations printed beside the figures. No modelling.
- Segmented sitemaps already existed (`/sitemaps/*.xml` + index), as
  did the JSON-LD structured-data pipeline (JobPosting gated per-source
  by policy) and the typed analytics event taxonomy
  (`src/lib/analytics/catalog.ts`).

## Deliberate deviations

- **Single-page grouped contribution form kept** instead of a
  multi-step wizard: the existing form already groups fields into
  legended sections with draft saving; a client-side wizard would add
  state complexity without changing what is collected. Revisit if
  abandonment data (analytics) shows the long form losing people.
- **Insights nav flag left off** — flipping
  `NEXT_PUBLIC_FEATURE_INSIGHTS=true` in Netlify is a one-line owner
  decision now that the page has real content.

## Open items and their gates

| Item                                                                  | Gate                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ReliefWeb activation (~hundreds of NGO roles)                         | Appname approval email to support@salarypadi.com; 15-minute runbook in `.env.example`                                                                                                            |
| Non-NG country pack activation (unlocks banked Jumia + Zipline roles) | Owner decision per market; activation thresholds in `config/country-packs.json`                                                                                                                  |
| 20k active-jobs target                                                | Continuous board discovery (most NG fintech ATS tenants currently at 0 open roles — reprobe periodically), ReliefWeb, generic XML/JSON/CSV + SmartRecruiters connectors (rights recording first) |
| Employer claim verification mail                                      | Email sender domain + credential (adapter ready)                                                                                                                                                 |
| NSIWC dedicated pay-scale surface                                     | Next major Nigeria build (sources banked in `docs/data/sources/`)                                                                                                                                |
| Canonical dirty location strings                                      | Follow-up task: strip appended prose/HTML at ingestion + prod UPDATE                                                                                                                             |

## Verification posture

Every PR merged with the full gate green (1,513 tests across 173
files, typecheck, eslint --max-warnings=0, prettier, npm audit, pgTAP,
public browser journeys) plus live dev-server verification of the
changed surface. The prohibited-label regression test now guards the
presentation boundary permanently.
