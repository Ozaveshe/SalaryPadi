# SalaryPadi Product Overhaul — Implementation Plan

Mission: present clarity to candidates while preserving the evidence
machinery internally. Five releases, each functional, tested and
deployable. Companion docs: `salarypadi-current-state-audit.md`,
`salarypadi-data-source-register.md`.

## Non-negotiables carried through every release

- No fabricated employers, jobs, salaries, reviews, logos, statistics
  or activity. Insufficient data ⇒ honest empty state, hidden feature,
  or feature flag.
- Evidence machinery (parser confidence, coverage checks, evidence
  lanes, moderation states, raw nulls) stays internal. The public
  surface never prints them; a regression test enforces this.
- Blocked integrations get adapter + config + fixture + credential
  documentation, and never block other work.

## Release 1 — Remove visible MVP problems (presentation layer)

1. **Public presentation mapper** (`src/lib/presentation/`): the single
   place that turns uncertain values into public output. Field states:
   known / not_disclosed / not_applicable / unparsed / inferred /
   conflicting. Uncertain enum values (`unknown`, `unspecified`,
   `unclear`) map to omission or a single useful absence statement —
   never to a printed label.
2. **Prohibited-label regression test**: renders public components with
   uncertain fixtures and fails on: Unknown, Unclear, None applied,
   Not stated, null, N/A, Deterministic coverage, Coverage complete,
   Checks applied, Evidence lane, parser/extraction confidence,
   moderation state.
3. **Job card hierarchy**: one candidate-facing eligibility statement
   (resolver collapses eligibility × path × arrangement), badges only
   for facts (employment type, salary when disclosed), Save action,
   omitted-when-unknown seniority/arrangement.
4. **Job detail**: candidate-first header, quick-facts grid rendering
   only known facts, sticky Apply/Save, compact trust summary
   (source · last checked · destination · report) with a collapsed
   "How SalaryPadi verified this information" drawer replacing the
   full Truth Card dump.
5. **Company monogram fallback** component (deterministic initials on
   brand-consistent background) — used everywhere a logo slot exists.
6. **Navigation**: Jobs / Companies / Salaries / Contribute primary;
   For Employers distinct; Insights hidden behind
   `NEXT_PUBLIC_FEATURE_INSIGHTS` until populated; methodology et al.
   footer-only.

## Release 2 — Jobs and company experience

- Two-column desktop jobs route (results + selected detail), separate
  mobile screens with restored scroll/filters on back.
- Saved jobs route wired to the existing set_job_saved RPC; notes;
  tracker statuses.
- Alert creation from current search (existing `/alerts` storage);
  email sending stays dormant until the email integration lands
  (documented dependency).
- `/companies`: server-paginated, searchable, filterable directory;
  crawlable page URLs; evidence counts only when nonzero; A–Z index.
- Company profile: header (logo/monogram, banner when real, follow,
  view jobs) + Overview/Jobs/Salaries/Reviews/Benefits/Interviews
  tabs, each rendered only with data, action-oriented empty states.
- Company identity: logo columns + resolution order (verified upload →
  permitted brand API [adapter + env placeholder; credential
  documented] → official-site icon where permitted → monogram);
  company resolution hardening (domain > ATS org > alias > exact name;
  merge/unmerge + audit).

## Release 3 — Inventory platform to 20,000 active jobs

Existing foundation: descriptor-based connectors (greenhouse, lever,
ashby, workable + engine for feeds), 3-gate rights registry, immutable
raw snapshots, freshness/expiry lifecycle, link checker. Additions:
ReliefWeb connector (approval pending — adapter ready), generic
XML/JSON feed connectors, employer CSV upload, SmartRecruiters (rights
recorded first), board-registry table + seeding/validation tooling
(target 1,500 boards), cross-source duplicate clustering, ops
dashboard (per-source freshness, link validity, dedup rate, coverage
vs target mix: 8k NG / 7k rest-of-Africa / 5k remote-open-to-Africa).
Scraping LinkedIn/Indeed/Glassdoor or bypassing bot protection is
prohibited — the source registry gates publication on rights basis.

## Release 4 — Salaries and contributions

- Salary home becomes search-first ("What should this role pay?") with
  three lanes: Local evidence / Jobs with disclosed pay /
  International benchmarks (existing US/UK snapshots relabelled:
  "Dataset reference period", "Valid for comparison through").
- Threshold-gated local evidence with honest under-threshold state
  (counts + benchmark context + contribute action).
- Multi-step anonymous salary contribution with explicit privacy
  explanation; workplace flow (review/benefits/pay
  reliability/interview) behind one secondary action; employer actions
  removed to For Employers.
- Moderation: existing queues + rate limiting + PII screening +
  duplicate detection review; appeal path.

## Release 5 — Insights and growth

- Job Market Pulse from real ingestion metrics (active/new/expired
  jobs, hiring companies, country/category mix, disclosure rate,
  remote mix) with date range/scope/sample/limitations on every chart;
  flag flips Insights back into nav when populated.
- Segmented sitemaps; JobPosting/Organization structured-data audit;
  landing-page inventory gates; analytics event taxonomy
  (documented, no sensitive payloads); application tracker; contextual
  contribution prompts; performance passes.

## External dependencies (documented, non-blocking)

| Dependency                                           | Needed for                              | Status                                                                      |
| ---------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Logo/brand API credential (e.g. Brandfetch/Logo.dev) | Release 2 logo enrichment               | Adapter + env placeholder; terms review required before production use      |
| Email service (e.g. Resend/Postmark)                 | Alert delivery, claim verification mail | Adapter exists (alert-delivery worker); credential + sender domain required |
| ReliefWeb API approval                               | Release 3 NGO inventory                 | Application submitted (support@salarypadi.com); connector ships dark        |
| SmartRecruiters authorization                        | Release 3 connector                     | Rights recording required before enablement                                 |
| Analytics platform decision                          | Release 5                               | GA present opt-in; product events need a decision (PostHog/GA4)             |
