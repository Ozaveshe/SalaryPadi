# Job ingestion architecture

## Current answer

SalaryPadi does not currently scrape job boards. Production jobs come from two bounded lanes:

1. The documented Remotive public API, operated as an attributed, noindex pilot.
2. Structured employer submissions in SalaryPadi, which remain private until an administrator approves them.

Remotive is global remote-job data. It is not sufficient evidence for a nationwide Nigeria jobs catalogue, and SalaryPadi must not describe it as one. Nationwide coverage requires explicit employer/partner feed permissions and reviewed ATS adapters.

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

## Adapter contract

Every adapter must provide a fixed source identity and return normalized jobs plus one source-derived `checkedAt`. It must never accept a user-controlled fetch URL. Before activation it needs:

- source owner and written permission or a documented feed/API licence;
- homepage, terms URL/version/hash, review timestamp and required attribution;
- allowed HTTPS host/path and redirect policy;
- storage, public-listing, indexing and `JobPosting` permissions, all false by default;
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

An HTML adapter, if later approved, additionally requires a named SalaryPadi crawler user agent, DNS/private-network SSRF protection, one concurrent request per domain, `Retry-After` support, jittered backoff, robots caching/drift detection, extractor versioning, hostile-HTML tests, and automatic quarantine when terms/robots change. A failed or partial run can never close jobs; closure requires two successful complete snapshots omitting the source record or authoritative closure evidence.

## Verification

Pull-request gates are deterministic and never consume provider quota:

- shared-adapter contract and hostile-response tests;
- public repository policy, degraded-state, quarantine and dedupe tests;
- protected refresh-route authorization/redaction tests;
- worker policy/order/failure-recording tests;
- deep alert-snapshot validation tests;
- pgTAP policy privilege and pause/disable/re-enable tests;
- build, lint, typecheck and ordinary browser journeys.

The production canary is scheduled for 01:20 and 13:20 UTC, fifteen minutes after the expected source runs. It requires a source success within the preceding two hours, then reads only SalaryPadi endpoints and proves a populated Remotive-backed list, a stable detail route, visible source evidence, noindex/no-`JobPosting` policy, and an HTTPS outbound source URL. It normally reuses the shared cache; if the cache is cold, the same database-backed limit of one request per minute and four requests per rolling 24 hours still applies before any provider call.

## Known scale boundary

The current website and alert paths read at most 500 published database jobs before in-memory matching. Before employer/partner inventory approaches that size, move search/filtering and cursor pagination into database RPCs and partition alert matching into a durable queue. Import runs are intentionally evidence-only: both the admin screen and authoritative database boundary reject retry until a real, rate-aware consumer exists.
