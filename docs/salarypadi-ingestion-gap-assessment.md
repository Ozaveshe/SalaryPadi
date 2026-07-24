# Job-Ingestion System — Current State, Gap Assessment and Acquisition Matrix

Date: 2026-07-24. Scope: the 20,000-active-jobs ingestion mandate.
Verdict up front: the platform already implements ~85% of the mandate;
this assessment documents where each requirement lives, and the
remainder (generic XML/JSON/CSV connectors, SmartRecruiters/Jooble
rights records, board-registry tooling) ships alongside this document.

## 1. Current architecture (what exists, verified against code and prod)

**Stack:** Next.js 16 App Router on Netlify; Supabase Postgres
(`bxelrhklsznmpksgrqep`) with RLS forced everywhere; schemas
`app` (canonical), `ingest` (raw evidence), `private` (operator),
`security` (definer functions), `api` (public views,
security_invoker+barrier). 25 scheduled Netlify workers; deploys never
run migrations (manual apply + ledger row).

**Source governance (three independent gates, fail-closed):**

1. Application registry `config/job-source-policy-registry.json` —
   per-adapter: authority, state, permission basis, evidence reference,
   terms URL, review dates, allowed fields, attribution, polling and
   retention caps, display/index/JobPosting permissions, required vs
   missing dependencies. This IS the brief's source registry; field
   names differ but every required concept is present (takedown contact
   = support@salarypadi.com globally; base domain lives on the
   evidence/terms URLs).
2. Database policy rows `app.job_sources` + per-country
   `app.source_country_rights` + `private.job_source_dependencies` —
   the live operator gate, compared field-by-field against the reviewed
   expectation (`src/lib/jobs/reviewed-policy.ts`, 11 fields) on every
   read. Mismatch = source refuses to run.
3. Environment kill switches (`REMOTIVE_SOURCE_ENABLED`,
   `RELIEFWEB_SOURCE_ENABLED`, `ATS_SOURCE_SYNC_ENABLED`).

No gate can enable another. Nothing publishes without an active rights
basis: `security.public_job_provenance` (cached as
`app.jobs.public_provenance`/`public_ready_until`, maintained by
deferred constraint triggers) withdraws any job whose policy review,
rights review or eligibility evidence lapses.

**Connectors:** shared engines, not bespoke pipelines.

- Employer ATS engine `src/lib/jobs/ats/` — Greenhouse, Lever, Ashby,
  Workable descriptors; per-tenant configs in
  `private.ats_source_configs` (destination hosts/path prefixes pinned,
  budgets, spacing); worker claims one due source per 15-minute tick.
- Secondary-feed engine `getSecondarySourceFeed(descriptor)` —
  Jobicy, Himalayas (active), Remotive (revoked), ReliefWeb (built,
  dark pending appname).
- The brief's `JobSourceConnector` interface maps onto: descriptor =
  sourceId+fetch+healthCheck; `normalizeAtsImportRecords` = normalize;
  the dispatcher's due-source claim = discover/acknowledge.

**Raw evidence (immutable):** `ingest.raw_job_records` (source_id,
external id, source URL, raw_payload, content_hash SHA-256,
dedup_fingerprint, imported_at/last_seen_at, retention_expires_at,
absence counters), `ingest.ats_snapshot_runs` /
`ats_snapshot_seen_records`, `ingest.job_source_occurrences` +
`job_occurrence_links`. New fetches append; expiry never deletes raw
rows (retention is policy-driven per source).

**Canonical schema:** `app.jobs` + `app.job_locations` +
eligibility rows + `app.companies`/`company_aliases` +
occurrence links. The brief's field list is covered by equivalents
(slug=canonical id, work_arrangement=workplace_type,
eligibility scope enum worldwide/africa/emea/nigeria/named_countries/
restricted_region/unclear with verbatim `evidence_text` and
provenance, salary evidence fields, posted/checked/expired lifecycle,
`status`, per-record publishability). Deviation noted in §3.

**Null states:** internal sentinels (`unknown`, `unclear`,
`unspecified`) are preserved in data and mapped at one boundary —
`src/lib/presentation/public-field.ts` — to omission or a single
statement. The prohibited-label regression test enforces that `null`,
`Unknown`, `Unclear`, `Not stated`, `None applied`, `N/A` and the
diagnostic vocabulary never render publicly.

**Company resolution:** slug/domain-first with
`app.company_aliases`; catalog manifest
(`data/companies/africa-major-companies.v1.json`) for the 100 major
African corporates; company rows carry
`verification_status`/`record_status`; admin merge surface at
`/admin/companies`. Fuzzy matches land in a review queue
(`pending_fuzzy_reviews` on the ops dashboard), never auto-merge.

