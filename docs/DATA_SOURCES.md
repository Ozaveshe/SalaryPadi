# Data sources and provenance

SalaryPadi does not treat a reachable feed as permission to republish it. Every job source must have an explicit policy record covering acquisition, storage, attribution, destination, indexing, refresh cadence, and structured-data use before it can be publicly enabled.

## Current source matrix

| Source                                                | Status                                                           | Public listing                                     | Storage                                                                                             | Indexing                              | Required destination                 |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Remotive public API                                   | Disabled; current API/general terms conflict reviewed 2026-07-14 | No                                                 | No new storage while disabled; historical production state is covered by the production-truth audit | No                                    | The Remotive URL returned by the API |
| Employer submissions                                  | Moderated intake                                                 | Only after approval                                | Structured submission and audit history                                                             | Only after approval and policy review | Validated HTTPS application URL      |
| Moniepoint Greenhouse                                 | Candidate pilot only; permission not received; disabled          | No                                                 | No production acquisition or storage                                                                | No                                    | Not approved                         |
| M-KOPA Ashby                                          | Candidate pilot only; permission not received; disabled          | No                                                 | No production acquisition or storage                                                                | No                                    | Not approved                         |
| Community salary, review, and interview contributions | Moderated intake                                                 | Thresholded aggregate or redacted publication only | Private raw record plus approved public projection                                                  | Sparse/private states are not indexed | SalaryPadi detail page               |
| Direct licensed feeds                                 | Not configured                                                   | No                                                 | No                                                                                                  | No                                    | Provider-specific agreement required |

No scraping adapter is enabled. Do not add one without written permission or a documented legal and policy review.

## Remotive disabled boundary

The adapter policy is defined in `src/lib/jobs/source-policy.ts` and enforced by the server repository.

- Fetch only `https://remotive.com/api/remote-jobs` from a fixed server-side endpoint.
- The default schedule is four times daily, but every provider request first requires an enabled current database policy, the environment kill switch, and a distributed database budget claim. Current policy denies that claim. If written permission is later recorded, the reviewed default is no more than one request per six hours and four in a rolling 24-hour window.
- Require both `REMOTIVE_SOURCE_ENABLED=true` and an active, reviewed, public-enabled `app.job_sources` policy before acquisition. An environment flag cannot override a paused database policy, and the database cannot override the emergency environment kill switch.
- Require `application/json`, enforce a two-MiB streamed response limit, reject empty/schema-invalid responses, reject redirects, and normalize only destinations on Remotive HTTPS hosts.
- Validate the response shape and normalize it before rendering.
- Remove source HTML and render plain text. Never inject the source description as raw HTML.
- Display visible “Source: Remotive” attribution and link to the returned Remotive job URL.
- Do not persist a durable full-text archive of Remotive descriptions.
- Mark Remotive-backed listing and detail routes `noindex` and do not emit `JobPosting` structured data.
- Do not redistribute these listings to Google Jobs, LinkedIn, or another job platform.
- Disable the feed with `REMOTIVE_SOURCE_ENABLED=false` if terms, attribution requirements, or availability change.

