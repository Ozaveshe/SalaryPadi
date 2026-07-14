# SalaryPadi SEO and content operations

Last audited: 14 July 2026

Production host: `https://salarypadi.com`

Deployment status: local implementation only; no migration, deployment, publication, or URL submission was performed.

## Outcome

SalaryPadi now has a fail-closed SEO boundary driven by canonical product data and source rights. A URL can render for users while remaining absent from search: rendering, freshness, source authorization, indexability, `JobPosting` eligibility, sitemap inclusion, and Google Indexing API notification are separate decisions.

The system does not generate role/location pages from arbitrary path segments. It has an explicit landing-page registry and exact database gates. The twelve cornerstone articles are source files with `status: draft` and `humanApprovalRequired: true`; none is public or queued for automatic publication.

## Production evidence before this change

The public checks below were repeated on 14 July 2026. They describe the deployed site, not this unshipped working tree.

| Surface                   | Evidence                                | Production finding                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rendered HTML             | Direct GET with redirects followed      | `/`, `/jobs`, `/jobs/remote`, `/companies`, `/salaries`, and `/insights` returned 200 HTML. The response bodies included server-rendered headings, metadata, job/company text, and links.                                |
| Error response            | Direct GET                              | An invented route returned a real 404.                                                                                                                                                                                   |
| Robots                    | `/robots.txt`                           | Public product and editorial paths were crawlable; private, account, admin, and API paths were disallowed. Two sitemap URLs were advertised. No site-wide `noindex` or `Disallow: /` was present.                        |
| Canonicals                | Rendered head                           | Sampled pages had one self-referential canonical. Filtered/paginated job URLs canonicalized to `/jobs` and were `noindex,follow`.                                                                                        |
| Metadata                  | Rendered head                           | Titles and descriptions existed. Open Graph metadata existed on sampled leaf pages.                                                                                                                                      |
| Product indexability      | Rendered robots metadata                | `/jobs`, `/jobs/remote`, `/jobs/nigeria`, `/companies`, `/salaries`, the sampled Remotive job, and its thin company page were `noindex,follow`.                                                                          |
| Structured data           | Parsed JSON-LD                          | The sampled Remotive job emitted Organization and BreadcrumbList, but no JobPosting. That is correct for its source policy. The evergreen guide and data brief emitted Article.                                          |
| Sitemap                   | `/sitemap.xml`                          | The deployed sitemap was one URL set with 9 URLs: home, five policy pages, one guide, the insights hub, and one insight. It contained no job, company, salary, or tool URL.                                              |
| Pagination and duplicates | `/jobs?sort=newest&page=2`              | The page rendered, remained `noindex,follow`, and canonicalized to `/jobs`. Filters therefore did not create indexable duplicates.                                                                                       |
| Expired jobs              | Code and rendered policy                | A missing job is 404. A retained closed/expired record is `noindex,follow` and has no JobPosting. The lifecycle worker supplies prompt closure; the new outbox queues URL_DELETED only for previously eligible job URLs. |
| RSS                       | `/feed.xml`                             | Returned 200 `application/rss+xml`; it contains published editorial entries, not imported job descriptions.                                                                                                              |
| Internal links            | Rendered navigation and cards           | Public hubs link to product areas. The new landing pages add a fixed set of related canonical routes.                                                                                                                    |
| Indexation signal         | Exact-brand and `site:` public searches | Exact `"SalaryPadi"`, `site:salarypadi.com`, and `site:salarypadi.com SalaryPadi` returned no SalaryPadi pages on both 13 and 14 July 2026. Search Console coverage is unknown because credentials are unavailable.      |

### Why the searches returned no pages

There is no evidence of a robots or status-code blockade. The evidence-supported causes are:

1. only nine URLs were disclosed in the deployed sitemap;
2. every sampled product hub and product leaf was deliberately `noindex`;
3. production had no source-authorized canonical jobs in `app.jobs`, no publishable salary cohort, and only thin company profiles, so the existing gates had nothing legitimate to expose;
4. the visible supplemental Remotive records could render but their policy prohibited search indexing and JobPosting markup; and
5. the domain was new enough that public search discovery was not assured.

Public search results are a useful external signal, not proof of Google coverage. Only a verified Search Console property can distinguish discovered, crawled, excluded, and indexed URLs. That remains an explicit unknown.

## URL inventory: before and after

