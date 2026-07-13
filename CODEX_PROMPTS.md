# SalaryPadi — Codex Prompt Pack

Generated 2026-07-13 from a four-track deep repo scan (product surface, backend engine, data layer, quality/ops).
Each prompt below is self-contained: paste it into a fresh Codex session as-is. Run one prompt per session.
Prompts are ordered by leverage within each tier. Tier 1 unlocks growth; Tier 2 fixes engine correctness;
Tier 3 hardens the data layer; Tier 4 hardens quality/ops; Tier 5 is product UX.

---

## Shared preamble — prepend this block to EVERY prompt

```text
Context and guardrails for this repo (SalaryPadi, C:\Users\Oza\Documents\SalaryPadi):

- Read AGENTS.md first. This repo uses Next.js 16.2.10, which differs from your training data —
  read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code.
- Quality gate before finishing: NEXT_PUBLIC_APP_URL="https://salarypadi.test" npm run quality
  (the build requires a non-loopback HTTPS origin).
- Supabase: production project is bxelrhklsznmpksgrqep ONLY. NEVER apply migrations to the live
  database. Schema changes are forward-only SQL files added under supabase/migrations/ with a
  timestamped name, plus pgTAP tests under supabase/tests/database/ where behavior changes.
- Netlify Personal plan allows exactly two edge rate-limit rules; both are used
  (/api/tools/* and /api/auth/*). Do NOT add a third — it silently disables enforcement.
- Product principle: honest empty states, never fabricated data. Do not seed fake jobs, salaries,
  reviews, or statistics. Development fixtures stay behind ALLOW_DEMO_DATA and fail closed in prod.
- Source policy: Remotive-sourced pages must remain noindex and must never emit JobPosting JSON-LD.
  Only sources whose policy grants canIndex may be indexed. Do not weaken any fail-closed gate
  (REMOTIVE_SOURCE_ENABLED, ATS_SOURCE_SYNC_ENABLED, EDITORIAL_AUTOMATION_ENABLED, EMAIL_PROVIDER).
- Windows checkout: line endings are CRLF locally, LF in git. Do not commit line-ending-only churn.
- Do not touch deploy/channel.json, secrets, or Netlify configuration values.
```

---

# Tier 1 — Growth unlock

## Prompt 1: Make programmatic pages discoverable (sitemap + conditional indexing + breadcrumbs)

```text
SalaryPadi's growth engine is programmatic salary/company/job SEO, but today the sitemap
(src/app/sitemap.ts) lists only ~14 static routes plus published insight briefs, and 24 of ~40 pages
are robots index:false. Even pages that ARE conditionally indexable — /jobs/[slug] (when the source
policy allows indexing), /salaries/[country]/[role] (when aggregate data exists), /companies/[slug] —
have no discovery path at all.

Task:
1. Extend src/app/sitemap.ts (consider segmented sitemaps, which the product plan already calls for)
   to include, dynamically at request time:
   - /jobs/[slug] for jobs whose source policy grants indexing (respect the exact same canIndex
     logic used by generateMetadata in src/app/jobs/[slug]/page.tsx — Remotive jobs are noindex
     and must NOT appear).
   - /salaries/[country]/[role] pages that currently have published aggregate data (the page
     already 404s and noindexes when empty — mirror that condition).
   - /companies/[slug] pages that have at least one active job or published community evidence.
   - Published insights (already present) and the guide.
2. Replace the hardcoded lastModified dates (currently frozen at 2026-07-10/11 in sitemap.ts)
   with real timestamps from the underlying data (job posted_at, aggregate snapshot time,
   article published_at), falling back to build-safe values.
3. Revisit the blanket index:false on the /salaries and /companies HUB pages: keep detail pages
   conditional, but make the hubs indexable when they have real content to show, staying noindex
   when their repositories return empty/unavailable states. Do not touch /jobs hub, /jobs/remote,
   /jobs/nigeria, forums, feed, contribute, or any private route — those stay noindex.
4. Add BreadcrumbList JSON-LD to /companies/[slug] (and subpages), /salaries/[country]/[role],
   and /insights/[slug]. Job detail already has it — reuse that implementation
   (src/lib/seo/job-posting.ts and neighboring seo helpers) rather than duplicating.
5. Add AggregateRating JSON-LD on company pages ONLY where a published rating snapshot exists and
   meets the minimum-sample threshold; never emit a rating from raw submissions.

Keep every source-policy and privacy-threshold gate intact. Add/extend unit tests for the sitemap
generation logic and the new JSON-LD builders (see src/app/editorial-seo.test.ts and
src/lib/seo/job-posting.test.ts for existing patterns). Run the quality gate.
```

## Prompt 2: Dynamic per-entity OG images

