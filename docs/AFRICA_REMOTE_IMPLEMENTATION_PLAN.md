# Africa remote implementation and next steps

Set: 2026-10-03
Status: AR-01 through AR-04 implemented; release verification and deployment in progress
Working branch: `codex/africa-remote-focus`
Previous implementation: `f3bbcf2` (local; not deployed)

## Product promise

**Find remote jobs you can apply for from your African country.**

The applicant's country of residence determines location eligibility. Nationality, employer headquarters, workplace location and hiring-country eligibility are separate facts. Eligibility is evidence that someone may apply, never a guarantee of hiring.

Remote discovery is the lead experience. Jobs, companies, salary evidence, offer tools, applications, contributions and alerts continue to support the complete journey. Nigeria-specific tax calculations remain labelled for Nigeria.

## First delivery: country selection through search and alerts

A visitor chooses “I live in Kenya” on the homepage. Search returns current remote roles supported by the source for Kenya, including qualifying Africa-wide and worldwide roles. A job restricted to Ghana does not appear as a Kenya match. Regional wording that cannot establish country eligibility stays in a separately labelled “Needs confirmation” view, available by an explicit choice.

The visitor sees the same country decision on the card, preview and detail page. They can save the search as an alert, and the delivery worker uses the same rule. A signed-in candidate can choose to save this country to their profile; a public search never silently overwrites a private profile.

Country selection, shared evidence rules, profile recommendations and compatible alerts are implemented on this branch. Supply expansion follows the dated [country coverage audit](AFRICA_REMOTE_COUNTRY_COVERAGE_2026-10-03.md).

## Delivery order

| Order | Work                                          | Completion evidence                                                        |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | AR-01: shared country eligibility             | One tested decision used by discovery, recommendations and alerts          |
| 2     | AR-02: country-aware discovery                | Mobile homepage-to-detail journey preserves the selected country           |
| 3     | AR-03: country-aware alerts                   | Existing alerts still decode; new alerts respect inclusions and exclusions |
| 4     | AR-04: profile and recommendation consistency | Search and match explanations agree for the same applicant country         |
| 5     | AR-05: coverage and reliability               | Remote-only counts, country coverage and tested product flows              |
| 6     | AR-06: approved supply expansion              | New sources have rights, freshness and real publication evidence           |
| 7     | AR-07: multi-country pilot                    | Real users complete the journey; feedback and outcomes recorded            |
| 8     | AR-08: release and follow-through             | Exact deployed commit and relevant live journeys verified                  |

AR-01 is the dependency for AR-02 through AR-05. AR-02 through AR-04 form the first coherent release. AR-05's counting correction and checks should be included in that release where practical. Source registration is an independent delivery with its own evidence.

## Planning sequence

- First implementation cycle: AR-01 through AR-04. Deliver shared country rules, the selector, alert compatibility and recommendation consistency together.
- Before release: AR-05 counting corrections and relevant product-flow verification, followed by AR-08 release checks.
- Following cycles: AR-06 source expansion and AR-07 applicant validation, using the coverage report to choose country and role priorities.

This sequence defines work order. Calendar commitments follow confirmation of the first implementation's actual database and source dependencies; the dated supply snapshot is not a delivery forecast.

## AR-01: one country eligibility decision

Normalize applicant and source country references to ISO alpha-2 codes at the domain boundary. Keep human-readable names in the UI and preserve original source wording. Existing job eligibility lists contain names while candidate profiles use codes; `src/lib/match/adapt.ts` currently passes those lists to code comparisons in `src/lib/match/score.ts`. Add shipped-path regression coverage for this mismatch.

Implement a decision returning `eligible`, `not_eligible` or `unclear`, with a human explanation and evidence basis. Keep application-location eligibility separate from skill fit, visa requirements and time-zone compatibility.

Decision precedence:

| Source evidence                                                   | Decision for a selected country                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Country explicitly excluded                                       | Not eligible; overrides named, Africa-wide or worldwide inclusion                       |
| Closed list of named countries                                    | Eligible if included; not eligible if absent; an illustrative list is not a closed list |
| Nigeria-only role                                                 | Eligible for NG; not eligible for other countries                                       |
| Explicit Africa-wide hiring                                       | Eligible for an African country unless excluded or narrowed by stronger conditions      |
| Reviewed worldwide hiring                                         | Eligible unless excluded or narrowed by stronger conditions                             |
| EMEA or another region without sufficient hiring-country evidence | Unclear until the source-specific policy or employer confirms the country               |
| Generic remote, online or work-from-home wording                  | Unclear                                                                                 |
| Missing, stale, contradictory or unparseable evidence             | Unclear; never manufacture an inclusion                                                 |