| Group                 | Deployed before                                     | Local implementation after                                                                                                  |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Sitemap entry point   | `/sitemap.xml` was a 9-URL `urlset`                 | `/sitemap.xml` is a six-part `sitemapindex`                                                                                 |
| Jobs                  | No sitemap inventory                                | `/sitemaps/jobs.xml`; eligible job details plus only gate-passing allowlisted landing pages                                 |
| Companies             | No sitemap inventory                                | `/sitemaps/companies.xml`; only an authorized active job or published cited employer evidence can qualify a company leaf    |
| Salaries              | No sitemap inventory                                | `/sitemaps/salaries.xml`; only privacy-cohort-backed aggregates qualify                                                     |
| Tools                 | Separate legacy endpoint, not in the main inventory | `/sitemaps/tools.xml` with the tools hub and four native public tools; legacy `/tools/sitemap.xml` redirects permanently    |
| Guides                | Mixed into the flat sitemap                         | `/sitemaps/guides.xml`; public policy pages and approved/published cornerstone guides                                       |
| Insights              | Mixed into the flat sitemap                         | `/sitemaps/insights.xml`; published deterministic data briefs only                                                          |
| Job landings          | `/jobs/remote` and `/jobs/nigeria`, both noindex    | Eight fixed routes; every route independently evaluates the exact threshold contract and otherwise remains `noindex,follow` |
| Generated route space | None                                                | None. Unknown role/city variants are ordinary 404s.                                                                         |

Every child sitemap emits only canonical absolute URLs. `lastmod` uses the newest relevant product verification, publication, calculation, evidence, or source-controlled static-content timestamp; it is never the request time.

## Indexability contracts

### Job details

A job detail can be indexed only when all of these are true:

- the source policy permits public search indexing;
- the canonical job is open;
- `validThrough` is absent or in the future; and
- the job exists as a canonical record rather than a source-only fixture.

JobPosting and Google Indexing API eligibility add a stricter source-policy permission. Remotive and Jobicy therefore cannot enter those paths when policy forbids it. The detailed job page is the only route that can emit JobPosting; cards, directories, companies, guides, and landing pages do not.

### Role and location landings

The route must be one of the eight registered landing keys and must satisfy every condition:

- at least 20 active, distinct canonical jobs;
- at least 30 distinct canonical jobs first seen in the previous 90 days;
- at least three companies;
- a manually reviewed stable-demand signal;
- a deterministic summary of at least 180 characters; and
- at least two useful internal links.

Metrics are calculated by the database RPC from canonical jobs and policy-authorized occurrences. A missing migration, unavailable database, invalid payload, or unset demand signal produces zero metrics and `noindex,follow`. Supplemental jobs may remain visible on a noindex user page, but they never make the page indexable.

### Company and salary pages

Company pages qualify only with an indexable active job or public cited company evidence. Salary pages require a repository-ready privacy cohort and retain country, role, period, sample size, date range, and confidence. A repository failure cannot turn into an indexable empty page.

## Structured data contract

The global layout emits Organization metadata. Leaf pages own BreadcrumbList. Editorial leaves emit Article. A qualifying detailed job emits one JobPosting with source-preserved values for `datePosted`, `validThrough`, applicant locations, remote location type, base salary value/unit/currency, and hiring organization.

The structured-data tests prove three negative cases: unauthorized source, closed job, and expired deadline. Each produces no JobPosting. This prevents configuration accidents from producing markup that the source policy does not allow.

For a closed eligible job, the database outbox creates `URL_DELETED`; the public URL must already be 404/410 or stripped of JobPosting/noindexed before the worker sends the notification. A retained history page is allowed only in that stripped state.

## Google integration boundary

Both integrations default to disabled:

```text
GOOGLE_SEARCH_CONSOLE_ENABLED=false
GOOGLE_INDEXING_ENABLED=false
GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:salarypadi.com
GOOGLE_SEARCH_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SEARCH_SERVICE_ACCOUNT_PRIVATE_KEY=
```

No credential is printed or stored in the repository. Search Console uses the read-only scope, an exact SalaryPadi property allowlist, a 28-day final-data window, a three-impression privacy floor, and rejection of email/phone-like query strings. The Indexing worker claims a service-role-only outbox in bounded batches and sends one eligible canonical job URL at a time. It records success or a non-secret error code and retries with a capped attempt count.

Setup after explicit approval:

1. Create a dedicated Google Cloud project and service account.
2. Enable the Search Console API and Indexing API.
3. Verify the exact SalaryPadi property in Search Console and grant the service account access to that property.
4. Store the service-account email and private key in the hosting provider's encrypted environment variables.
5. Keep both feature flags false while running the unit, migration, staging crawl, and source-policy checks.
6. Confirm the Indexing API quota and use it only for eligible JobPosting URLs.
7. Obtain explicit deployment and submission approval, then enable one integration at a time and watch the run ledger/outbox.

Google documents that the Indexing API is limited to eligible job and livestream pages, and uses `URL_UPDATED` and `URL_DELETED`. It also requires a deleted URL to return 404/410 or carry `noindex` before the delete notification:

- <https://developers.google.com/search/apis/indexing-api/v3/using-api>
- <https://developers.google.com/search/apis/indexing-api/v3/quickstart>

## Editorial workflow

The workflow is:

```text
product snapshot + approved aggregate site-search signals + Search Console
  -> topic candidate
  -> evidence pack
  -> at most one draft
  -> claim, duplication, PII, copyright and link checks
  -> human approval when required
  -> scheduled publication
  -> six-hour dynamic-block refresh
  -> update or archive
```