```text
SalaryPadi has only static section-level OG images (public/, wired in per-page metadata). Job
details, company pages, salary role pages, and insight briefs all inherit generic OG images, which
wastes social/WhatsApp sharing (WhatsApp share is a core action on job detail pages).

Task:
1. Add dynamic Open Graph image generation for:
   - /jobs/[slug] — title, company, salary range if present, eligibility badge, SalaryPadi branding.
   - /companies/[slug] — company name, active job count, rating (only if a published thresholded
     rating snapshot exists).
   - /salaries/[country]/[role] — role, country, thresholded aggregate range (never raw values).
   - /insights/[slug] — brief title and date.
   Use the Next.js 16 ImageResponse / opengraph-image file convention — check
   node_modules/next/dist/docs/ for the current API before writing this; it may differ from
   your training data.
2. Brand tokens: reuse the palette/typography from docs/BRAND.md and existing brand assets
   (scripts/generate-brand-assets.mjs shows the canonical colors). Keep images text-legible at
   1200x630 and under typical OG size budgets.
3. Never render fabricated numbers: if salary/rating data is absent, render the entity name and
   branding only. Remotive-sourced job OG images must not include Remotive descriptions.
4. Wire the images into each page's generateMetadata (openGraph.images + twitter). Keep the
   existing static images as fallbacks for hub/static pages.
5. Verify the routes render (build passes and the OG routes return image/png) and run the quality gate.
```

## Prompt 3: Kill the full-catalog scan on job detail and article reads

```text
Two hot read paths in SalaryPadi load an entire catalog to return one record:

1. getJobBySlug in src/lib/jobs/repository.ts (~line 379) calls getLiveJobFeed(), which fetches the
   proxied Remotive feed PLUS up to 500 database jobs on every /jobs/[slug] render, then linearly
   scans for the slug.
2. getPublishedArticleResult in src/lib/editorial/repository.ts (~line 143) loads all published
   editorial articles to return one.

Task:
1. Add a single-job lookup path: try a direct fetch by slug/id first (a filtered query against the
   api.jobs view or a dedicated RPC via the existing repository patterns — repositories re-validate
   rows with zod and return RepositoryResult, see src/lib/data/repository-result.ts). Fall back to
   the Remotive cache scan only for Remotive-sourced slugs that aren't in the database (their slugs
   are derived from the cached feed — preserve current behavior and the source-priority dedupe:
   employer/DB jobs win over Remotive on fingerprint collision).
2. Add a single-article lookup (filter by slug in the list_published_editorial RPC call or a new
   narrow RPC) instead of loading all articles. If a new RPC is needed, add it as a forward-only
   migration under supabase/migrations/ with security posture identical to list_published_editorial
   (security definer, api schema wrapper, no service-role requirement for public reads) and a pgTAP
   test — do NOT apply it to the live database.
3. Preserve the honest-state semantics: unconfigured/unavailable/invalid states must surface exactly
   as they do today (RepositoryNotice rendering depends on them).
4. Keep Next cache tags working (REMOTIVE_CACHE_TAG revalidation on source transitions must still
   invalidate detail pages).
5. Extend the existing tests (src/lib/jobs/repository.test.ts, src/lib/editorial/repository.test.ts)
   to cover the new lookup paths, including slug-not-found and degraded states. Run the quality gate.
```

---

# Tier 2 — Engine correctness

## Prompt 4: Unify cross-source dedup and eligibility classification

```text
SalaryPadi ingests jobs from two lanes (Remotive public API, and prepared-but-dormant ATS adapters
for Greenhouse/Lever/Ashby). The two lanes have divergent logic that breaks cross-source dedup and
makes eligibility labels inconsistent:

1. Fingerprints: buildJobFingerprint (src/lib/jobs/normalize.ts ~line 328) hashes
   title+company+location+arrangement+FULL destination URL (path AND query, only the hash fragment
   stripped). Tracking parameters or apply-URL variants defeat dedup. Worse, Remotive feeds the
   eligibility-evidence text into the location component while the ATS path (src/lib/jobs/ats-import.ts)
   uses the actual location, so the same job from two sources never collapses in fetchAlertJobCatalog
   (netlify/functions/_shared/jobs.ts ~line 327) or getLiveJobFeed (src/lib/jobs/repository.ts ~line 332).
2. Eligibility: Remotive uses classifyEligibility (normalize.ts ~line 140), ATS uses
   mapEligibilityScope (ats-import.ts ~line 143) — different regexes and country handling, so
   identical location strings classify differently by source. These counts feed the editorial
   snapshot metrics (netlify/functions/_shared/editorial.ts ~lines 85-90).

Task:
1. Canonicalize the destination component of the fingerprint: lowercase host, strip default ports,
   strip common tracking params (utm_*, gclid, fbclid, ref, source), strip fragments, keep the path
   and any params that genuinely disambiguate the posting (e.g. Greenhouse job IDs live in the path;
   Lever/Ashby too — verify per adapter in src/lib/jobs/ats/adapters.ts before stripping anything).
2. Make both lanes feed the SAME location semantics into the fingerprint (actual normalized location,
   not eligibility evidence text).
3. Extract ONE shared eligibility classifier used by both normalize.ts and ats-import.ts. Keep the
   product rule intact: the word "remote" alone is never treated as evidence of Nigeria eligibility;
   evidence text is stored separately from the classification. While unifying, make token matching
   less brittle: handle common compound phrases ("Remote (Nigeria preferred)", "Africa & EMEA",
   "LATAM/Africa") and add missing country variants to the known-country map (Côte d'Ivoire/Ivory
   Coast, DRC, UAE, etc.). Unknown phrases must still fall to "unclear" — never guess eligible.
4. IMPORTANT — fingerprint migration: changing fingerprint inputs changes identity. Check every place
   fingerprints persist (database jobs, blob alert catalog, dedupe/expiry logic, DB uniqueness
   constraints from the migrations) and design for continuity: either version the fingerprint or
   document/handle the one-time re-keying so existing published jobs are not mass-expired or
   duplicated. The product plan's rule — "a title/company/location match alone never merges two
   roles" and "a direct employer source wins when fingerprints collide" — must keep holding.
5. This area is heavily tested (normalize.test.ts, ats-import.test.ts, repository.test.ts,
   netlify/functions/_shared/jobs.test.ts). Extend those tests for the new canonicalization and the
   unified classifier, including cross-source collapse cases. Run the quality gate.
```