**Logos:** resolution order verified upload → logo.dev
(`LOGO_DEV_PUBLISHABLE_KEY`, served same-origin via
`/api/company-logos/<slug>`, manifest-gated) → deterministic monogram
(`CompanyLogo`). No empty logo container is renderable.

**Eligibility:** `classifyEligibilityEvidence` — deterministic rules
over the verbatim source sentence (kept as `evidence_text`), country
include/exclude lists, hard-won guards (bare "anywhere" excluded,
"Home based - X" formats, EMEA ⊃ Africa). Remote jobs are NOT assumed
Africa-eligible: `evaluateRemotePublication` requires positive
evidence; onsite roles publish only where the workplace resolves to an
African market country.

**Salary:** `parseSalary`/`normalizeSalaryEvidence` — original text
retained, currency/period/gross-net only when stated, derivation
assumptions listed; nothing inferred is presented as disclosed.

**Dedup:** layered — source+external_id (quarantine code
`duplicate_external_id`), `dedup_fingerprint`
(company+title+location+arrangement+destination), `content_hash`,
cross-source occurrence links, fuzzy review queue. Canonical priority
favors employer ATS (source authority scoring in `supply/policy.ts`).

**Freshness/expiry:** per-source refresh intervals + 2h grace;
absence tracking (`successful_omission_count`) closes jobs that leave
an authoritative API; `validThrough` respected; link checker feeds
`broken_apply_links`; provenance cache withdraws stale evidence
fail-closed and self-heals on resync (proven live during the July
worker outage); tombstoned rows keep raw evidence.

**Search:** Postgres-backed feed + in-process
`filterAndSortJobs`/`diversifyJobResults` (keyword+synonyms, path,
eligibility, company, work mode, employment type, arrangement,
experience, category, sort by relevance/newest/salary,
Nigeria-first `nigeriaValueTier`). Adequate at current scale; see §3
for the 20k plan.

**Publication gates:** all of the brief's conditions are enforced in
the store RPC + provenance function (title/company/source/destination
present, rights active, not duplicate, eligibility represented) with
reason-coded quarantine (`AtsImportQuarantineCode` + filter codes) and
per-record `pending` state for not-yet-activated market countries.

**Observability:** `/admin/source-health` (7-day supply vs target,
per-source rights state/review-due/yield/run quality/dependencies,
scheduler execution, durable alerts), `/api/health` (503 on
provider/worker degradation), structured worker summaries in
`private.worker_runs`. Trace path: worker run → snapshot run → raw
record → occurrence link → job → provenance JSON on the public view.

**Admin:** moderation queues, company merge, source policy status,
job expire/restore, imports, reports, audit schema. Diagnostics stay
internal per the presentation boundary.

**SEO:** server-rendered detail pages, canonical URLs, JobPosting
JSON-LD emitted only where the source policy permits
(`may_emit_jobposting_schema`) and matching visible content;
segmented sitemaps (`/sitemaps/jobs|companies|salaries|...`); expired
jobs drop markup and 404-to-evidence page behavior.

**Testing:** 1,523 vitest tests incl. connector contract/fixture
tests (no live requests), normalization, eligibility, salary, dedup,
expiry, policy-gate and prohibited-label tests; pgTAP suite replays
the migration chain in CI; env-less browser journeys.

## 2. Source acquisition matrix

| Tier                        | Source class                                                       | State                                                            | Ceiling (honest estimate)                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Employer ATS APIs         | Greenhouse/Lever/Ashby/Workable boards, per-tenant rights          | 6 boards active (~350 jobs incl. pending)                        | Grows per registered board; NG tech boards are mostly at 0 open roles today — discovery must widen to non-tech NG employers, pan-African + NGO boards |
| 2 Employer-authorized feeds | Generic XML/JSON feeds + CSV import (this delivery)                | Connectors built, registry empty — needs employer authorizations | Unbounded, employer-by-employer                                                                                                                       |
| 3 Licensed partner feeds    | `licensed_africa_partner` (no contract), Jooble (terms unreviewed) | Disabled                                                         | Thousands, but only with signed terms                                                                                                                 |
| 4 Public-interest APIs      | ReliefWeb (dark, pending appname), Jobicy, Himalayas               | 2 active, 1 pending                                              | ReliefWeb: hundreds–low thousands of African NGO roles                                                                                                |
| 5 Employer submissions      | `/post-a-job` moderated lane                                       | Active                                                           | Low volume, high trust                                                                                                                                |
| 6 Permitted crawling        | None                                                               | None registered                                                  | Nothing until a specific permit exists                                                                                                                |

Prohibited (unchanged): LinkedIn, Indeed, Glassdoor, Jobberman,
MyJobMag, BrighterMonday, NGX, Google Jobs relay, authenticated or
bot-protected content, identity rotation.

