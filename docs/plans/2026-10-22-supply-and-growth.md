# SalaryPadi supply and growth review — 22 October 2026

## Decision
Keep one promise: find remote work you can actually apply for from your African country. Keep Companies, Pay, Offers and My Career working as supporting tools.

Remove internal source-review deadlines as ingestion/publication cutoffs. A review reminder is not the provider's licence expiry. Remove the provider-name blacklist so a future valid integration can be configured. Preserve explicit disablement, real authorization expiry/revocation, provider credentials/rate limits, attribution, eligibility, duplicate prevention, closed-job removal and user-data access controls.

## Current evidence
Production was serving commit 8a9240a during this review. Health returned HTTP 200 and all 28 workers healthy, but skipped workers do not establish useful job supply.
The live database snapshot contained 204 public jobs, including 65 remote jobs. Canonical and RemoteRecruitment supplied 37 of those 65 remote jobs. Counts change as workers run.
71 employer ATS sources were active; 53 were paused. Those pauses have not all been diagnosed and must not be represented as missing employer permission.
Jobicy and Himalayas were paused with internal review deadlines of 13 September. ReliefWeb was also paused with an internal review deadline of 26 August.
The reported capacity of 35 is a calculated supply estimate, not a hard publication cap.
Candidate profiles, saved jobs, applications, enabled alerts and employer submissions each had zero records at inspection. The consented analytics table had no recent counts. This does not establish zero visitors.

## Free supply first
Himalayas explicitly allows displaying its API jobs on our own website without individual permission. Preserve its applicationLink, visible attribution, expiry removal and restriction on onward syndication/Google JobPosting.
Jobicy's public API needs no key and supports cursor pagination. Its optional paid direct ATS links are unnecessary for a free launch.
Current integrations still use a Nigeria-heavy fixed Himalayas query set and Jobicy's older endpoint. Removing the review cutoff is the first repair; it does not by itself expand coverage or prove ingestion success.

Sources checked:
- https://himalayas.app/api
- https://himalayas.app/terms
- https://jobicy.com/jobs-rss-feed

## Implementation sequence
1. Remove review-date hard stops in application policy, employer-feed runtime, database eligibility, public source visibility and cached publication horizons. Keep overdue reminders. Restore the two verified free feeds after validation.
2. Upgrade feed adapters to current cursor pagination with persisted continuation, retries/backoff and completion metrics. Replace Nigeria-only discovery assumptions with African-country coverage plus worldwide jobs. Report unique eligible jobs added per source; raw fetch totals count duplicates.
3. Diagnose paused ATS boards individually: dead tenant, no relevant jobs, configuration failure, deliberate pause or provider restriction. Re-enable viable boards and add verified employer feeds. Do not buy an aggregator until its incremental eligible coverage is measured.
4. Improve the mobile search journey: country and role first, useful results immediately, clear eligibility reason, salary currency/period when supplied, checked time and a prominent Apply action. Empty searches should offer broader relevant filters and saved-search alerts.
5. Make retention measurable: search → eligible job view → source application click → saved search → returning job seeker. An outbound click is not a completed application. Keep alerts opt-in and send only meaningful new matches.
6. Grow through useful country/role pages, shareable job links and employer submissions. Validate a first cohort of African remote job seekers before trying to serve every African use case.

## Proposed next 30 days
Week 1: restore reliable free supply; measure fetch/parse/eligible/deduplicated/published counts and freshness separately.
Week 2: improve search, eligibility explanations and empty results; test Nigeria, Kenya, Ghana and South Africa without restricting the product to those countries.
Week 3: test opt-in alerts and the saved-job/application workflow with real participants; use interviews to explain drop-off.
Week 4: expand sources and distribution only where repeat usage and relevant application clicks improve.

Do not promise a job-count target before measuring real source yield. Judge progress by weekly returning job seekers who find eligible roles, source-link validity, coverage by country/role, and cost per unique useful job.