## Prompt 5: Salary data quality — parsing sanity bounds and outlier defense

```text
Two salary-quality gaps in SalaryPadi:

1. Ingestion parsing (src/lib/jobs/normalize.ts ~lines 263-326): parseAmount accepts any number with
   optional k/M suffix with no sanity floor/ceiling; parseSalary can produce max < min; detectCurrency
   picks by fixed priority so mixed-currency strings mis-tag; plain numbers get currency null;
   annualizedSalaryMinimum hardcodes hourly x 2080 and daily x 260.
2. Crowd aggregation (src/lib/salaries/aggregate.ts ~line 85): aggregateSalaryCell only rejects
   non-finite/negative values. A single fat-finger contribution (e.g. 100,000,000 annualEquivalent)
   skews the cell; the only mitigations are median-not-mean and 10k rounding.

Task:
1. In normalize.ts: enforce min <= max (swap or discard), add per-currency plausibility bounds for
   parsed salary amounts (reject or null out values outside a wide-but-sane band; make the bands
   data-driven constants, documented, per pay period), and make mixed-currency detection fail to
   null rather than guessing. Never invent a currency. A rejected salary must degrade to
   "no salary shown", not block the job.
2. In aggregate.ts: add robust outlier trimming before computing aggregates — an IQR fence or
   median-absolute-deviation trim on the cell's annualEquivalent values. CRITICAL: trimming must
   happen BEFORE the k-anonymity threshold check counts contributors, so a trimmed cell that falls
   below the minimum (3 distinct contributors, 5 for percentiles) gets suppressed, not published.
   Preserve every existing privacy behavior (thresholds, distinct-contributor counting, broadening).
3. Both modules are covered by boundary-heavy tests (normalize.test.ts, aggregate.test.ts). Extend
   them: min>max inputs, absurd magnitudes, mixed currencies, outlier-trim-below-threshold
   suppression. Run the quality gate.
```

## Prompt 6: Worker runtime resilience — retries, finalize path, and error visibility

```text
All 15 scheduled Netlify workers in SalaryPadi run through runTrackedWorker in
netlify/functions/_shared/runtime.ts. Weaknesses found:

1. No retry anywhere: rpc() (~line 201) makes a single attempt with a 4s timeout and throws on any
   non-2xx. One Supabase blip fails the whole scheduled run until the next cron tick.
2. worker_finish failure after successful side-effects (~lines 291-301): if the operation succeeded
   (emails sent, blob written) but worker_finish throws, the run is left un-finalized; dedup relies
   on downstream idempotency (Resend Idempotency-Key) rather than the engine.
3. Pervasive silent error swallowing: .catch(() => undefined) on editorial_record_failure
   (_shared/editorial.ts ~line 310), alert complete() (alert-delivery.mts ~lines 71,107), ATS cleanup
   finalize (ats-source-sync.mts ~line 331), pre-import failure record (ats-source-sync.mts ~line 150).
   A failed failure-record leaves zero trace.
4. Nightly link audit (_shared/editorial.ts ~lines 194-215): checks up to 50 links in sequential
   batches of 5 with 4s timeouts — worst case ~40s against a 20s operation budget. On abort it throws
   BEFORE editorial_record_link_checks, discarding all completed checks.

Task:
1. Add bounded retry with jitter (2-3 attempts, only for idempotent RPCs — reads and the
   worker_start/worker_finish bookkeeping calls; NOT for RPCs with side effects unless they are
   provably idempotent by claim token) inside rpc() or a wrapper. Stay within the existing abort
   budgets (runtime.ts lines 11-19) — a retry must respect the operation signal.
2. Make worker_finish best-effort-with-retry, and when it ultimately fails after a successful
   operation, log a structured event that distinguishes "work done, finalize failed" from "work
   failed" so the health surface doesn't misreport.
3. Replace every bare .catch(() => undefined) in netlify/functions/ with a helper that logs a
   structured console.error (worker, task_key, run_key, error_code) before swallowing. Keep the
   swallowing where it protects the primary path — just never silently.
4. Fix the nightly audit: check links with a time-boxed loop that watches the operation signal,
   persist partial results via editorial_record_link_checks BEFORE the budget expires, and record
   how many targets were skipped this run (log line, and include the skipped count in the worker
   summary). Consider rotating the 50-link window (e.g. order by least-recently-checked) so coverage
   doesn't permanently exclude the tail — only if the editorial_link_targets RPC already exposes an
   ordering; do not change database logic in this prompt.
5. Extend netlify/functions/_shared tests (runtime + editorial + jobs .test.ts files exist) to cover
   retry behavior, finalize-failure logging, and partial link-audit persistence. Run the quality gate.
```

