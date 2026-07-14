# Product experience audit

Date: 14 July 2026

Scope: public SalaryPadi experience after the production-truth and job-supply work

Deployment: not performed

## Outcome

The existing forest, sand, coral and gold design system was retained. The work
changes product hierarchy and evidence handling rather than repainting the UI:

- job search is the dominant homepage action, with an explicit Nigeria/Africa
  eligibility control and separate Nigeria-local and eligible-remote paths;
- job results retain URL-backed filters and saved-search state, interleave
  repeated employer/location clusters, and surface source, check date, salary,
  arrangement, experience and eligibility evidence;
- the Job Truth Card now carries included and excluded countries, exact region
  wording, physical location, authorisation, timezone, visa, relocation,
  arrangement, source salary, labelled derivation assumptions, source dates,
  deadline, original link, confidence boundary and report path;
- company and salary surfaces distinguish stored facts, public citations,
  first-party evidence, suppressed evidence and unavailable reads;
- the server-side AfroTools list is presented as two in-product calculations and
  thirteen external destinations. The approved local scam checker is separate;
- employer and community contribution paths are visible from the header,
  homepage, footer and contribution hub; and
- Feed and Forums remain reachable by direct URL but are no longer promoted in
  primary navigation while activity is empty.

## Route audit and implementation

| Surface                              | Before                                                                                       | Implemented                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | Trust-first hero, but search followed the hero proof and had no explicit eligibility control | Dominant search, Nigeria/Africa control, separate local/remote paths, live counts, source-check state, and direct salary/company/tool/contribution continuation |
| `/jobs`                              | URL filters and honest unavailable state; limited African evidence fields                    | Full requested evidence set, compact evidence rows, visible sort, complete saved-search handoff, cluster interleaving and explicit local/remote paths           |
| `/jobs/[slug]`                       | Three-column truth summary with core source and pay facts                                    | Expanded evidence/provenance contract, labelled salary derivation, report path and continuous take-home/company/interview actions                               |
| `/companies` and `/companies/[slug]` | Honest records and community subpages                                                        | Claim/right-of-reply paths, citation list or explicit citation gap, active-job provenance and retained honest empty states                                      |
| `/salaries`                          | Privacy-thresholded annual aggregate                                                         | Rounded approximate display plus currency, annualisation boundary, gross/net, role, seniority, country, sample, date range and confidence                       |
| `/tools`                             | 15 dense cards exposing synchronization, cache, update and integration metadata              | Two in-product outcomes, 13 external outcomes, no engineering metadata, no widget claim, and a separate local scam-checker boundary                             |
| `/contribute` and `/post-a-job`      | Salary/review/interview and moderated job submission                                         | Discoverable employer paths plus clearer Africa-specific qualification, benefit, work-practice and relocation evidence prompts                                  |

The job evidence matcher is deliberately conservative. A badge appears only
when retained title, description, requirements, benefits or eligibility text
matches the relevant wording. Missing evidence means “not stated”, not “no”.
Generic remote wording remains unclear.

## Responsive and accessibility evidence

The implementation uses the existing skip link, native controls, labelled
fields, visible three-pixel focus ring, minimum 44-pixel controls, forced-colour
support and reduced-motion override. The mobile analytics control is placed
after the footer at widths up to 480px so it cannot obscure search or provenance
text.

Automated browser checks passed with no detected WCAG A/AA/2.1/2.2 violations
on `/`, `/jobs`, `/companies`, `/salaries`, `/tools` and `/contribute`.
Horizontal-overflow checks passed at 320px, 360px, 768px and desktop widths.

### Screenshots

