# Job ingestion architecture

## Current answer

SalaryPadi does not scrape job boards. The only currently enabled supply lane is:

1. Structured direct-employer submissions in SalaryPadi, which remain private until an administrator approves them and records the authorization attestation.

The Remotive adapter is implemented but disabled because its API page and current general terms conflict on automated extraction and republication. It cannot make a provider request until written clarification is recorded. Remotive is global remote-job data in any case; it is not evidence for a nationwide Nigeria jobs catalogue.

Greenhouse, Lever, Ashby, ReliefWeb, Jobicy, and licensed-partner adapter boundaries are also implemented but inactive. No production endpoint call, persistence, publication, indexing, structured data, or email distribution is authorized until the source-policy registry, required external evidence, database authorization, and independent environment gate all permit it.

## Prepared external-source flow (inactive)

```text
Netlify schedule (01:05, 07:05, 13:05 and 19:05 UTC)
  -> emergency environment gate
  -> service-role source-policy RPC
  -> distributed provider-budget claim
  -> protected SalaryPadi snapshot route
  -> read or revalidate the shared six-hour Next cache
  -> fixed Remotive adapter
       -> HTTPS fixed endpoint, no redirects or credentials
       -> 10-second deadline
       -> application/json only
       -> streamed 2 MiB maximum
       -> Zod contract and non-empty feed
       -> safe destination, HTML-to-text and eligibility normalization
  -> shared six-hour public cache
  -> description-free current Netlify Blob
  -> immutable import and worker-run evidence

Public /jobs and /jobs/{id-or-slug}
  -> currently runnable public-display source policy
  -> complete occurrence-to-canonical provenance
  + published, non-expired employer jobs from Supabase
  -> destination-aware identity fingerprint
  -> employer/partner/manual/API precedence
  -> search, eligibility filters and pagination

Alert delivery (every fifteen minutes)
  -> current validated Blob snapshot
  + published employer jobs
  -> suppress Remotive until written email-redistribution permission exists
  -> canonical dedupe and saved-alert match
  -> stable SalaryPadi job ID link
```

All source gates must permit acquisition. `REMOTIVE_SOURCE_ENABLED=false` stops the source immediately. A paused, disabled, missing, overdue, dependency-incomplete, unreviewed, or contract-mismatched database policy also stops acquisition before any provider request. Neither gate can override the other. The current Remotive policy is disabled.

The alert Blob has one strong-consistency `current` key and no history. It rejects malformed nested jobs, leaked descriptions, insecure URLs, timestamps over five minutes in the future, and snapshots older than fourteen hours.

## Prepared ATS flow

The ATS lane is a separate, fail-closed scheduled path. Its database registration expects a run every two hours and marks it stale after five hours. The Netlify worker must still pass `ATS_SOURCE_SYNC_ENABLED=true`, and the database must return at least one currently authorized employer source. The environment value remains `false` and no employer source/configuration is seeded, so a deployed schedule records a safe skip without making a provider request.

```text
Activation prerequisite
  -> source owner obtains written employer permission
  -> source remains draft and ATS_SOURCE_SYNC_ENABLED remains false
  -> operator records the final source permissions
  -> operator enables the final private tenant, destination and cadence config
  -> recorded-fixture and database validation
  -> terms + authorization review after the configuration is final
  -> activate the source in review mode while the environment gate stays false
  -> controlled claimed dry run, then return the environment gate to false
  -> named approval may leave scheduled acquisition enabled

Netlify ATS schedule (minute 02, 17, 32 and 47 of every hour; 96 bounded claim opportunities/day)
  -> independent ATS_SOURCE_SYNC_ENABLED environment gate
  -> if false, record a safe skip with no source/provider call
  -> service-role worker lists currently authorized sources
  -> generic database fetch claim enforces cadence, spacing and daily budget
  -> fixed Greenhouse, Lever or Ashby endpoint builder
       -> credential-free GET, no redirects, no referrer, no cache
       -> caller-owned deadline and streamed 4 MiB limit
       -> provider payload validation and 2,000-record ceiling
       -> exact destination host + path-prefix validation
       -> invalid records quarantined; no arbitrary fetch URL
       -> remote-only publication filter
          -> explicit worldwide, Africa, EMEA, Nigeria or named African country
          -> reject onsite, hybrid, non-African-only and unclear geography
          -> reject disqualifying work-authorization requirements
  -> begin one durable snapshot for that source
  -> normalize and store bounded batches through service-role RPC
  -> finalize as complete, partial, failed or quarantined
  -> append count-only evidence
  -> review mode keeps new/changed jobs pending
```

