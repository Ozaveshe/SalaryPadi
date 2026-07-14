# SalaryPadi launch readiness — 1 August 2026

Decision: **NO-GO as of 14 July 2026**.

The integrated candidate is substantially stronger than the deployed application, and its local quality gates pass. It is not launch-ready because job-supply truth, database compatibility, authenticated journeys, production observability, security closure, backup/restore proof, and public leaf-page performance are not proven. The target of at least **200 new, distinct, legitimate, source-authorized canonical jobs per day is not proven**. Current authorized external capacity is **0/day**; fetched provider occurrences are not counted as canonical jobs.

This review was read-only against production. No deployment, production migration, source activation, alert, content publication, Indexing API submission, or user contact was performed.

Machine-readable release evidence: [`reports/launch-readiness-2026-08-01.json`](../reports/launch-readiness-2026-08-01.json).

## Release identity and evidence boundary

| Item                      | Evidence                                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate base            | `29dd7364cf695c015ccb1fe737822765ca9d910b`; `HEAD` and `origin/main` are equal (`0 0` divergence), with a large uncommitted integrated candidate in the working tree                                                                                                                                     |
| Deploy channel            | `npm run deploy:verify` passed for Netlify site `f20afc4c-5326-4f00-97bf-570a679aadbc`, `https://salarypadi.com`, Supabase `bxelrhklsznmpksgrqep`, branch `main`                                                                                                                                         |
| Current production deploy | Netlify deploy `6a552080f4ce3f0008fcfa84`, commit `29dd7364...`, ready, published 13 July 2026 17:30:49 UTC; this is the pre-candidate deploy                                                                                                                                                            |
| Exact-commit CI           | [GitHub CI run 29270642064](https://github.com/Ozaveshe/SalaryPadi/actions/runs/29270642064) passed for the deployed commit                                                                                                                                                                              |
| Production freshness      | [GitHub run 29290489909](https://github.com/Ozaveshe/SalaryPadi/actions/runs/29290489909) passed; the most recent job canary found during review was an older failed run, [29264606526](https://github.com/Ozaveshe/SalaryPadi/actions/runs/29264606526), before the current deploy                      |
| Live health               | [`/api/health`](https://salarypadi.com/api/health) returned `ok`; all 15 registered production workers reported healthy freshness at 14 July 2026 01:12 UTC                                                                                                                                              |
| Candidate-only endpoints  | Production returned 404 for `/api/internal/production-health` and `/sitemaps/jobs.xml`, proving that the candidate observability and sitemap changes are not deployed                                                                                                                                    |
| Primary audit artifacts   | [Production truth](../reports/production-truth-audit.json), [job-supply pilot](../reports/job-supply-pilot-14-day.json), [company intelligence](../reports/company-intelligence-audit.json), [SEO](../reports/seo-content-audit.json), and [structured data](../reports/structured-data-validation.json) |

## Launch criteria

Every criterion is binary here. A locally passing subset does not turn an unverified production requirement into a pass.

| #   | Criterion                                                                                                                        | Status   | Exact evidence and release disposition                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Seven-day job supply, freshness, source diversity, duplicate rate, links, expiry and every source SLA                            | **FAIL** | Production has only five calendar days of import evidence, one visible source, zero durable raw occurrences, zero durable canonical jobs and zero canonical creations. Accepted, duplicate, rejected, eligibility and broken-link metrics do not exist in the deployed ledger. See the supply section below.                                                                                                                                                            |
| 2   | Source-policy enforcement prevents accidental source, field and Google Jobs violations                                           | **FAIL** | Candidate code is now fail-closed at the public repository, internal proxy and scheduled worker, and focused tests pass. However the new database enforcement has not run, the candidate is not deployed, and production still executed Remotive at 01:07 UTC under its older active policy. Code gate passes; launch proof does not.                                                                                                                                   |
| 3   | Salary, eligibility, timezone, lifecycle, dedupe, partial failure, retry, lock and idempotency                                   | **FAIL** | All application tests pass, including the Coalition Technologies annualization/Pacific-time regression, conservative dedupe, lifecycle, partial-run, retry, distributed-claim and idempotency cases. The pgTAP suite did not execute because no isolated local database was reachable, so database-bound behavior remains unproven.                                                                                                                                     |
| 4   | Public, authenticated, contribution, employer, moderation, deletion and empty-state journeys on mobile and desktop               | **FAIL** | Playwright passed 148 cases across 360px, 768px and desktop with zero failures. Five authenticated mutation journeys, three public job-detail journeys and the production source canary were skipped because isolated user/admin sessions and an authorized live source were deliberately absent. Candidate reads against the production schema logged `PGRST205` for candidate-only tables, proving schema incompatibility until migrations are validated and applied. |
| 5   | AfroTools credentials, quota/fallback, catalog version, two APIs, 13 links and zero widget claims                                | **PASS** | Production configuration scopes `AFROTOOLS_API_KEY` to server functions/runtime. Candidate tests cover quota errors, bounded retries, version/ETag handling, stale/unconfigured fallback, two native SalaryPadi experiences, 13 external links, the native scam checker and zero widget/engineering-metadata claims. Public browser assertions pass.                                                                                                                    |
| 6   | Metadata, robots, sitemaps, canonicals, structured data, indexing events, expiry, RSS, links and noindex gates                   | **FAIL** | Candidate crawl contract passed all 21 scenarios and the full browser suite; structured-data contracts pass. Production still serves the old nine-URL sitemap, returns 404 for child sitemaps, and does not expose the candidate health endpoint. Search Console, Indexing API delivery/quota and post-deploy expiry events are unproven and both Google integrations remain safely disabled.                                                                           |
| 7   | Privacy, authorization, PII, anonymous identity, audit integrity, secrets, logs, dependencies, headers, CSP, abuse and retention | **FAIL** | Dependency, secret-pattern, external-opinion ingress, authorization and PII tests pass; production security headers and CSP are present. Supabase reports five security-definer warnings that require documented acceptance after pgTAP, and the exhaustive repository security scan was not started in the available scan workspace. Production lacks a dedicated log sink/paging integration and candidate retention jobs are not deployed.                           |
| 8   | Accessibility, performance, visual regression, database, backup, rollback, flags, observability, alerts, runbooks and ownership  | **FAIL** | Axe/browser accessibility and responsive screenshot coverage pass. Candidate directory Lighthouse performance is 99/98, but production job/company leaf scores are 80/80 and no candidate data-backed leaves exist for a valid remeasure. pgTAP, backup/restore drill, post-migration smoke, candidate alerts and post-deploy rollback rehearsal are absent.                                                                                                            |
| 9   | Misleading navigation, fixtures, fake activity, unsupported ratings and trust claims                                             | **PASS** | Feed/forums are absent from primary navigation; empty states do not invent activity. The company ingress audit checked 337 files and found zero external workplace-opinion ingress. Production contains zero contribution, rating or salary-aggregate rows, and the candidate does not publish fixture reviews, ratings, verification or synthetic jobs.                                                                                                                |

Result: **2 of 9 criteria pass; 7 fail**.

## Seven-day job-supply and freshness truth

The production query covered `now() - 7 days`, but the ledger contains rows only from 10–14 July: five calendar days, not seven. The deployed recorder does not have `accepted_count`, `duplicate_count`, `rejected_count`, `nigeria_local_count`, `explicit_eligible_count`, or `unclear_eligibility_count`. It also records start and completion at the same instant, so its `0.000s` durations are not credible run-duration evidence.

| UTC day   |   Runs | Succeeded | Failed | Fetched occurrences | New canonical | Errors |
| --------- | -----: | --------: | -----: | ------------------: | ------------: | -----: |
| 10 Jul    |      4 |         4 |      0 |                 114 |             0 |      0 |
| 11 Jul    |      5 |         1 |      4 |                  30 |             0 |      4 |
| 12 Jul    |      2 |         2 |      0 |                  82 |             0 |      0 |
| 13 Jul    |      4 |         3 |      1 |                 117 |             0 |      1 |
| 14 Jul    |      1 |         1 |      0 |                  38 |             0 |      0 |
| **Total** | **16** |    **11** |  **5** |             **381** |         **0** |  **5** |

The 381 figure is repeated Remotive snapshot occurrences, not 381 distinct jobs. Production still has:

- `ingest.raw_job_records`: 0 rows;
- `app.jobs`: 0 rows, including 0 published canonical jobs;
- registered sources: 2 (`remotive` and direct submissions), both marked active in the old database policy;
- visible source diversity: 1;
- authorized external capacity under the candidate registry: 0/day;
- duplicate rate, eligible share, broken-apply-link rate and expired visibility: **unknown**, not zero.

Source SLA disposition:

| Source or lane              | Production proof                                                                     | Candidate policy                                                            | SLA disposition                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Remotive                    | Last success 14 Jul 01:07 UTC; 11 successes and 5 failures in the observed five days | Disabled for unresolved republication rights; 6-hour minimum, 4/day maximum | Current worker freshness is healthy, but launch use is forbidden until rights resolve; the candidate correctly stops it |
| Direct employer submissions | Active first-party lane; no import success or canonical jobs                         | Enabled, review due 10 Aug 2026                                             | Event-driven boundary exists; no volume or end-to-end production evidence                                               |
| Greenhouse, Lever, Ashby    | ATS worker only records disabled skips; no successful provider run                   | Disabled, missing employer permission/allowlists                            | Safe disabled state proven; supply SLA not applicable until separately approved                                         |
| Licensed Africa partner     | No production source or run                                                          | Disabled, missing licence/credentials/field schedule                        | Not available                                                                                                           |
| ReliefWeb                   | No production source or run                                                          | Disabled, missing pre-approved app name and field-rights review             | Not available                                                                                                           |
| Jobicy                      | No production source or run                                                          | Disabled, unresolved storage/retention/index review                         | Not available                                                                                                           |

The intended seven-day dashboard route is `/admin/source-health`, but its canonical-job metrics depend on unapplied migrations. The 14-day pilot artifact remains deliberately `not_run` with null metrics. This is correct behavior and must not be replaced with fetched counts.

## Launch-blocking defects resolved in this review

1. **Static policy bypass closed.** The old Remotive public repository, internal provider proxy and scheduled worker previously relied on environment/database gates and could run even though `config/job-source-policy-registry.json` disabled Remotive. All three paths now call the static source-policy boundary before database lookup, budget claim, provider fetch or storage. Regression tests prove `remotive_policy_disabled` with zero downstream calls.
2. **Migration-history drift reconciled locally.** Four repository files now use the production ledger versions `20260713172319`, `20260713172330`, `20260713172341`, and `20260713172351`. Each remote SQL body matched the local file after normalizing the ledger's CRLF line endings. No production SQL or `migration repair` was used.
3. **Stale browser assertions corrected.** Sitemap tests now follow the sitemap index to the guide sitemap; contribution labels match the shipped copy; canonical tests compare against the configured public origin instead of the local transport host.
4. **Coverage gate restored without reducing thresholds.** Focused Google service-account boundary tests cover invalid identity/key, JWT grant shape, provider rejection and invalid OAuth responses. The configured global line threshold now passes at 86.04%.

These fixes are local and uncommitted within the integrated candidate. They are not production proof.

## Quality and security evidence

| Command or evidence                                                    | Result                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run quality`                                                      | PASS: lint, Next type generation/TypeScript, 115 Vitest files / 844 tests, production build with 101 routes                                                                              |
| `npm run test:coverage`                                                | PASS: statements 83.94%, branches 74.06%, functions 87.91%, lines 86.04%; thresholds unchanged                                                                                           |
| `npm run test:e2e` in production-build mode                            | PASS WITH REQUIRED SKIPS: 148 passed, 29 skipped, 0 failed across mobile, tablet and desktop                                                                                             |
| `npx playwright test tests/e2e/seo-crawl.spec.ts --project=mobile-360` | PASS: 21/21 crawl scenarios                                                                                                                                                              |
| Focused source-policy/reconciliation suite                             | PASS: 5 files / 60 tests                                                                                                                                                                 |
| `npm run audit:production-truth`                                       | PASS: 5/5 assertions                                                                                                                                                                     |
| `npm run audit:company-intelligence`                                   | PASS: 337 files; 0 application, database, seed/index or prompt matches for external workplace opinion                                                                                    |
| `npm audit --json`                                                     | PASS: 0 known vulnerabilities across 590 total dependencies                                                                                                                              |
| Tracked-secret filename/pattern check                                  | Only `.env.example` is tracked; 0 high-confidence private-key/live-token pattern files. Production Netlify secret scan inspected 469 files with no match. No secret values were printed. |
| `npm run format:check`; `git diff --check`                             | PASS                                                                                                                                                                                     |
| `npm run deploy:verify`                                                | PASS for the intended SalaryPadi Netlify/Supabase channel                                                                                                                                |
| `npx supabase@2.109.1 test db --local`                                 | **FAIL**: no reachable isolated local Postgres/Supabase database; pgTAP did not execute                                                                                                  |
| Exhaustive Codex Security scan                                         | **NOT RUN**: the required scan workspace was opened but the scan was not started; no exhaustive-scan claim is made                                                                       |

The 29 browser skips break down as 15 project instances for five authenticated mutation journeys, nine instances for three data-backed job-detail journeys, three instances for the explicit production source canary, and two intentional duplicate skips for the one-browser 320px lower-bound check. The missing unique journeys are therefore the five authenticated flows, three real job-detail flows and one live canary—not 29 distinct product flows.

Public visual evidence:

- Before: [home desktop](../output/playwright/before/home-desktop.png), [home 320px](../output/playwright/before/home-mobile-320.png), [jobs desktop](../output/playwright/before/jobs-desktop.png), [jobs 320px](../output/playwright/before/jobs-mobile-320.png).
- Candidate: [home desktop](../output/playwright/after/home-desktop.png), [home 320px](../output/playwright/after/home-mobile-320.png), [jobs desktop](../output/playwright/after/jobs-desktop.png), [jobs 320px](../output/playwright/after/jobs-mobile-320.png), [companies](../output/playwright/after/companies-desktop.png), [salaries](../output/playwright/after/salaries-desktop.png), [tools](../output/playwright/after/tools-desktop.png), and [contribute](../output/playwright/after/contribute-desktop.png).
- Fresh regression captures also exist for home, jobs, companies, salaries, tools and contribution surfaces at 360px, 768px and desktop under `output/playwright/results/`.

Accessibility checks in the browser suite passed on the public surfaces. Candidate directory Lighthouse artifacts report jobs performance 99/accessibility 100 and companies performance 98/accessibility 100, with CLS 0. Production leaf artifacts remain 80 performance with CLS 0.332. The requested 90+ public job/company **leaf** target is therefore not proven.

Supabase security advisors returned 22 informational deny-by-default RLS/no-policy notices and five warnings:

- anonymous execution of `api.get_salary_cell_progress` as a security-definer function ([advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable));
- authenticated execution of `api.admin_list_editorial`, `api.admin_transition`, `api.get_salary_cell_progress`, and `api.transition_editorial` as security-definer functions ([advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

The public salary function and guarded admin functions may be intentional, but they require explicit function-by-function acceptance backed by the final pgTAP suite. Until that proof exists, the security criterion fails.

## Known risks, owner, mitigation and deadline

Oza is the documented interim accountable operator; role addresses below are routing aliases, not evidence of separate staffed teams.

| Risk                                                                                               | Owner                           | Required mitigation                                                                                                                                                                            | Deadline for an Aug 1 reconsideration                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 200/day target and seven-day dashboard unproven; authorized external capacity 0/day                | Oza / `sources@salarypadi.com`  | Obtain written rights, approve a controlled source, deploy only after approval, and collect at least seven complete days plus the existing 14-day pilot metrics using `canonical_created` only | Source/legal gate by 15 Jul; evidence review by 29 Jul                     |
| Candidate migrations and 20 pgTAP files not executed                                               | Oza / `ops@salarypadi.com`      | Run clean-database migrations and every pgTAP suite in disposable staging; resolve all failures without changing thresholds                                                                    | 20 Jul                                                                     |
| Candidate currently reads missing production tables (`PGRST205`)                                   | Oza / `ops@salarypadi.com`      | Prove backward compatibility, migration order and staged application; rerun public and authenticated smoke after schema upgrade                                                                | 21 Jul                                                                     |
| Auth, alerts, contributions, claims, moderation, reports and deletion mutation journeys unverified | Oza / `support@salarypadi.com`  | Create isolated test-user and AAL2 admin storage states in staging; execute all five mutation journeys and prove cleanup/audit history                                                         | 22 Jul                                                                     |
| Backup/restore and database rollback evidence absent                                               | Oza / `ops@salarypadi.com`      | Verify backup status, perform a timed disposable restore drill, record RPO/RTO and test the forward-fix procedure                                                                              | 23 Jul                                                                     |
| Supabase security-definer warnings and exhaustive scan unresolved                                  | Oza / `security@salarypadi.com` | Review each function grant/guard, run pgTAP and a repository-wide security scan, disposition every warning with evidence                                                                       | 21 Jul                                                                     |
| Production leaf Lighthouse 80; candidate leaves unavailable                                        | Oza / `ops@salarypadi.com`      | Seed only authorized staging data, measure representative job/company leaves, fix blockers or document an accepted exception; target at least 90                                               | 24 Jul                                                                     |
| Candidate health alerts, log sink and incident paging unproven                                     | Oza / `ops@salarypadi.com`      | Validate durable alerts and safe internal health endpoint in staging; configure and test approved paging/log retention without sending user alerts                                             | 24 Jul                                                                     |
| Search Console/Indexing API delivery unknown                                                       | Oza / `ops@salarypadi.com`      | Configure restricted service-account credentials, keep flags false, validate eligibility/outbox behavior in staging, then obtain separate production-submit approval                           | 25 Jul                                                                     |
| Country activation evidence exists only as fixtures/code                                           | Oza / `sources@salarypadi.com`  | Keep Ghana, Kenya and South Africa disabled; run country readiness, canonical and hreflang tests after authorized localized data exists                                                        | Before any country activation; not required to activate for Nigeria launch |

Any missed deadline keeps the corresponding criterion failed. The date is not a reason to waive the evidence.

## External dependencies

- Signed Nigeria/Africa partner licence, feed credentials, allowed-field schedule, retention schedule and expected capacity evidence.
- Written employer permission and exact tenant/board allowlists for each Greenhouse, Lever or Ashby source.
- Pre-approved ReliefWeb app name and original information-partner field-rights review.
- Written Remotive republication confirmation resolving the public-API/general-terms conflict.
- Jobicy storage, retention, display and search-index review.
- An isolated Supabase/Postgres environment capable of running the complete migration and pgTAP suites.
- Isolated SalaryPadi test-user and AAL2 admin sessions for destructive staging-only browser journeys.
- Verified backup/restore capability and a disposable restore target.
- Restricted Google Search Console/Indexing service-account access, if those integrations are approved.
- An approved external log sink/paging destination and an owned incident rota.

No credential, licence, consent, test result or production capacity is inferred from code or configuration placeholders.

## Rollback procedure

This is the procedure for a future approved release; no rollback was performed during this review.

1. **Contain sources and outbound actions first.** Set `REMOTIVE_SOURCE_ENABLED=false`, `ATS_SOURCE_SYNC_ENABLED=false`, `GOOGLE_SEARCH_CONSOLE_ENABLED=false`, and `GOOGLE_INDEXING_ENABLED=false`. Pause any individually approved source in the database. Do not replay partial/failed runs or send pending alerts while incident scope is unknown.
2. **Web rollback.** In Netlify, republish the last known-good production deploy `6a552080f4ce3f0008fcfa84` for commit `29dd7364...`. Record the new deploy ID and verify the apex redirect, CSP/security headers, `/api/health`, public routes, robots, sitemap and RSS.
3. **Database compatibility.** Migrations are forward-only. Do not use a destructive down migration or `migration repair`. Stop affected writes, deploy a compatible web artifact, and apply a reviewed forward-fix migration. Use point-in-time restore only under the approved disaster-recovery decision after assessing data loss and external side effects.
4. **Worker recovery.** Confirm schedules create new run records, disabled sources produce safe skips with zero provider calls, locks suppress duplicate run keys, and failed/partial runs do not close jobs. Re-enable one approved worker at a time only after schema/web compatibility is proven.
5. **Data and privacy verification.** Check that public pages expose no contributor identity, private evidence, salary row, removed content, forbidden source field or unsupported structured data. Refresh only affected aggregates after a reviewed removal/restore.
6. **Closeout.** Record incident owner, timeline, deploy/migration IDs, alerts, affected URLs, source states, verification commands and the explicit outcome `released`, `rolled back`, or `blocked`.

## Go/no-go decision

**NO-GO.** Do not deploy or migrate this candidate, activate a source, send alerts, publish content, or submit URLs based on the present evidence.

Reconsider only when every failed criterion above has current evidence. In particular, the database and authenticated-flow gates must pass, source rights must be complete, and the supply dashboard must show real distinct canonical creation. A run that fetches the same 38 provider jobs repeatedly is not progress toward 200 new canonical jobs per day.