Terms basis: the [Remotive API page](https://remotive.com/remote-jobs/api) permits low-frequency attributed sharing, while the newer [general terms](https://remotive.com/terms-of-use) prohibit automated extraction and republication. The conflict was reviewed on 2026-07-14. The adapter, public projection, indexing, `JobPosting`, email, and provider budget all fail closed until written republication confirmation is recorded.

The interim source and terms owner is Oza at `sources@salarypadi.com`. The `job-source-sync` function validates the authoritative database policy, asks the protected web route to read or revalidate the shared public cache, records counts and a provider-safe error code, and replaces one site-scoped Netlify Blob used by alert delivery. That snapshot contains normalized matching facts but explicitly removes descriptions, requirements, benefits, and risk text; it has no historical keys. Ten-minute alert delivery never calls Remotive independently. Pull-request CI uses recorded fixtures; the scheduled post-sync production canary checks the user-visible flow through SalaryPadi, and any cold-cache provider request remains inside the durable database budget.

Remotive-backed rows are excluded from private alert emails until written permission explicitly covers email redistribution. The prepared source-authorization migration adds a false-by-default `may_email_jobs` permission and records Remotive as `false`; the existing alert path also suppresses Remotive independently. Public Remotive pages continue to show visible attribution and the direct returned source URL without an account gate.

Remotive is a global remote-job feed, not a nationwide Nigeria source. SalaryPadi must not claim nationwide completeness until employer-authorized ATS/feed coverage exists. The full current and target design is in [Job ingestion architecture](JOB_INGESTION_ARCHITECTURE.md).

## Employer ATS authorization boundary

The repository contains a disabled-by-default Greenhouse, Lever, and Ashby adapter contract under `src/lib/jobs/ats/`, normalization and quarantine logic in `src/lib/jobs/ats-import.ts`, the gated `netlify/functions/ats-source-sync.mts` worker, and prepared database migrations for source authorization and snapshot lifecycle. These files are infrastructure, not permission. They do not authorize SalaryPadi to fetch, store, publish, index, or email any employer's jobs, and they seed no employer ATS source or private ATS configuration. The only conservative authorization backfills are for existing first-party employer submissions and the constrained Remotive source.

The prepared policy requires all of the following before a worker can obtain an ATS source configuration:

- an `employer_ats` source row with current terms review and current authorization evidence;
- an authorization basis of `written_permission` or `commercial_contract` for an employer pilot;
- a named employer grantor, non-secret evidence reference, reviewer, review date, and optional expiry;
- false-by-default permissions for description storage, indexing, `JobPosting`, and email distribution;
- an enabled private provider/tenant configuration with exact HTTPS destination hosts and path prefixes;
- matching cadence, per-source daily budget, and minimum spacing;
- a company that is not removed or suspended; automatic publication additionally requires a published, verified company.

Policy or ATS configuration changes automatically pause the source and clear the prior authorization review. Expiry or revocation also removes the source from the public and worker authorization predicates. Service-role list/get/claim RPCs all use the same predicate, so an application caller cannot manufacture authorization by constructing a TypeScript object.

The lifecycle migration registers `ats_source_sync` with a two-hour per-source expectation and five-hour stale threshold. The Netlify worker offers one bounded source claim every fifteen minutes so a growing allowlist is not limited to twelve claims/day; database claims still enforce each source's reviewed two-hour or stricter cadence. `ATS_SOURCE_SYNC_ENABLED=false` is an independent environment stop and no ATS source/configuration is seeded. It keeps one running snapshot per source, records append-only count evidence without provider descriptions, and rechecks authorization on every begin, batch, and finalization operation. Invalid or duplicate records are quarantined. Onsite, hybrid, geographically restricted and unclear remote records are policy-filtered and never published. A run that fetched provider records but has any quarantine/error is partial; a zero-fetched run with quarantines is quarantined, and an ordinary zero-fetched error is failed. None of those outcomes increments omission counters or closes jobs. Only a successful, fully accounted complete snapshot may increment an unseen record's omission count; a published job enters `checking` on the first successful omission and closes only after a second successful omission at least 30 minutes later. An authoritative employer closure can be handled separately by a reviewed operator action.

These migrations and adapters must not be described as live until the production migration list, database tests, worker configuration, and a disabled-source production smoke have all been verified. See [Source permission outreach](SOURCE_PERMISSION_OUTREACH.md) before contacting a candidate employer.

## Currency reference data

Offer Compare can prefill a reviewed monthly accounting reference from the European Commission's InforEuro public API. It is not a live bank, card, remittance, payroll, or transfer quote.

| Provider                      | Endpoint and provenance                                                           | Licence basis                                                                              | Refresh                                  | Stored fields                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| European Commission InforEuro | Official monthly-rates API; exact source URL and data month stored with every set | Commission-owned content under the Commission legal notice/CC BY 4.0; attribution retained | Daily check at 02:25 UTC; monthly values | Provider key, observed month, retrieved timestamp, source URL, licence/attribution/terms-review record, and 42 cross-rates for EUR/NGN/GHS/KES/ZAR/USD/GBP |

The adapter treats the provider value as local currency units per EUR and computes `quote-per-EUR / base-per-EUR`. Tests cover direction, required-currency failure, and source-month selection. A user-entered rate always overrides the reference. If the worker exceeds its 36-hour stale threshold, the last set may remain visible only with its month/source disclosure; it must not be described as current market pricing.

## Location eligibility

Remote does not mean globally eligible. SalaryPadi keeps the source’s location statement as evidence and separates it from normalized eligibility.

- `Worldwide`, `Nigeria`, `Africa`, or an explicit country list containing Nigeria can be shown as Nigeria-eligible when the source provides that evidence.
- Broad regions such as `EMEA`, unclear custom text, or missing location evidence remain unclear; they must not be presented as confirmed Nigeria eligibility.
- Inferred fields are labelled as inferred and never upgraded to source-provided or manually verified provenance.
- A local Nigeria jobs route may be empty. Do not fill it with generic remote roles or demo listings.

## Data quality rules

For each normalized job, preserve:

- source name and external identifier;
- source URL and any permitted employer destination;
- source-provided location statement and normalized eligibility provenance;
- posted date and SalaryPadi’s last-check timestamp;
- salary currency, range, pay period, and gross/net classification only when evidenced;
- employment, engagement, work arrangement, and experience fields only when evidenced;
- a deterministic fingerprint for duplicate detection.

Unknown data stays unknown. Do not invent salary ranges, locations, benefits, company facts, ratings, or application outcomes.

## Source onboarding checklist

Before leaving ATS scheduled acquisition enabled:

1. Record the official homepage and terms URL.
2. Obtain written permission or a commercial contract that names the employer/tenant and SalaryPadi use case; public endpoint reachability is not permission.
3. Decide separately whether SalaryPadi may acquire jobs, store full descriptions, show public listings, index pages, emit `JobPosting`, and include jobs in email alerts. Default every permission to false.
4. Create a draft source and disabled private configuration while `ATS_SOURCE_SYNC_ENABLED=false`.
5. Record the complete intended policy: required attribution, canonical destination, allowed HTTPS host/path pairs, retention/purge, cadence of at least 15 minutes, minimum spacing, daily budget, timeout, backoff, and `Retry-After` behavior.
6. Enable the final private configuration while the source is still draft and the environment gate is false.
7. Validate recorded provider payloads, URL protocols, location evidence, salary units, empty snapshots, duplicate behavior, and contract drift without making a production provider request.
8. After the policy/configuration is final, record the named employer grantor, non-secret evidence reference, authorization reviewer/date/expiry/takedown contact, and separate terms version/hash/reviewer/date.
9. Activate the source in review mode while the environment gate remains false. If public display was not expressly granted, do not activate this ingestion path.
10. Temporarily enable the gate for one claimed review-only run, then restore it to false while reconciling provider/accepted/filtered counts, quarantines, destinations, database writes, and append-only evidence.
11. Test configuration drift, authorization expiry/revocation, company suspension, environment/source/configuration kill switches, two-complete-omission expiry, and takedown flows.
12. Have the named data-quality owner approve leaving scheduled acquisition enabled and record the decision. Automatic publication requires its own reviewed policy/configuration change and fresh authorization review.

The database boundary requires both current terms review and current authorization evidence, but that constraint is not a substitute for human approval. Policy or configuration changes made after authorization review pause/revoke the source, intentionally requiring review of the new final contract.

## Freshness and failure states

The public feed reports whether the source is live, disabled, or unavailable. A failed fetch returns an honest empty/unavailable state; it does not silently serve fabricated jobs. `/api/health` reports provider configuration and tracked worker freshness. The worker result is the live third-party evidence; a configuration flag by itself is not connectivity proof.

When a provider fails repeatedly:

1. Disable the source or set its database status to `paused`.
2. Keep an incident record with the last successful fetch, error class, and provider status.
3. Remove or expire listings whose validity can no longer be established.
4. Re-enable only after a successful validation run and terms check.