## Prompt 7: Remove silent catalog caps — pagination beyond 500 rows

```text
SalaryPadi silently caps database job reads at 500 rows in two places, with no pagination:
fetchDatabaseJobs (netlify/functions/_shared/jobs.ts ~line 234) and getDatabaseJobFeed
(src/lib/jobs/repository.ts ~line 226). Job #501+ silently vanishes from public search, alerts,
and editorial snapshots. Related scaling note: alert delivery claims 1 delivery per 10-minute tick
(alert-delivery.mts ~line 54, worker_claim_alert_deliveries p_limit: 1) = 144/day ceiling, and the
ops runbook (docs/OPERATIONS.md) says to move to a real queue before 100 due/day.

Task:
1. Implement keyset pagination for both read paths (order by posted_at desc, id — the
   jobs_public_order index in the migrations supports this) looping until exhaustion with a hard
   safety ceiling (e.g. 5,000 rows) that LOGS a structured warning when hit instead of silently
   truncating. Keep per-page size at 500.
2. Watch the worker abort budgets: inside scheduled functions, the pagination loop must check the
   operation signal between pages and stop gracefully, marking the result degraded/partial rather
   than pretending completeness (this matters for editorial snapshot metrics and alert matching —
   a partial catalog must not advance any expiry/omission logic; verify how the snapshot consumers
   treat partial data before wiring).
3. Raise the alert claim batch from 1 to a small config-driven number (e.g. ALERT_DELIVERY_BATCH,
   default 1 to preserve current behavior) so ops can turn the dial without a deploy. The claim RPC
   already takes p_limit. Per-delivery idempotency (claim tokens + Resend Idempotency-Key) already
   exists — preserve it.
4. Extend the existing tests (jobs.test.ts, repository.test.ts) with multi-page fixtures and
   signal-abort mid-pagination cases. Run the quality gate.
```

---

# Tier 3 — Data layer

## Prompt 8: Supabase type codegen + kill the `as never` casts

```text
src/lib/supabase/database.types.ts looks generated but there is no `supabase gen types` script in
package.json — typecheck runs `next typegen && tsc --noEmit` (Next route types only). The DB types
are effectively hand-maintained and drift from supabase/migrations/. Several RPC calls already
bypass the types with `as never` casts (src/lib/admin/repository.ts ~line 38,
src/app/api/admin/[resource]/transition/route.ts ~line 106) — a clear drift symptom.

Task:
1. Add a package.json script, e.g. "db:types": generate TypeScript types from the LOCAL Supabase
   stack (supabase gen types typescript --local --schema api > src/lib/supabase/database.types.ts)
   so it derives from the migrations, not from production. Do NOT point it at the live project.
2. Regenerate the types (requires `supabase start` locally — if Docker/CLI is unavailable in your
   environment, reconstruct the drift manually by diffing migrations against the current types file
   and say so in your summary), then remove every `as never` / manual cast on .rpc() calls, fixing
   the type mismatches properly.
3. Add a CI check: a step in .github/workflows/ci.yml's database job (which already runs
   supabase start) that regenerates types and fails on `git diff --exit-code` for
   src/lib/supabase/database.types.ts. Pin the supabase/setup-cli version while you're in that file
   (it's currently `latest`, a reproducibility risk).
4. Keep the zod re-validation in repositories — it's the runtime safety net; codegen is the
   compile-time one. Run the quality gate.
```

## Prompt 9: Analytics hardening — anon abuse, GA consent gate, single allow-list

