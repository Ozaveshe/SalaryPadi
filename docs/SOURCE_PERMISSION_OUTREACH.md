# Source permission outreach

This is the operating record and ready-to-send copy for source-permission conversations. It does not itself grant permission. Send only from `sources@salarypadi.com`, retain the full reply in the restricted operations mailbox, and put only a non-secret evidence reference in the database.

## Status and official routes

| Candidate             | Why it is being evaluated                       | Official contact route                                                                                                                                                                                                                                              | Permission status                  |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Remotive              | Clarify the constrained public API and alerts   | [`hello@remotive.com`](mailto:hello@remotive.com), listed on the official [API page](https://remotive.com/remote-jobs/api) and [terms](https://support.remotive.com/en/article/terms-of-service-u4kbkf/)                                                            | Not confirmed beyond current pilot |
| Moniepoint Greenhouse | First recommended employer-authorized ATS pilot | [`partner@moniepoint.com`](mailto:partner@moniepoint.com), published as the partnership route in an official [Moniepoint case study](https://casestudies.moniepoint.com/documents/moniepoint-women-owned-businesses.pdf); [careers](https://moniepoint.com/careers) | Not requested or received          |
| M-KOPA Ashby          | First recommended Ashby employer pilot          | [`info@m-kopa.com`](mailto:info@m-kopa.com), listed on the official [M-KOPA contact page](https://www.m-kopa.com/contact); public roles use the [M-KOPA Ashby board](https://jobs.ashbyhq.com/M-KOPA)                                                               | Not requested or received          |

If an address redirects the request, keep the original thread and follow the employer's named recruiting, legal, data, or partnership contact. Do not infer consent from a public ATS endpoint, careers link, automated acknowledgement, silence, or a request to “share jobs” that does not answer the uses below.

## Permission checklist

Ask the source owner to answer each item explicitly:

1. **Authority and scope:** Which legal entity and named employer/ATS tenant are covered, and is the responder authorized to grant the permission?
2. **Acquisition:** May SalaryPadi retrieve the employer's public ATS JSON endpoint without credentials? Record the exact provider, tenant, endpoint family, and allowed cadence.
3. **Fields:** Which job facts may be copied: title, location, department, employment/workplace type, dates, salary, description, and application URL?
4. **Storage:** May normalized records and full descriptions be stored? State cache duration, raw-payload retention, history, and deletion requirements separately.
5. **Public display:** May SalaryPadi show the permitted fields on public, unauthenticated SalaryPadi pages?
6. **Search:** May those pages be indexed by ordinary search engines?
7. **Structured data:** May SalaryPadi emit `JobPosting` JSON-LD or submit the jobs to a third-party job-search surface? A general public-display “yes” is not a yes to this item.
8. **Email:** May SalaryPadi include permitted job facts and SalaryPadi links in user-requested job alerts? A public-display “yes” is not a yes to email distribution.
9. **Attribution and destination:** What exact attribution is required, and must the primary link go to the employer careers page, the ATS job page, or another approved URL?
10. **Freshness and closure:** What is the acceptable refresh cadence, and is an empty feed authoritative? SalaryPadi's default expires a missing job only after two successful complete snapshots unless the employer supplies explicit closure evidence.
11. **Geography and audience:** Are any roles, locations, candidate groups, or jurisdictions excluded?
12. **Change and takedown:** Who receives correction/takedown requests, how quickly should SalaryPadi disable a source, and how will terms or endpoint changes be communicated?
13. **Term:** Is permission indefinite, time-limited, revocable on notice, or part of a commercial plan? Record the effective and expiry dates.

The safe default for any unanswered item is **no**. In particular, `may_store_full_description`, `may_index_jobs`, `may_emit_jobposting_schema`, and `may_email_jobs` remain false until each use is expressly granted.

## Internal record after a reply

Before activation, the source owner must record:

- sender/recipient, sent date, reply date, and the official contact route;
- the covered legal entity, employer, provider, and tenant;
- an immutable restricted-mailbox or document reference, not the correspondence itself;
- authorization basis (`written_permission` or `commercial_contract`), named employer grantor, reviewer, review date, expiry, and takedown contact;
- terms URL/version/hash and separate terms reviewer/date;
- every individual use permission and required attribution/destination;
- exact allowed destination host/path pairs, cadence, minimum spacing, and daily budget;
- the review-only dry-run, quarantine, database-test, approval, and kill-switch evidence.

## Draft: Remotive

**To:** `hello@remotive.com`<br>
**From:** `sources@salarypadi.com`<br>
**Subject:** Permission clarification for attributed Remotive jobs on SalaryPadi

Hello Remotive team,

SalaryPadi is an Africa-focused job and salary information product. We are using the public API only as a constrained pilot: low-frequency access, visible “Source: Remotive” attribution, direct Remotive links, no durable full-description archive, no search indexing or `JobPosting` markup, and no Remotive jobs in email alerts.

Could you confirm whether that public, unauthenticated display is permitted at up to four API requests per rolling 24 hours with a twelve-hour cache? We would also like to know whether your private API can license any of these separately: normalized description storage, search indexing/`JobPosting`, and user-requested email alerts.

Please specify the required attribution/link, retention or takedown rules, permitted fields, rate limit, and whether written permission has an expiry. We can share our exact implementation summary if useful.

Thank you,<br>
SalaryPadi source operations<br>
`sources@salarypadi.com`<br>
https://salarypadi.com

## Draft: Moniepoint

**To:** `partner@moniepoint.com`<br>
**From:** `sources@salarypadi.com`<br>
**Subject:** Request to pilot Moniepoint careers on SalaryPadi

Hello Moniepoint partnerships team,

SalaryPadi helps African professionals find clearer job, salary, and workplace information. We would like written permission for a small, employer-authorized pilot of Moniepoint's public Greenhouse careers feed.

The proposed pilot would use a fixed Moniepoint tenant only, fetch at an agreed low frequency, validate every destination, link applicants directly to the official Moniepoint/Greenhouse application page, and keep all new or changed jobs in review. The source can be disabled immediately and missing jobs are not expired until two complete successful snapshots omit them.

Could you confirm the permitted fields and whether SalaryPadi may separately: store normalized records or full descriptions, display jobs publicly, allow search indexing, emit `JobPosting` structured data, and include job facts in user-requested email alerts? Please also state required attribution, approved destination hosts, cadence, retention, takedown contact, and permission term.

We will not enable the source unless your authorized team confirms the scope in writing.

Thank you,<br>
SalaryPadi source operations<br>
`sources@salarypadi.com`<br>
https://salarypadi.com

## Draft: M-KOPA

**To:** `info@m-kopa.com`<br>
**From:** `sources@salarypadi.com`<br>
**Subject:** Request to pilot M-KOPA careers on SalaryPadi

Hello M-KOPA team,

SalaryPadi helps African professionals find clearer job, salary, and workplace information. We would like written permission for a small, employer-authorized pilot of M-KOPA's public Ashby careers feed.

The proposed pilot would use the fixed M-KOPA Ashby tenant only, fetch at an agreed low frequency, validate every destination, link applicants directly to the official M-KOPA/Ashby application page, and keep all new or changed jobs in review. The source can be disabled immediately and missing jobs are not expired until two complete successful snapshots omit them.

Could you confirm the permitted fields and whether SalaryPadi may separately: store normalized records or full descriptions, display jobs publicly, allow search indexing, emit `JobPosting` structured data, and include job facts in user-requested email alerts? Please also state required attribution, approved destination hosts, cadence, retention, takedown contact, and permission term.

We will not enable the source unless your authorized team confirms the scope in writing.

Thank you,<br>
SalaryPadi source operations<br>
`sources@salarypadi.com`<br>
https://salarypadi.com

## Sending and follow-up

1. Send one source per thread from `sources@salarypadi.com`; do not combine employers.
2. Set a follow-up for seven business days. One concise follow-up is enough; silence is not consent.
3. If the responder asks for a call, send the checklist beforehand and request written confirmation afterward.
4. If permission is partial, record only the granted uses and keep every other permission false.
5. If permission is refused, ambiguous, expired, or withdrawn, keep the source disabled and retain the safe decision record.
6. Do not attach raw database exports, provider payloads, secrets, user data, or unpublished implementation details.