A known unmet work-authorization requirement must not become a confirmed match through broad region wording. Where applicant authorization is unknown, show that separate requirement and avoid implying full eligibility has been established.

Acceptance: prove country-name/code normalization, excluded-country precedence, Africa-wide and worldwide scope, restricted regional scope, contradictory evidence and Nigeria-specific backward compatibility.

## AR-02: country selection and the complete discovery path

Add `applicantCountry` to the search contract with canonical uppercase codes from the existing African country registry. Support every country represented by that registry as a search choice; a choice does not activate local tax, salary or country landing-page coverage.

- Homepage and job search ask “Which country do you live in?”; include an explicit “Browse across Africa” choice.
- Preserve the selected country through URL serialization, pagination, sorting, cards, quick view, detail navigation and return-to-search links.
- For a selected country, the default result set contains country-supported remote jobs. Unclear results require a deliberate separate choice and carry visible uncertainty.
- Before a country is selected, the continent view remains useful but labels its count as opportunities open somewhere in Africa.
- Empty results say no current supported matches were found for that selection, with options to change filters, view uncertain opportunities or create an alert. A failed source read retains its unavailable/partial state.
- Country exclusions are visible before applying. Generic “remote” is never upgraded into country evidence.
- Original salary currency stays visible. Country selection does not select a tax system or invent take-home estimates.

Acceptance: Nigeria, Kenya, Ghana and South Africa fixtures exercise different inclusions/exclusions; a country with no current coverage gets an honest empty state. Mobile at 360px and desktop support keyboard selection and have no horizontal overflow. The explicit newest/salary sort choices remain honoured.

Primary touchpoints: `src/app/page.tsx`, `src/components/jobs/job-search-form.tsx`, `src/lib/jobs/search.ts`, `src/components/jobs/jobs-experience.tsx`, job cards/previews, job-detail route and public eligibility statements.

## AR-03: alerts that honour the same selection

Persist `applicantCountry` in saved alert search JSON and use AR-01 in `netlify/functions/_shared/job-alert-delivery.ts`.

- Existing schema-v1 searches without the new field retain their prior meaning; do not silently migrate a continent alert into a Nigeria alert.
- Decide compatibility before writing a new schema version. An additive optional field may fit the existing contract; verify database validation and worker decoding rather than assuming a database migration is required.
- New country alerts send supported matches only. If unclear browsing is selected, exclude unclear roles from automatic country alerts and explain that boundary when creating the alert.
- Retain source email-distribution permission, freshness, last-sent cutoffs and delivery deduplication.
- Include the alert's applicant country and source eligibility basis in the email. Links open the corresponding role with the country context preserved.
- Editing a country changes future matching; it must not resend historical jobs merely because the preference changed.

Acceptance: test old and new search payloads; compare discovery and alert matching on the same jobs; exclusions win; sources without email rights never send; duplicate prevention and enable/disable/delete behaviour still work. Use an authorized controlled test recipient for live email verification; no email is authorized by this planning document.

## AR-04: profiles, recommendations and application continuity

Reuse the candidate profile's existing `location_country` where appropriate. Make an explicit search selection override the profile for that search, and explain the effective country. Save a profile preference only through the user's existing profile-edit action.

Update match facts and ranking to use normalized country evidence. A Nigeria exclusion must not downgrade a Kenya applicant. Unknown country eligibility must not earn a confirmed match badge or enter confirmed recommendations. Preserve skill, experience, work arrangement and compensation dimensions and explain their missing evidence.

Carry country context into job details, save/apply intent through sign-in and application records where needed. Review public-query and private-record boundaries; do not put private profile or offer details into public URLs.

Acceptance: same source + same applicant country gives consistent location conclusions in search, badges, detail guidance, recommendations and alerts. Signed-out users can browse; sign-in preserves the intended job action. Existing profile and application records remain compatible.

## AR-05: coverage and all-product reliability

Refresh the recorded 2026-10-03 supply baseline before execution. It found 265 public database jobs, including 98 explicitly remote roles, and is a dated database snapshot rather than a live browser inventory guarantee.

Correct the health response's `visible_remote_jobs` semantics: it currently labels the full 265-row catalogue as remote. Inspect all consumers and version or migrate the response contract if necessary. Report total catalogue, explicitly remote, currently publishable and applicant-country-supported counts separately; preserve uncertain work arrangements as uncertain.

Produce a dated internal country coverage table with supported jobs, unclear jobs, employers, permitted sources, posting age, verification age, broken apply destinations and source concentration. Calculate each country's coverage using AR-01, including exclusions. Report intersections and double counting clearly; never sum country totals into a unique continent inventory count.