```text
Three gaps in SalaryPadi's privacy-first analytics pipeline:

1. api.capture_analytics_event is EXECUTE-granted to anon
   (supabase/migrations/*harden_public_operational_wrappers.sql ~line 118). Consent is enforced only
   by the Next.js cookie check in src/app/api/analytics/events/route.ts (~line 18) and the DB
   allow-list. A scripted anon caller hitting the RPC (or the route with a forged cookie) can
   inflate counters; the only backstop is the 1..1,000,000 per-row CHECK. There is no per-IP/session
   rate limit on this path (the existing consume_rate_limit requires an authenticated user).
2. GA4 events fire OUTSIDE the consent gate: trackEvent (src/lib/analytics/events.ts ~lines 50-69)
   sends to GA (src/lib/analytics/google.ts) regardless of the first-party consent cookie — the
   cookie only gates the /api/analytics/events POST. The consent-versioning work (policy version
   2026-07-12.1) intended GA to be opt-in.
3. The route_group allow-list is duplicated in three places: the client-side analyticsRouteGroup,
   api.capture_analytics_event, and security.capture_analytics_event_internal — drift risk.

Task:
1. Fix the GA consent gate first (it's a privacy promise): make sendGoogleAnalyticsEvent fire only
   when the current consent state grants the Google tier. Check how consent state is exposed
   client-side (src/lib/analytics/consent.ts, the GA loader component in src/components/) — the GA
   script loader is already consent-gated, so align event firing with the same signal.
2. Add abuse protection on the events route: a lightweight fixed-window counter keyed on a hashed
   IP (never store the raw IP — this repo's privacy posture forbids it) with a small in-memory or
   Netlify-Blob-free approach. NOTE: do NOT add a Netlify edge rate-limit rule — the plan allows
   only two and both are used. If a durable counter is genuinely needed, extend the existing
   private.rate_limit_events machinery with an anonymous-scope variant via a forward-only migration
   (+ pgTAP test); do not apply it to production.
3. Reduce the allow-list duplication: make the TypeScript side derive route groups and event names
   from one exported constant, and add a unit test asserting it matches a checked-in snapshot of the
   SQL allow-list, with a comment in the migration pointing at the test (SQL can't import TS — the
   test is the drift tripwire).
4. Extend src/lib/analytics/*.test.ts and the events route tests. Run the quality gate.
```

## Prompt 10: Database migration batch — indexes and server-derived trust fields

```text
Add ONE forward-only migration (do NOT apply it to the live database — commit the file under
supabase/migrations/ with a current timestamp name, plus pgTAP coverage) addressing findings from
a data-layer audit:

1. Salary cell index: private.salary_submissions has a composite index leading with company_id
   (defined in the intelligence migration, salary_submissions_cell), but market-level aggregation
   queries filter role_family_id + country_code WHERE company_id IS NULL. Add a partial index for
   the company-agnostic path: (role_family_id, country_code) WHERE company_id IS NULL — first
   verify the actual aggregate query shapes in the intelligence/operations migrations so the
   column order matches.
2. Public jobs hot path: api.jobs filters valid_through > now() joined with source
   allow_public_listing; the existing jobs_public_order (status, posted_at desc, id) and jobs_expiry
   indexes don't express that combined predicate. Add a partial index supporting the active-listing
   scan (e.g. on (status, valid_through, posted_at desc) or as the query actually needs — read the
   api.jobs view definition first).
3. Company name matching: pg_trgm is enabled but unused — find_company_by_name does exact
   lower() equality. Either add a trigram GIN index on companies.display_name AND a bounded
   similarity fallback inside find_company_by_name (keeping exact match as the primary path and
   never auto-merging on fuzzy match alone), or — if fuzzy matching is not wanted yet — leave the
   function alone and skip this item, noting it in the migration comment.
4. Trust boundary: employer_job_submissions.corporate_domain_matches is caller-supplied in the
   submission payload (jobs migration ~line 1044) instead of derived. Change submit_employer_job to
   compute it server-side from the submitter email domain vs the company website domain, ignoring
   any caller-provided value.
5. pgTAP tests for each behavior change (especially #4: a submission claiming
   corporate_domain_matches=true with a mismatched domain must be stored as false). Follow the
   existing migration idioms: transactional, idempotent (if not exists / duplicate_object guards),
   locked-down grants, fixed search_path on definers. Run supabase db lint if the CLI is available,
   and always run the repo quality gate.
```

---

# Tier 4 — Quality and ops

## Prompt 11: Repo hygiene — .gitattributes (do this one first, it's 5 minutes)

```text
This repo is developed on Windows with core.autocrlf=true and has NO .gitattributes. Result: editors
re-save files as CRLF and `git status` shows ~130 phantom-modified files with zero content diff
(verified: git diff --numstat is empty). This pollutes every session and confuses concurrent agents.

Task: add a .gitattributes at the repo root:
  * text=auto eol=lf
  *.png binary
  *.jpg binary
  *.ico binary
  *.woff2 binary
(check public/ and src/app for other binary asset extensions and cover them). Then run
`git add --renormalize .` and verify `git status` comes back clean apart from .gitattributes itself.
Commit just this change. Do not touch anything else.
```

## Prompt 12: CI hardening — coverage gate, audit step, deploy gating

