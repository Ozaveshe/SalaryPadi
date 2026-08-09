# SalaryPadi route map

Every consumer route, the surface it belongs to, and what the user does there.
Surface assignment is executable, not documentary: `surfaceForPath()` in
[`src/lib/product/surfaces.ts`](../src/lib/product/surfaces.ts) resolves these
prefixes and is covered by `surfaces.test.ts`.

**No routes were deleted or redirected in this change.** The navigation was
consolidated from six header entries to four surfaces; every destination that
left the header remains at its original URL with its original indexing
status (the `SurfaceLinks` listing currently renders on the salaries landing
page; the other landings link their destinations through their own content). This is deliberate — the
search-visible routes (`/jobs/*` landing pages, `/salaries/[country]/[role]`,
`/companies/[slug]`) carry accumulated SEO value that a reshuffle would put at
risk for no user benefit.

## Before and after: header navigation

| Before (6 entries)       | After (4 surfaces)           | Where it lives now                         |
| ------------------------ | ---------------------------- | ------------------------------------------ |
| Jobs                     | **Jobs**                     | unchanged                                  |
| Companies                | **Companies**                | unchanged                                  |
| Salaries                 | **Pay & Offers**             | surface entry route `/salaries`            |
| Tools                    | _(folded in)_                | Pay & Offers landing + `/tools` still live |
| Insights _(flagged)_     | _(folded in)_                | Companies surface links                    |
| Contribute               | _(folded in)_                | My Career surface links                    |
| "My career" → `/account` | **My Career** → `/dashboard` | account link renamed to "Account"          |

The old `My career` account link and a new `My Career` surface would have been
two labels for different things, so the account link is now `Account`.

## Jobs surface

| Route                                   | Primary user action            | Data source             | Indexed                       |
| --------------------------------------- | ------------------------------ | ----------------------- | ----------------------------- |
| `/jobs`                                 | Search and filter roles        | `api.jobs` + live feeds | No — filter combinations are deliberately noindex; the landing pages below are the indexable entries |
| `/jobs/[slug]`                          | Read evidence, apply           | `api.jobs`              | Yes, when description is real |
| `/jobs/nigeria`                         | Browse Nigeria-local roles     | `api.jobs`              | Yes                           |
| `/jobs/remote`                          | Browse remote Nigeria-eligible | `api.jobs`              | Yes                           |
| `/jobs/graduate`                        | Entry-level roles              | `api.jobs`              | Yes                           |
| `/jobs/visa-sponsorship`                | Sponsorship-stated roles       | `api.jobs`              | Yes                           |
| `/jobs/ngo`                             | Development-sector roles       | `api.jobs`              | Yes                           |
| `/jobs/software`                        | Software roles                 | `api.jobs`              | Yes                           |
| `/jobs/cities/lagos`                    | Lagos roles                    | `api.jobs`              | Yes                           |
| `/jobs/roles/software-engineering`      | Role-family landing            | `api.jobs`              | Yes                           |
| `/matches`                              | Personalised matches           | profile + `api.jobs`    | No (personal)                 |
| `/guides/remote-jobs-open-to-nigerians` | Editorial guidance             | editorial               | Yes                           |

## Companies surface

| Route                            | Primary user action       | Data source             | Indexed |
| -------------------------------- | ------------------------- | ----------------------- | ------- |
| `/companies`                     | Search employers          | `api.companies`         | Yes     |
| `/companies/[slug]`              | Inspect employer evidence | `api.companies`         | Yes     |
| `/companies/[slug]/jobs`         | Employer's open roles     | `api.jobs`              | No — noindex, follow |
| `/companies/[slug]/salaries`     | Employer pay evidence     | `api.salary_aggregates` | No — noindex, follow |
| `/companies/[slug]/interviews`   | Interview reports         | community               | No — noindex, follow |
| `/companies/[slug]/reviews`      | Employer reviews          | community               | No — noindex, follow |
| `/companies/[slug]/benefits`     | Benefits evidence         | community               | No — noindex, follow |
| `/companies/[slug]/claim`        | Claim a profile           | employer flow           | No      |
| `/companies/[slug]/respond`      | Employer response         | employer flow           | No      |
| `/company-intelligence/requests` | Request coverage          | internal queue          | No      |
| `/insights`, `/insights/[slug]`  | Market context            | editorial               | Flagged |

## Pay & Offers surface

| Route                        | Primary user action     | Data source             | Indexed              |
| ---------------------------- | ----------------------- | ----------------------- | -------------------- |
| `/salaries`                  | Explore pay by role     | `api.salary_aggregates` | Yes                  |
| `/salaries/[country]/[role]` | Role pay in a market    | `api.salary_aggregates` | Yes, above threshold |
| `/tools`                     | Tool directory          | static                  | Yes                  |
| `/tools/take-home-pay`       | Gross↔net PAYE          | AfroTools API           | Yes                  |
| `/tools/offer-compare`       | Compare two offers      | deterministic + FX      | Yes                  |
| `/tools/salary-converter`    | Currency/period convert | AfroTools FX            | Yes                  |
| `/tools/job-scam-checker`    | Screen a vacancy        | local rules             | Yes                  |

All four tools accept job context (`?from=…`) and prefill from it.

## My Career surface

| Route                                    | Primary user action | Account  | Indexed   |
| ---------------------------------------- | ------------------- | -------- | --------- |
| `/dashboard`                             | Career overview     | Required | No        |
| `/saved`                                 | Saved jobs          | Required | No        |
| `/applications`                          | Track applications  | Required | No        |
| `/alerts`                                | Manage alerts       | Required | No        |
| `/notifications`                         | Notifications       | Required | No        |
| `/account`, `/account/candidate-profile` | Profile and privacy | Required | No        |
| `/privacy/requests`                      | Data requests       | Required | No        |
| `/contribute` and `/contribute/*`        | Contribute evidence | Optional | Yes (hub) |

## Outside the four surfaces

Deliberately unclaimed by `surfaceForPath()` — these are marketing, policy,
employer and operations routes, not steps in the job seeker's journey.

| Route                                         | Purpose                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `/`                                           | Homepage                                                |
| `/about`, `/methodology`, `/trust-and-safety` | Trust and explanation                                   |
| `/privacy`, `/terms`                          | Policy                                                  |
| `/for-employers`, `/post-a-job`               | Employer acquisition                                    |
| `/blog`, `/forums`, `/forums/[id]`            | Community and content                                   |
| `/feed`, `/feed.xml`, `/sitemap.xml`          | Syndication                                             |
| `/auth/sign-in`, `/auth/mfa-required`         | Authentication                                          |
| `/admin/*` (14 routes)                        | Operations — engineering vocabulary permitted here only |

## Redirect policy

If a route is ever retired, it must gain a `permanent: true` redirect to its
closest surviving equivalent, and its canonical must be updated in the same
change. Search-visible job, salary and company routes may not be moved without
a redirect: the accumulated indexing is a product asset.