Evidence packs contain the selected snapshot, bounded aggregate signals, healthy source records, and claim constraints. They cannot contain private search text, contributions, or personal identifiers. Site-search query capture is intentionally not added: the current first-party analytics system stores aggregate event/route counts only. A future site-search signal must be consented, aggregated, privacy-reviewed, and inserted through the service-role signal boundary.

Preflight blocks:

- email, phone-like, secret, or private-key text;
- missing evidence pack;
- unverified claims;
- tax, salary, legal, employer, or workplace claims without approval;
- missing, unhealthy, or stale sources;
- duplicate or highly similar articles;
- long quoted passages and copyright-risk markers;
- deterministic briefs below the useful-content minimum; and
- stale/missing data snapshots.

Only a deterministic data brief with a fresh reproducible snapshot, passed checks, no unverified claim, and no human-review claim may publish without a human approval flag. Cornerstone content always requires approval.

### WAT schedule

Netlify cron is UTC; the configured equivalents below are West Africa Time (UTC+1).

| WAT                        | UTC cron             | Task                                                                   |
| -------------------------- | -------------------- | ---------------------------------------------------------------------- |
| 05:00 daily                | `0 4 * * *`          | Data snapshot                                                          |
| 05:15 daily                | `15 4 * * *`         | Topic candidates and optional Search Console signals                   |
| 05:30 daily                | `30 4 * * *`         | Evidence pack                                                          |
| 06:00 daily                | `0 5 * * *`          | At most one draft                                                      |
| 06:30 daily                | `30 5 * * *`         | Preflight                                                              |
| 07:00 daily                | `0 6 * * *`          | Editorial queue                                                        |
| 09:00 daily                | `0 8 * * *`          | Approved or strictly deterministic publication only                    |
| 06:00, 12:00, 18:00, 00:00 | `0 5,11,17,23 * * *` | Dynamic job-block refresh                                              |
| 01:30 daily                | `30 0 * * *`         | Links, stale claims, and orphan audit                                  |
| 02:00 Monday               | `0 1 * * 1`          | Cannibalization, thin-page, and indexation audit                       |
| 03:00 first day monthly    | `0 2 1 * *`          | Legal, tax, salary, employer, source-policy, and methodology freshness |
| Every 15 minutes           | `*/15 * * * *`       | Eligible Google job outbox, disabled by default                        |

Configured cron is not execution proof. Production run-ledger rows must show each task's last successful run before operations calls it healthy.

## Cornerstone drafts

The private source registry contains these unpublished drafts:

1. remote-job eligibility for Nigerians;
2. job-scam warning signs;
3. take-home pay;
4. offer comparison;
5. salary negotiation;
6. graduate and NYSC jobs;
7. HND versus BSc requirements;
8. contractor versus employee;
9. visa sponsorship;
10. interview preparation;
11. company-intelligence methodology; and
12. job-freshness methodology.

Every draft has evidence requirements, internal links, explicit review markers, and no published route. The registry is validated for unique slugs, minimum useful length, and mandatory human approval.

## Performance and Core Web Vitals

Google PageSpeed Insights could not be used because the public API quota was exhausted. Local Lighthouse 13.0.1 mobile lab runs against the deployed production pages succeeded on 14 July 2026:

| Page                | Performance | Accessibility | Best practices | SEO |      FCP |      LCP |    TBT |   CLS |
| ------------------- | ----------: | ------------: | -------------: | --: | -------: | -------: | -----: | ----: |
| Sample job leaf     |          80 |           100 |            100 |  91 |   999 ms | 1,749 ms | 207 ms | 0.332 |
| Sample company leaf |          80 |           100 |            100 |  91 | 1,216 ms | 2,008 ms | 172 ms | 0.332 |

These are lab results, not Chrome UX Report field Core Web Vitals. No field dataset was available. LCP was within the usual good lab threshold, but CLS was poor; Lighthouse attributed the measured shift to the footer moving after late content expansion. That is a measured performance blocker and should be profiled in a production-like build before claiming a 90+ performance score. The SEO score was also limited by the intentionally noindexed sampled product leaves.

## Operations and rollback

- No migration or environment change is applied automatically.
- Do not enable a landing's stable-demand flag without reviewed demand evidence.
- Do not enable Google integrations until source policy, rendered robots/schema, quotas, and ownership are confirmed.
- To stop submissions immediately, set `GOOGLE_INDEXING_ENABLED=false`; queued rows remain private and auditable.
- To stop editorial automation, set `EDITORIAL_AUTOMATION_ENABLED=false`; existing drafts and evidence remain private.
- If sitemap data fails, the system emits only entries it can prove; it does not substitute fixtures.

Machine-readable evidence is in `reports/seo-content-audit.json`, structured-data checks in `reports/structured-data-validation.json`, and route fixtures in `tests/fixtures/crawl/seo-routes.json`.