| Surface              | Before                                         | After                                            |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Homepage desktop     | `output/playwright/before/home-desktop.png`    | `output/playwright/after/home-desktop.png`       |
| Homepage 320px       | `output/playwright/before/home-mobile-320.png` | `output/playwright/after/home-mobile-320.png`    |
| Jobs desktop         | `output/playwright/before/jobs-desktop.png`    | `output/playwright/after/jobs-desktop.png`       |
| Jobs 320px           | `output/playwright/before/jobs-mobile-320.png` | `output/playwright/after/jobs-mobile-320.png`    |
| Tools desktop        | `output/playwright/before/tools-desktop.png`   | `output/playwright/after/tools-desktop.png`      |
| Tools 320px          | not captured in the initial baseline           | `output/playwright/after/tools-mobile-320.png`   |
| Companies desktop    | not captured in the initial baseline           | `output/playwright/after/companies-desktop.png`  |
| Salaries desktop     | not captured in the initial baseline           | `output/playwright/after/salaries-desktop.png`   |
| Contribution desktop | not captured in the initial baseline           | `output/playwright/after/contribute-desktop.png` |

Screenshots were captured from a production build on localhost with analytics
consent set to denied. They contain no secret or personal data.

## Performance measurement

Lighthouse was run against the optimized production server, not the development
server.

| Route/run       | Performance | Accessibility | Best practices | SEO |   FCP |   LCP |    TBT |   CLS | Transfer |
| --------------- | ----------: | ------------: | -------------: | --: | ----: | ----: | -----: | ----: | -------: |
| Jobs before     |         100 |           100 |            100 |  66 | 0.2 s | 0.5 s |   0 ms | 0.055 |  202 KiB |
| Jobs after      |          99 |           100 |            100 |  66 | 0.9 s | 2.0 s | 100 ms |     0 |  187 KiB |
| Companies after |          98 |           100 |            100 |  91 | 0.8 s | 1.9 s | 140 ms |     0 |  164 KiB |

The jobs SEO score is intentionally reduced because the current unavailable
source state keeps the directory `noindex`; this is not a metadata regression.
The public directory shells exceed the 90 target and ship no new image payload.

Job and company **leaf** Lighthouse measurements are blocked: the reviewed job
policy currently rejects the stored live source, the company repository read is
unavailable, and therefore no legitimate local slug renders. A fabricated
fixture was not substituted for performance proof. Leaf performance must be
rerun once a source-authorized current job and a cited company record are
available through the normal repository boundary.

Artifacts:

- `output/playwright/before/lighthouse-jobs.json`
- `output/playwright/after/lighthouse-jobs.json`
- `output/playwright/after/lighthouse-companies.json`

## Verification commands

```text
npm run lint
npm run typecheck
npx vitest run src/lib/jobs/search.test.ts src/lib/jobs/evidence.test.ts src/lib/afrotools/tool-presentation.test.ts src/lib/salaries/presentation.test.ts src/lib/employers/submission.test.ts src/app/api/alerts/update/route.test.ts
npx playwright test tests/e2e/product-decision-path.spec.ts --project=desktop-chromium
npx playwright test tests/e2e/public-flows.spec.ts --project=desktop-chromium --grep "automatically detectable"
npx playwright test tests/e2e/responsive-visual.spec.ts --project=desktop-chromium --grep "320px lower bound"
$env:NEXT_PUBLIC_APP_URL='https://salarypadi.test'; npm run build
npx lighthouse http://127.0.0.1:3208/jobs ...
npx lighthouse http://127.0.0.1:3208/companies ...
```

Final results: the full `npm run quality` gate passed; Vitest reported 100
files and 772 tests passing. The product decision-path suite passed 12 tests
across mobile, tablet and desktop. The responsive suite passed 10 tests with 2
intentional project skips for the single-browser 320px check. Six public-route
axe checks passed with no detected violations.

## Remaining product gaps

1. Current source-policy mismatch means no job can be truthfully rendered or
   freshly verified in the local production-mode audit.
2. Company facts without a stored public citation URL remain labelled as
   reviewed records rather than official facts. The repository needs a
   first-class fact-citation relation.
3. Company claim and right of reply currently enter the human support workflow;
   there is no in-product status tracker or verified organisation workspace.
4. Africa-specific job evidence is searchable from retained text, but several
   fields still need dedicated canonical columns before reliable facet counts
   can be published.
5. No publishable salary aggregate was available to screenshot. Component and
   formatting tests protect the honest rounded state, but a real aggregate
   still needs browser and Lighthouse evidence when the privacy threshold is
   met.
6. Feed and Forums still exist as direct routes. They should remain absent from
   primary navigation until useful activity and moderation capacity are proven.
