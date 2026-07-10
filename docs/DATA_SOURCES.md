# Data sources and provenance

SalaryPadi does not treat a reachable feed as permission to republish it. Every job source must have an explicit policy record covering acquisition, storage, attribution, destination, indexing, refresh cadence, and structured-data use before it can be publicly enabled.

## Current source matrix

| Source                                                | Status                                                  | Public listing                                     | Storage                                                                                                                                   | Indexing                              | Required destination                 |
| ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Remotive public API                                   | Constrained production pilot; terms reviewed 2026-07-10 | Yes, while enabled                                 | Twelve-hour public cache, current description-free alert catalog, and import-run evidence; no durable full description or catalog history | No                                    | The Remotive URL returned by the API |
| Employer submissions                                  | Moderated intake                                        | Only after approval                                | Structured submission and audit history                                                                                                   | Only after approval and policy review | Validated HTTPS application URL      |
| Community salary, review, and interview contributions | Moderated intake                                        | Thresholded aggregate or redacted publication only | Private raw record plus approved public projection                                                                                        | Sparse/private states are not indexed | SalaryPadi detail page               |
| Direct licensed feeds                                 | Not configured                                          | No                                                 | No                                                                                                                                        | No                                    | Provider-specific agreement required |

No scraping adapter is enabled. Do not add one without written permission or a documented legal and policy review.

## Remotive pilot contract

The adapter policy is defined in `src/lib/jobs/source-policy.ts` and enforced by the server repository.

- Fetch only `https://remotive.com/api/remote-jobs` from a fixed server-side endpoint.
- Cache public responses for 43,200 seconds (twelve hours). The separate alert-catalog worker also runs twice daily, keeping their combined normal operation at no more than four reads per day.
- Validate the response shape and normalize it before rendering.
- Remove source HTML and render plain text. Never inject the source description as raw HTML.
- Display visible “Source: Remotive” attribution and link to the returned Remotive job URL.
- Do not persist a durable full-text archive of Remotive descriptions.
- Mark Remotive-backed listing and detail routes `noindex` and do not emit `JobPosting` structured data.
- Do not redistribute these listings to Google Jobs, LinkedIn, or another job platform.
- Disable the feed with `REMOTIVE_SOURCE_ENABLED=false` if terms, attribution requirements, or availability change.

Terms basis: the official [Remotive public API repository](https://github.com/remotive-com/remote-jobs-api), reviewed on 2026-07-10. A source owner must repeat and record the review before changing the policy or after a material provider change.

The interim source and terms owner is Oza at `sources@salarypadi.com`. The `job-source-sync` function validates the feed twice daily, records counts and a provider-safe error code, and replaces one site-scoped Netlify Blob used by alert delivery. That catalog contains normalized matching facts but explicitly removes descriptions, requirements, benefits, and risk text; it has no historical keys. Ten-minute alert delivery reads the catalog and does not call Remotive independently. The catalog does not replace the visible twelve-hour server cache used by public pages. Ordinary CI never calls the live provider.

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

Before setting `allow_public_listing=true` for a database-backed source:

1. Record the official homepage and terms URL.
2. Record who reviewed the terms, when, and which terms version applied.
3. Decide whether full descriptions may be stored, jobs may be indexed, and `JobPosting` schema may be emitted. Default every permission to false.
4. Record required attribution text and destination behavior.
5. Set a refresh interval of at least 15 minutes and a failure/backoff policy.
6. Define raw-record retention and implement a purge before retaining raw payloads.
7. Validate sample payloads, URL protocols, location evidence, salary units, and duplicate behavior.
8. Test source pause/disable, stale content, removal, and takedown flows.
9. Have a data-quality owner approve activation.

The database prevents public activation without a recorded terms-review timestamp, but that constraint is not a substitute for human approval.

## Freshness and failure states

The public feed reports whether the source is live, disabled, or unavailable. A failed fetch returns an honest empty/unavailable state; it does not silently serve fabricated jobs. `/api/health` reports provider configuration and tracked worker freshness. The worker result is the live third-party evidence; a configuration flag by itself is not connectivity proof.

When a provider fails repeatedly:

1. Disable the source or set its database status to `paused`.
2. Keep an incident record with the last successful fetch, error class, and provider status.
3. Remove or expire listings whose validity can no longer be established.
4. Re-enable only after a successful validation run and terms check.