```text
SalaryPadi's CI (.github/workflows/ci.yml) has gaps found in an ops audit:

1. No coverage measurement or threshold: the quality job runs `vitest run` plainly;
   vitest.config.ts has no thresholds and its coverage include is only src/lib/** (excluding
   supabase client code); test:coverage exists but nothing calls it.
2. No npm audit step, though docs/DEPLOYMENT.md and docs/SECURITY.md mandate `npm audit --omit=dev`
   per release (currently honor-system).
3. supabase/setup-cli@v2 uses version: latest (unpinned) in the database job.
4. Netlify deploys are NOT gated on CI: Netlify builds from its own trigger via build:netlify;
   GitHub checks pass in a parallel universe.

Task:
1. Switch the CI test step to `npm run test:coverage` and add thresholds to vitest.config.ts.
   Measure current coverage FIRST and set thresholds slightly below actual (ratchet approach — the
   goal is preventing regression, not a red pipeline on day one). Keep the include scope but add
   netlify/functions/_shared/** to coverage now that it's tested.
2. Add an `npm audit --omit=dev --audit-level=high` step to the quality job. There's a documented
   PostCSS override pinned in package.json — if audit flags something already documented in
   docs/PRODUCT_PLAN.md as accepted, use --audit-level to keep CI green and add a comment
   referencing the doc.
3. Pin the Supabase CLI version in the database job to the currently-resolving release.
4. Deploy gating: Netlify-side full gating needs dashboard config (out of repo scope), but you can
   strengthen the repo side: extend scripts/verify-deploy-channel.mjs (already runs inside
   build:netlify) to optionally check the GitHub Actions status of the commit being built via the
   GitHub API when a GITHUB_STATUS_TOKEN env is present, failing the Netlify build if CI failed —
   fail OPEN (skip with a logged warning) when the token or API is unavailable, so deploys don't
   break on GitHub outages. Document the new env var in docs/DEPLOYMENT.md.
5. Run the quality gate and make sure the workflow YAML is valid.
```

## Prompt 13: Test the 13 untested Netlify worker entrypoints

```text
Every Netlify scheduled worker handler in SalaryPadi (netlify/functions/*.mts: job-source-sync,
alert-delivery, ats-source-sync, afrotools-catalog-sync, currency-rates, operations-maintenance,
and the nine editorial-* workers) has ZERO unit tests. vitest.config.ts includes only
netlify/functions/_shared/**/*.test.ts — the _shared helpers are tested, the handler entrypoints
are not. This is the automation that runs unattended in production.

Task:
1. Widen the vitest include to netlify/functions/**/*.test.ts (and add the handlers to the coverage
   include if a coverage config exists).
2. Write handler-level tests for each worker covering at minimum:
   - The gate-off path: EDITORIAL_AUTOMATION_ENABLED / REMOTIVE_SOURCE_ENABLED /
     ATS_SOURCE_SYNC_ENABLED false, EMAIL_PROVIDER none, CURRENCY_RATE_PROVIDER none → the worker
     must record a safe skip and make NO provider/RPC data call (these are the product's emergency
     controls — proving them is the point).
   - The worker_start dedup path (should_run false → 204, no operation executed).
   - One happy path with mocked RPC + fetch, asserting worker_finish gets the right status/summary.
   - One operation-failure path asserting worker_finish records the failure and the error code.
3. Mock at the fetch boundary (the _shared/runtime.ts rpc() helper and provider fetches) rather than
   deep-mocking internals — the existing _shared tests (runtime.test.ts, jobs.test.ts,
   editorial.test.ts) show the house style; follow it. The scheduled-event body shape matters
   (readSchedule parses next_run) — build a small shared test helper for scheduled invocations.
4. Also add direct unit tests for currently-indirectly-tested internals: src/lib/payroll/math.ts,
   src/lib/offers/money.ts and validation.ts, src/lib/scam/signals.ts (boundary cases), and a first
   test for src/proxy.ts (auth boundary + CSP nonce header behavior).
5. Run the quality gate; keep the suite fast (no real network, no real timers).
```

## Prompt 14: Production freshness monitoring instead of manual checks

```text
SalaryPadi's health story is currently manual: /api/health reports worker freshness, and
scripts/verify-production-freshness.mjs checks health + key routes — but it's a CLI script a human
must remember to run; there is no external log sink or paging (documented residual in
docs/SECURITY.md and docs/OPERATIONS.md). The post-deploy runbook also requires manually clicking
"Run now" on every scheduled function.

Task:
1. Add a GitHub Actions workflow .github/workflows/production-freshness.yml on a cron (e.g. every
   6 hours, offset from the existing smoke crons at 1:20/4:17/13:20 UTC) plus workflow_dispatch,
   that runs `node scripts/verify-production-freshness.mjs` against https://salarypadi.com.
   On failure the workflow fails — GitHub's default workflow-failure email to the repo owner is the
   alert channel (no new secrets, no external service). Follow the conventions in
   .github/workflows/jobs-live-smoke.yml (Node 22, npm ci, timeout).
2. Harden the script for CI use: non-zero exit codes per failure class, a summary line per check,
   and a --json flag for machine-readable output. Keep it dependency-free (plain node).
3. Add a post-deploy verification mode: the script should accept --expect-deploy-freshness so it can
   be run right after a production deploy to confirm each required worker has a run newer than the
   deploy (reading the same /api/health payload). Document it in docs/DEPLOYMENT.md as the
   replacement for eyeballing worker rows.
4. Do not add secrets; /api/health is intentionally unauthenticated. Run the quality gate.
```

