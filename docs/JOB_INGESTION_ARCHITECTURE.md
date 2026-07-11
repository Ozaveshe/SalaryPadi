# Job ingestion architecture

## Current answer

SalaryPadi does not currently scrape job boards. Production jobs come from two bounded lanes:

1. The documented Remotive public API, operated as an attributed, noindex pilot.
2. Structured employer submissions in SalaryPadi, which remain private until an administrator approves them.

Remotive is global remote-job data. It is not sufficient evidence for a nationwide Nigeria jobs catalogue, and SalaryPadi must not describe it as one. Nationwide coverage requires explicit employer/partner feed permissions and reviewed ATS adapters.

Greenhouse, Lever, and Ashby adapter, worker, and lifecycle infrastructure is implemented in the repository but remains inactive. Moniepoint Greenhouse and M-KOPA Ashby are the first recommended permission conversations, not active sources. No production endpoint call, persistence, publication, indexing, structured data, or email distribution is authorized until written permission is recorded and the production database/worker path is separately verified.

## Production flow

```text
Netlify schedule (01:05 and 13:05 UTC)
  -> emergency environment gate
  -> service-role source-policy RPC
  -> protected SalaryPadi snapshot route
  -> read or revalidate the shared twelve-hour Next cache
  -> on a cache miss, claim the database-backed provider budget
  -> fixed Remotive adapter
       -> HTTPS fixed endpoint, no redirects or credentials
       -> 10-second deadline
       -> application/json only
       -> streamed 2 MiB maximum
       -> Zod contract and non-empty feed
       -> safe destination, HTML-to-text and eligibility normalization
  -> shared twelve-hour public cache
  -> description-free current Netlify Blob
  -> immutable import and worker-run evidence

Public /jobs and /jobs/{id-or-slug}
  -> active-only public source-policy view
  -> same tagged Remotive cache
  + published, non-expired employer jobs from Supabase
  -> destination-aware identity fingerprint
  -> employer/partner/manual/API precedence
  -> search, eligibility filters and pagination

Alert delivery (every ten minutes)
  -> current validated Blob snapshot
  + published employer jobs
  -> suppress Remotive until written email-redistribution permission exists
  -> canonical dedupe and saved-alert match
  -> stable SalaryPadi job ID link
```

Both source gates must permit acquisition. `REMOTIVE_SOURCE_ENABLED=false` stops the source immediately. A paused, disabled, missing, unreviewed, or contract-mismatched database policy also stops acquisition before any provider request. Neither gate can override the other.

The alert Blob has one strong-consistency `current` key and no history. It rejects malformed nested jobs, leaked descriptions, insecure URLs, timestamps over five minutes in the future, and snapshots older than fourteen hours.

## Prepared ATS flow

The ATS lane is a separate, fail-closed scheduled path. Its database registration expects a run every six hours and marks it stale after fourteen hours. The Netlify worker must still pass `ATS_SOURCE_SYNC_ENABLED=true`, and the database must return at least one currently authorized employer source. The environment value remains `false` and no employer source/configuration is seeded, so a deployed schedule records a safe skip without making a provider request.

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

Netlify ATS schedule (02:35, 08:35, 14:35 and 20:35 UTC)
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
  -> begin one durable snapshot for that source
  -> normalize and store bounded batches through service-role RPC
  -> finalize as complete, partial, failed or quarantined
  -> append count-only evidence
  -> review mode keeps new/changed jobs pending
```

One invocation claims at most two sources and stops when the function deadline is too close. A skipped, partial, or failed invocation must not be reported as source freshness.

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

Provider IDs remain source-specific identity. The runtime fingerprint includes normalized visible facts and the exact application/source destination; a title/company/location match alone never merges two roles. Cross-source lookalikes with different destinations remain separate reconciliation candidates until a reviewer explicitly links them.

## Nationwide source expansion

Use this order:

1. Verified employer submissions and employer-owned exports.
2. Explicit partner feeds or APIs.
3. Employer-authorized public ATS endpoints such as Greenhouse, Lever or Ashby.
4. Employer RSS/XML or `JobPosting` JSON-LD with recorded permission.
5. Allowlisted HTML extraction only after written permission plus terms and robots review.

Do not build a generic crawler. Do not scrape LinkedIn, Indeed, Glassdoor, authenticated pages, search-result pages, anti-bot challenges, or any source without explicit authorization. Public reachability is not republication permission.

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

The production canary is scheduled for 01:20 and 13:20 UTC, fifteen minutes after the expected source runs. It requires a source success within the preceding two hours, then reads only SalaryPadi endpoints and proves a populated Remotive-backed list, a stable detail route, visible source evidence, noindex/no-`JobPosting` policy, and an HTTPS outbound source URL. It normally reuses the shared cache; if the cache is cold, the same database-backed limit of one request per minute and four requests per rolling 24 hours still applies before any provider call.

## Known scale boundary

The current website and alert paths read at most 500 published database jobs before in-memory matching. Before employer/partner inventory approaches that size, move search/filtering and cursor pagination into database RPCs and partition alert matching into a durable queue. The existing admin console exposes import evidence but no direct retry. ATS retries must be claimed by a real rate-aware worker and must reuse an idempotent run key rather than bypassing the generic source budget.