Realistic path to 20k actives: ReliefWeb activation + ~hundreds of
boards from the board registry (tooling below) + country-pack
activations (banked pending inventory publishes) + partner/feed
authorizations. The number is supply-gated, not code-gated.

## 3. Gaps and dispositions

| Brief requirement                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generic XML feed connector           | **Built now**: `src/lib/jobs/feeds/` — strict flat-record extractor (CDATA/entities), per-feed field map                                                                                                                                                                                                                                                                                                                                                                                                     |
| Generic JSON feed connector          | **Built now**: dot-path record extraction                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Employer CSV import                  | **Built now**: RFC 4180 parser + header mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Feed authorization registry          | **Built now**: `config/employer-feed-registry.json` (zod-validated; a feed cannot enable without a recorded rights basis; destination hosts pinned per feed). Empty until real employers authorize — no invented feeds                                                                                                                                                                                                                                                                                       |
| Single connector interface           | Feeds emit `AtsSourceRecord` and reuse `normalizeAtsImportRecords` — one canonical pipeline, no second path. The runtime (`src/lib/jobs/feeds/runtime.ts`) adds eligibility gates + absence semantics + durable metrics over an injectable store; provider-constraint migration `20260724130000` (applied) admits the feed providers into `ats_source_configs`. Remaining: bind the production `FeedRunStore` + register the dispatcher worker — gated on a real employer authorization (no feed is enabled) |
| SmartRecruiters                      | **Registry entry added (disabled)**: transport docs ≠ republication permission; zombie-board freshness gate mandatory                                                                                                                                                                                                                                                                                                                                                                                        |
| Jooble                               | **Registry entry added (disabled)**: no request until partner terms are obtained and recorded                                                                                                                                                                                                                                                                                                                                                                                                                |
| Board registry + 1,500-board tooling | **Built now**: `config/employer-board-registry.json` (31 evidence-backed rows: 6 registered, rejects with reasons, probed-zero cohort, candidates) + `scripts/validate-board-registry.mjs` (`--check` structural, `--probe N` rate-limited public-API probe that never registers)                                                                                                                                                                                                                            |
| Occupation-family taxonomy on jobs   | Partial: 23 role families exist for salaries; job records carry source `category`. Mapping jobs→families is future work, tracked, not blocking publication                                                                                                                                                                                                                                                                                                                                                   |
| Dedicated search service             | Deliberately deferred: current Postgres+in-process search is fast at current scale; reassess with pg full-text (`tsvector` on title/description) at ~2–5k active jobs, dedicated service only if p95 degrades                                                                                                                                                                                                                                                                                                |
| Conditional requests (ETag)          | Partial: response `Date`-based freshness + per-source budgets exist; ETag/If-Modified-Since is a cheap future add per adapter                                                                                                                                                                                                                                                                                                                                                                                |
| Brand colours on logos               | Not stored; logo.dev serves images only. Future enrichment                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 4. Acceptance-target status (honest)

| Target                                      | Status                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ≥20,000 active unique jobs                  | ~338 public + banked pending. Supply-gated (see §2); machinery complete                                     |
| ≥95% valid application destinations         | Structurally enforced (destination pinning per tenant/feed + link checker); ops metric on dashboard         |
| <5% visible duplicates                      | Enforced by 4-layer dedup + fuzzy review queue                                                              |
| ≥95% company-domain resolution              | Met for current inventory (ATS tenants are domain-verified at registration)                                 |
| ≥90% logo coverage                          | 100% render coverage (monogram floor); permitted-API coverage grows with the catalog                        |
| 100% attribution / 100% active rights basis | Enforced by the three gates; nothing publishes otherwise                                                    |
| ≥98% explicit location or remote scope      | Enforced: records without either are filtered/pending, not published                                        |
| No raw null-state labels                    | Enforced by the prohibited-label regression test                                                            |
| Expired-rate <2%                            | Absence-tracking + 6h cadence keeps public rows current; provenance cache withdraws lapses same-transaction |
| Auditable provenance per field              | Worker run → snapshot → raw record (hash) → occurrence → job → public provenance JSON                       |

## 5. Runbooks

- **Activation**: ReliefWeb — `.env.example` runbook. New ATS board —
  Moniepoint recipe (probe first; `docs/data/` script; pgTAP 90/91).
  Employer feed — employer's written authorization → feed-registry
  entry (rights fields required to enable) → provider-constraint
  migration on first use → source policy row → activate.
- **Takedown / source disable**: set `app.job_sources.policy_state =
'disabled'` (or `authorization_revoked_at`) — the provenance cache
  withdraws every dependent job in the same transaction; raw evidence
  is retained per the source's retention policy; registry state and
  this document are updated; contact route support@salarypadi.com.
- **Board discovery cadence**: `node scripts/validate-board-registry.mjs
--probe 10` periodically; promote hits through the registration
  recipe; probed-zero boards are re-probed, never registered dormant.