One invocation claims at most one source and stops when the function deadline is too close. The database still enforces each source's two-hour or stricter reviewed polling interval, spacing and daily request budget. Policy-filtered records are fully accounted omissions, not malformed quarantines, so a complete snapshot may safely reconcile a previously eligible role that became geographically restricted. A skipped, partial, or failed invocation must not be reported as source freshness.

The authorization migration keeps ATS tenant/network settings in `private.ats_source_configs`. It seeds no employer ATS source or configuration. Public and authenticated roles cannot read the employer grantor, authorization evidence, or private configuration. A shared internal predicate powers worker list, get, and claim operations and admits employer ATS rows only with `written_permission` or `commercial_contract`; it excludes paused, disabled, expired, revoked, removed-company, suspended-company, and configuration-mismatched sources. Changing source policy or ATS configuration pauses the source and invalidates the previous authorization review.

The lifecycle migration rechecks the same authorization predicate at begin, batch, and finalization, so a mid-run pause, revocation, expiry, or configuration change fails closed. It permits only one unfinalized snapshot per source, validates destinations again at the database boundary, and writes append-only outcome/count evidence without provider descriptions.

### Missing-job lifecycle

A source record is not closed merely because it is absent once.

- `complete` means the provider response was fully read and every provider record was either accepted with no errors or the run was otherwise proven error-free. Only this outcome can advance omission counters.
- `partial` means the worker fetched provider records but could not finalize a fully accounted error-free snapshot, including an invalid, duplicated, unexpectedly filtered, or quarantined record. Valid rows may be updated, but no unseen record's omission counter changes.
- `quarantined` is the zero-fetched outcome with one or more quarantines. `failed` is the ordinary zero-fetched error outcome. Neither changes omission counters or closes jobs.
- Seeing a record in a later complete snapshot resets its omission counter to zero.
- Two consecutive successful complete snapshots that omit the same source record expire its published job. A reviewed authoritative employer closure may expire it sooner.

This rule handles a legitimate complete empty feed: the first complete empty snapshot records one omission; a second consecutive complete empty snapshot closes the still-missing jobs. A timeout, schema drift, truncated response, destination rejection, or isolated bad record cannot masquerade as an empty complete feed.

## Adapter contract

Every adapter must provide a fixed source identity and return normalized jobs plus one source-derived `checkedAt`. It must never accept a user-controlled fetch URL. Before activation it needs:

- source owner and written permission or a documented feed/API licence;
- homepage, terms URL/version/hash, review timestamp and required attribution;
- allowed HTTPS host/path and redirect policy;
- storage, public-listing, indexing and `JobPosting` permissions, all false by default;
- email-distribution permission, false by default and independent from public listing;
- source-specific deadline, decompressed-byte/record limits and cadence;
- recorded fixtures for success, empty, malformed, oversized, timeout, 429 and 5xx responses;
- idempotent source/external ID reconciliation and the shared canonical duplicate key;
- quarantine rules, expiry/missing policy, takedown path and operator kill switch.

Provider IDs remain source-specific identity. Fingerprint v2 includes normalized visible facts and a canonical application/source destination. It preserves the host, posting path and non-tracking query parameters, while removing fragments, common campaign parameters and only the known Greenhouse/Lever/Ashby apply-page suffix. A title/company/location match alone never merges two roles: different posting paths or genuine identity parameters remain separate reconciliation candidates until a reviewer explicitly links them.