---

# Tier 5 — Product UX

## Prompt 15: Account settings + alert management UI

```text
SalaryPadi has no account/settings surface: no profile page, no email preferences, no alert
editing. Alerts (/alerts, src/app/alerts/) can only be created and deleted — the data model has an
`active` field but the UI exposes no pause toggle and no way to edit an alert's query/filters.
Community identity (display name/handle/state) is edited inline per-post via
CommunityIdentityFields rather than centrally. Account deletion routes to the /privacy/requests form
(that's deliberate — keep it, but link it).

Task:
1. Add /account (signed-in, noindex, no-store like the other private pages — copy the metadata
   pattern from /saved): shows email, community identity fields (reuse CommunityIdentityFields and
   whatever RPC persists it today), MFA status (reuse components/auth/mfa-panel.tsx), sign-out, and
   a link to /privacy/requests for data export/deletion.
2. Alert management: add pause/resume (the active field) and edit (query/filters/cadence — check
   the job_alerts columns in the jobs migration and the existing /api/alerts routes for what's
   supported; add an /api/alerts/update route following the exact auth + origin-check + zod +
   redirect-with-status pattern of the existing career API routes, backed by the existing
   owner-scoped RPCs — if no update RPC exists, add one via forward-only migration + pgTAP,
   owner-scoped RLS semantics identical to the create/remove RPCs; do not apply to prod).
3. Wire "My career" in the site header (components/site-header.tsx) to include the new page.
4. Honest states throughout: unconfigured/unavailable render BackendNotice / PrivateDataStatus like
   sibling pages. All forms follow the existing progressive-enhancement form POST pattern.
5. Extend Playwright authenticated-flows.spec.ts (it skips without credentials in CI — follow its
   existing structure) and unit-test the new route handlers. Run the quality gate.
```

## Prompt 16: UX polish and DRY sweep

```text
A product-surface audit of SalaryPadi found repeated small gaps. Fix them in one sweep:

1. Route-level loading/error boundaries: only the root src/app/loading.tsx and error.tsx exist.
   Add loading.tsx (skeletons consistent with the existing empty-state visual language) and
   error.tsx to the slow data-bound segments: jobs/[slug], companies/[slug] (covers subpages),
   salaries/[country]/[role], insights/[slug], and tools/. Keep them server-light; error.tsx must
   be a client component per Next.js 16 conventions (verify in node_modules/next/dist/docs/).
2. Company page gap: the active-jobs section on companies/[slug]/page.tsx (~line 142) maps
   company.activeJobs with no empty state — add one matching the community-evidence section's style.
3. Mobile nav accessibility: components/site-header.tsx (~line 65) uses <details>/<summary> for the
   mobile menu — no aria-expanded, no focus management, unpredictable close. Replace with a real
   disclosure button + panel: aria-expanded, aria-controls, Escape to close, focus return to the
   trigger, close on route change. Keep it dependency-free and progressive (menu content should
   remain reachable without JS — e.g. keep <details> as the no-JS fallback or render links in the
   footer; match however the codebase handles no-JS elsewhere).
4. DRY the four tool clients: take-home-calculator.tsx, salary-converter.tsx, offer-compare.tsx,
   scam-checker.tsx all repeat the same useState(result/error/loading) + fetch + try/catch/finally.
   Extract a shared useToolRequest hook (typed request/response, bounded errors mapped to the same
   user-facing messages currently shown — do not change any user-visible copy or the
   privacy-preserving compute split where converter/compare fetch only FX rates and compute
   locally).
5. Shared searchParams utilities: the first()/slice normalization helpers are duplicated in
   feed/page.tsx (~line 20), forums/page.tsx (~line 20), and salaries/page.tsx. Extract to one
   util module.
6. There's an existing test for offer-compare-form — follow that pattern to test the shared hook.
   Run the quality gate, and check the affected pages at 360px/768px/desktop via the existing
   Playwright responsive spec if it covers them.
```

## Prompt 17: Salary cold-start — contribution funnel, not fake data

```text
SalaryPadi's salary intelligence has a cold-start problem: aggregates require 3+ approved
contributions from distinct accounts per cell, so /salaries and every /salaries/[country]/[role]
page is empty until real contributions accrue. The product principle forbids seeding fake data —
the fix is funnel mechanics, not fabrication.

Task:
1. Progress transparency: on empty salary cells (salaries pages and company salary tabs), show an
   honest progress indicator — "N of 3 approved contributions needed before this aggregate can be
   published" — ONLY if a count of pending/approved contributions for the cell can be exposed
   without weakening k-anonymity. Think through re-identification first: a count of 1-2 on a narrow
   cell (company+role+country) leaks that a specific person contributed. Safe version: show counts
   only at broad cells (role+country, no company) and cap the displayed value at the threshold
   ("fewer than 3"). If exposing any count requires a new RPC, add it forward-only with pgTAP tests
   proving it never returns per-company sub-threshold counts; do not apply to prod.
2. Contribution prompts in high-intent moments: after a job save/application-track action and on
   job detail pages for companies with no published salary data, render a small CTA to
   /contribute/salary prefilled (query params) with the company and role context. Follow the
   existing analytics event allow-list pattern if you add a tracking event (allow-listed name, no
   properties).
3. Reduce funnel friction: review src/app/contribute/salary's form for optional fields that could
   move behind a "add more detail" disclosure so the core submission (role, company, country, pay)
   is fast. Do not remove any validation.
4. Shareability: after a successful contribution, show a WhatsApp-share prompt ("help others see
   real salaries") reusing the job-detail WhatsApp share mechanism.
5. Unit-test the count-exposure logic hard (privacy edge cases are the whole game here) and run the
   quality gate.
```

