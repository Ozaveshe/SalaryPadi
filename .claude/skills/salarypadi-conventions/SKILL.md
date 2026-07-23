---
name: salarypadi-conventions
description: SalaryPadi's non-negotiable product and engineering conventions — truth/provenance rules, database migration workflow, presentation idioms, and testing patterns. Use when designing any new feature, page, data source, or schema change in this repo, or when reviewing work for convention compliance.
---

# SalaryPadi Conventions

SalaryPadi is a truth-first careers platform for Africans (Nigeria-first).
Every feature decision is subordinate to one rule: **never present an
invented, stale, or unverifiable number or claim as fact.**

## Truth and provenance (product-level)

- Every public fact carries its source, retrieval date, and review-due date.
  Missing evidence stays visibly missing — no placeholder market numbers.
- Data sources are ingested only when their license permits republication
  (open government licences, CC-BY, official public registers, employers'
  own documented public APIs). If the license cannot be confirmed, the
  source is not used. NGX-style "no republication" terms are a hard no.
- Regulator claims name the exact licensed entity. A holding company is
  "group parent of a licensed X", never "licensed X".
- Aggregates publish only above privacy thresholds (3+ distinct
  contributors for salary cells). Sub-threshold counts stay private.
- Freshness is first-class UI: stale evidence (old interview reports,
  lapsed policy reviews) is visibly decayed or automatically withdrawn,
  never silently presented as current.
- Never seed fake community evidence anywhere, including for testing.
  Verify rendering with server-render component tests instead.

## Database workflow

- Schema changes: repo migration file in `supabase/migrations/` AND manual
  production apply via the `supabase_salarypadi` MCP (project
  `bxelrhklsznmpksgrqep` only — verify the URL before writes) AND a
  hand-inserted ledger row in `supabase_migrations.schema_migrations`.
  Deploys do NOT run migrations.
- Data-only rows (benchmarks, registrations, facts) never go in the
  migration chain — CI replays it against pgTAP fixtures. Applied-data SQL
  lives in `docs/data/` and is executed against production directly.
- `src/lib/supabase/database.types.ts` is hand-curated. Never regenerate
  wholesale; hand-add new api views/columns.
- New security-definer functions need `revoke ... from public` plus
  explicit grants, or pgTAP test 00 fails.
- api views use `security_invoker = true, security_barrier = true`; keep
  those options when replacing a view.

## Application patterns

- Repositories return `RepositoryResult` (ready/degraded/failure) and pages
  render `RepositoryNotice` for anything non-ready. One bad row is
  quarantined with a logged issue path, never a crash.
- Strict zod row schemas must name their selected columns explicitly;
  `select("*")` against a strict schema is a known production landmine.
- Nigeria-first ordering: default browse surfaces rank Nigeria-local, then
  remote Nigeria-eligible, then Africa-eligible (`nigeriaValueTier`).
- Salary display: original currency and period stay visible; naira
  take-home estimates come only from `estimateNairaTakeHome` with published
  reference rates, labelled "(est.)".

## Presentation idioms (globals.css vocabulary)

- Cards: `surface surface-pad stack`; badges: `status status-neutral|
  status-success|status-warning`; metadata lines: `source-note`; key-value
  panels: `data-list`; small print: `field-help`; layout: `split`,
  `cluster`, `stack`, `rule-section`.
- Numbers use `font-variant-numeric: tabular-nums`. Range visualizations
  are honest: proportional axes, real widths, aria-labels carrying the
  same numbers.
- Every outbound source link: `target="_blank" rel="noopener noreferrer
  nofollow"` with the source title as the text.

## Testing

- Unit tests are `*.test.ts` only (node environment, no JSX render infra).
  Components are verified with `react-dom/server` `renderToStaticMarkup`
  in a `.test.ts` importing the `.tsx`.
- pgTAP files pin a `plan(N)` count — bump it when adding assertions.
  Tests 90/91 pin the exact set of active ATS boards; update them with
  every board registration.
- CI browser journeys run env-less; auth paths must degrade to a sign-in
  redirect, never a 503.

## Operational context

- Check memory for the current deploy state before assuming deploys run.
  Database changes reach production instantly; worker/app code changes
  only ship on deploy.
- ATS source registration follows the Moniepoint recipe: source draft →
  config (auto-revokes review) → re-review + policy fields → activate →
  country rights + verified dependencies → confirm via
  `security.authorized_ats_source_config_rows()`.
- Probe a board's real data (locations, posting dates) before registering:
  wrong-company tenants and zombie boards (year-old postings) are
  rejected.