Verify existing jobs, company pages, salary evidence, all tools, sign-in/save, application tracking and alert management. Record unavailable evidence rather than claiming success from skipped tests. Check the editorial worker's recorded `supabase_rpc_409` failure and identify its present cause before changing it. An editorial defect must be reported separately from remote-job supply health.

Acceptance: counting tests distinguish onsite, hybrid, unspecified and remote records. A capability report states each flow as verified, degraded, disabled or unverified with observed evidence and a next action. Fix defects found in the touched journey before release; log unrelated work separately.

## AR-06: expand supply from measured gaps

Choose initial acquisition targets using the coverage table. The pilot research countries are Nigeria, Kenya, Ghana and South Africa; these are validation targets, not exclusive country availability or newly activated country packs.

Prioritize role categories with repeatable authorized supply and real applicant demand. Investigate customer support, operations/virtual assistance, sales, marketing, design and software; select the first categories after examining actual fresh openings. Do not advertise entry-level access where the inventory is largely senior work.

For each candidate employer/source, record hiring-country evidence, source rights, listing and email permissions, adapter compatibility, last check, role freshness and known gaps. Probe the actual board and verify employer identity before activation. Current approved employer boards and licensed/documented APIs come first; do not bypass source rights to fill gaps.

Acceptance: every activated source has current rights review, verified destination, successful bounded import, public attribution, fresh publication proof and rollback. A permission request or adapter implementation alone is not new supply. Employer contact remains a separately authorized action; prepare candidate lists and draft outreach first.

## AR-07: validate usefulness with applicants

Recruit a proposed first cohort of 20 applicants across the four pilot research countries, targeting five per country where possible. Observe search, country explanation, save, apply and alert setup on their own devices. Recruitment and communication require separate authorization; this plan schedules no messages.

Record completion, misunderstood eligibility, irrelevant results, broken destinations and self-reported applications/interviews. Collect only consented feedback and privacy-safe aggregate measurements; exclude CV contents, raw salary inputs and private application details from analytics.

Proposed continuation criteria, not existing results: at least 12 of 20 complete discovery-to-save or apply without assistance, at least eight activate an alert or return, and no known country exclusion is presented as a supported match. Interview outcomes take longer and are a follow-up measure, not a first-week pass condition. Diagnose country-level failures even if the overall result passes.

## AR-08: release, observation and next decision

Use a clean current branch baseline and preserve the user's canonical checkout. First integrate or revalidate the existing local focus change; do not assume `f3bbcf2` is deployed.

For the first country release, require domain and worker regression tests, existing lint/type/build/format checks, relevant browser journeys and database tests if persistence changes are needed. Show data-unavailable behaviour and real signed-in paths as separate evidence. Follow current `docs/release-gates.md` and `docs/DEPLOYMENT.md`; do not use their historical suite sizes as current test results.

If a migration is needed, commit it, verify the exact SalaryPadi Supabase URL, apply it through the project-specific process and record the migration ledger. Deploys do not apply migrations. Arrange compatibility between application and worker releases; rollback must preserve existing user preferences.

After an authorized release, verify the exact deployed commit, country filtering with real data, exclusions, apply destinations, save/tracker flows, authorized test alert delivery and provider-dependent tools. Track meaningful regressions and supply changes; a local build is not production proof.

Next investment is selected from evidence: expand sources for countries with insufficient supply, simplify navigation where users fail, or improve matching where eligible jobs are poorly ranked. Keep the financial-decision tools connected to offers throughout.

## Immediate handoff

Start AR-01, then AR-02 and AR-03 as one country-discovery release. Review candidate-profile normalization while implementing AR-01 so AR-04 reuses the same decision. Produce the AR-05 coverage table before selecting any new source registrations.

## Implementation update: 2026-10-03

- AR-01 through AR-04 implemented with the same country rule across search, cards, preview, detail, CV recommendations and country alerts. The selector offers all 54 African countries. Public searches never update the saved private profile.
- Existing schema-v1 alerts without a country remain valid. Country alerts exclude roles needing confirmation; the email keeps the country in its stable job-ID link.
- AR-05 coverage snapshot recorded. A forward migration corrects the remote count without changing the health response shape. A second forward migration preserves recurring resolved editorial findings and fixes the observed draft-refresh SQLSTATE 23505 collision; duplicate open findings remain prohibited.
- Next.js updated to 16.3.8 and the production dependency audit is clean. Local Node 22 production build passes. Final CI, migration application and exact-commit production verification remain release gates.
- AR-06 source activation and AR-07 real applicant pilot have not started. No new source rights, market readiness or recruitment outcomes are claimed.