## Prompt 18: Scam checker heuristic expansion

```text
SalaryPadi's job scam checker (src/lib/scam/ — analyze.ts, signals.ts, definitions.ts) is
deliberately deterministic, local, and never fetches URLs — keep all of that. An audit found
coverage gaps:

1. English-only regexes — no Nigerian Pidgin patterns, though the launch market is Nigeria.
2. PERSONAL_EMAIL_DOMAINS (definitions.ts ~line 143) is a small static set — missing yandex.com,
   gmx.com/net, zoho.com, mail.com, proton.me, regional Yahoo/Outlook TLDs, and common Nigerian
   free-mail patterns.
3. Lookalike-domain detection (signals.ts ~line 99) is coarse: edit-distance <= 2 only for domains
   longer than 12 chars — misses short-domain typosquats and produces false positives on legitimately
   similar long domains. Homoglyph handling only detects punycode (xn--), not mixed-script or
   visually-confusable ASCII substitutions (0/o, 1/l, rn/m).
4. Fee-request negation regexes (signals.ts ~line 32) are bypassed by simple rephrasing.

Task:
1. Expand the personal-email domain list and add common Nigeria-relevant scam phrasings (fee
   requests, "processing/registration/logistics fee", urgency, WhatsApp-only contact, crypto
   payment) including frequent Pidgin phrasings. Keep every signal explainable — each match must
   keep producing its individual evidence string, and the cautious risk language ("indicators", not
   verdicts) must not change.
2. Improve lookalike detection: normalize confusable characters before comparison, compare against
   the registrable domain (eTLD+1) not the full host, scale the edit-distance threshold with domain
   length, and add a short allow-list of known-legit domains that commonly trigger false positives.
3. Add a few negation-robust fee patterns (e.g. fee mention within N tokens of pay/send/transfer
   regardless of sentence framing) — accept imperfect recall; NEVER let a heuristic claim safety,
   only add risk indicators.
4. This module has boundary-heavy tests (analyze.test.ts) — extend them substantially: new
   detections, the false-positive allow-list, Pidgin samples, confusable normalization. The tool's
   API contract (src/app/api/tools/job-scam-check/route.ts and routes.test.ts) must not change
   shape. Run the quality gate.
```

---

## Suggested run order

| Order | Prompt                                | Why first                                                         |
| ----- | ------------------------------------- | ----------------------------------------------------------------- |
| 1     | 11 (.gitattributes)                   | 5 minutes; unblocks clean git status for every later session      |
| 2     | 1 (SEO discoverability)               | Biggest growth lever; everything indexable is currently invisible |
| 3     | 3 (job detail perf)                   | Hot-path cost + latency on the most-shared page type              |
| 4     | 13 (worker tests)                     | De-risks every subsequent engine change                           |
| 5     | 4, 5 (dedup + salary quality)         | Engine correctness before scaling sources                         |
| 6     | 8, 9 (typegen, analytics)             | Data-layer integrity and a real privacy promise fix (GA gate)     |
| 7     | 6, 7 (runtime resilience, pagination) | Reliability at scale                                              |
| 8     | 12, 14 (CI, monitoring)               | Ops hardening                                                     |
| 9     | 2, 15, 16, 17, 18                     | Product depth once the engine is trustworthy                      |

Notes for the operator (you, not Codex):

- Prompts 3, 9, 10, 15, 17 may add forward-only migrations. Apply them to production yourself via the
  project-scoped CLI after review — agents must never apply migrations to bxelrhklsznmpksgrqep.
- Several engine capabilities are dormant by env flag (EMAIL_PROVIDER, EDITORIAL_AUTOMATION_ENABLED,
  REMOTIVE_SOURCE_ENABLED, CURRENCY_RATE_PROVIDER). Confirm which are set in Netlify production —
  code improvements to a gated-off worker deliver nothing until the flag is on.
- Deploy gating (prompt 12 item 4) is only fully solved in the Netlify dashboard; the repo-side check
  is a mitigation.
- Concurrent Codex sessions write to this repo — run prompts touching the same files sequentially
  (e.g. 4 and 5 both touch normalize.ts; 1 and 2 both touch page metadata).