The v2 re-key is forward-compatible rather than a destructive database migration. ATS snapshots continue to upsert on `(source_id, external_source_id)`, so a successful source refresh replaces the stored v1 hash in place; the two-complete-omission expiry rule also uses source identity, never the fingerprint. During the transition, detail collision checks query both the current v2 key and the exact legacy v1 key, and alert-catalog reads recompute v2 from their redacted public facts before merging. Direct employer/database records retain priority when a canonical fingerprint collides. No published job is expired or duplicated solely because its fingerprint version changes.

## Nationwide source expansion

Use this order:

1. Verified employer submissions and employer-owned exports.
2. Explicit partner feeds or APIs.
3. Employer-authorized public ATS endpoints such as Greenhouse, Lever or Ashby.
4. Employer RSS/XML or `JobPosting` JSON-LD with recorded permission.
5. Allowlisted HTML extraction only after written permission plus terms and robots review.

Do not build a generic crawler. Do not scrape LinkedIn, Indeed, Glassdoor, authenticated pages, search-result pages, anti-bot challenges, or any source without explicit authorization. Public reachability is not republication permission.

## 500-new-canonical-jobs/day operating target

The target is 500 distinct, validated `canonical_created` events per UTC day after remote/eligibility filtering and exact deduplication. Provider rows, repeated occurrences, filtered geography, quarantines and updates do not count. The count-only supply canary reports `unavailable` when no eligible jobs are public, `capacity_unproven` when authorized evidence-backed capacity is below 500/day, `stale` when capacity exists but creation evidence is old, and `ready` only when all three conditions are satisfied.

The 15-minute ATS dispatcher removes the previous twelve-claims/day global ceiling and permits up to 96 bounded source claims/day. This is scheduling capacity, not data capacity or permission. An adapter contributes to `authorized_daily_capacity` only after a current rights record and a source-specific evidence reference support its expected distinct canonical yield. The planned portfolio must exceed 500/day after measured duplicate and rejection rates; no placeholder projection is credited.

Operational activation order is: direct employer submissions, licensed remote-job partner feeds, then individually authorized Greenhouse/Lever/Ashby boards, followed by reviewed humanitarian/public APIs. Add one source at a time, run a disabled dry run, inspect accepted/filtered/quarantined counts, then enable it only after current permission, retention, attribution, indexing and email rights are recorded. Remotive remains outside this capacity until its republication conflict is resolved in writing.

An HTML adapter, if later approved, additionally requires a named SalaryPadi crawler user agent, DNS/private-network SSRF protection, one concurrent request per domain, `Retry-After` support, jittered backoff, robots caching/drift detection, extractor versioning, hostile-HTML tests, and automatic quarantine when terms/robots change. The same two-complete-omission rule applies; failed, partial, and quarantined runs never close jobs.

## Verification

Pull-request gates are deterministic and never consume provider quota:

- shared-adapter contract and hostile-response tests;
- recorded Greenhouse, Lever, and Ashby contract-drift fixtures, including empty and newly observed optional fields;
- public repository policy, degraded-state, quarantine and dedupe tests;
- protected refresh-route authorization/redaction tests;
- worker policy/order/failure-recording tests;
- deep alert-snapshot validation tests;
- pgTAP policy privilege and pause/disable/re-enable tests;
- pgTAP authorization-expiry, configuration-drift, destination-path, generic-budget, snapshot idempotency, partial-run, and two-complete-omission tests;
- build, lint, typecheck and ordinary browser journeys.

The production canary is scheduled for 01:20, 07:20, 13:20 and 19:20 UTC, fifteen minutes after the source-worker schedule. It reads only SalaryPadi endpoints. A safe skip proves the schedule and kill switch are alive and requires no Remotive records to be public; it does not prove source success. If the worker succeeds under a separately authorized policy, the canary additionally proves a populated attributed listing, stable detail route, noindex/no-`JobPosting` policy, and HTTPS source destination. The database-backed ceiling remains one request per minute and four requests per rolling 24 hours.

## Known scale boundary

The current website and alert paths read at most 500 published database jobs before in-memory matching. Before employer/partner inventory approaches that size, move search/filtering and cursor pagination into database RPCs and partition alert matching into a durable queue. The existing admin console exposes import evidence but no direct retry. ATS retries must be claimed by a real rate-aware worker and must reuse an idempotent run key rather than bypassing the generic source budget.
