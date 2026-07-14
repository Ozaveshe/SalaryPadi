# Job source policy matrix

## Decision

SalaryPadi has a production-grade, fail-closed supply boundary and two authorized read-through public feeds: Jobicy and Himalayas. It does **not** yet have durable authorized capacity sufficient to demonstrate 500 new canonical jobs per day. The daily target is a measurement target, not permission to acquire data.

The machine source of truth is [`config/job-source-policy-registry.json`](../config/job-source-policy-registry.json). Database enforcement is in migrations `20260714030605_job_supply_system.sql` and `20260714030620_job_supply_operations.sql`. A source adapter is runnable only when its policy is enabled, its review deadline is in the future, all required dependencies are evidenced, its requested fields are allowlisted, and its database authorization is current. Missing, disabled, expired, or overdue policies fail before a provider request.

Jobicy was activated on 14 July 2026. Himalayas was reviewed on 15 July 2026 for bounded daily Nigeria and worldwide queries. Both feeds require visible attribution and remain excluded from indexing, Google `JobPosting`, email distribution and downstream syndication.

## Rights matrix (reviewed 15 July 2026)

| Adapter                                 | Authority        | Repository state               | Permission basis and evidence                                                                                                                                                                                                                                                                    | Allowed storage                                           | Full description | Attribution                                            | Polling / retention                                                         | Public display                        | Search index                | Google `JobPosting`         | Exact external dependency                                                      |
| --------------------------------------- | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Direct employer submissions             | Direct employer  | Enabled existing lane          | First-party authorization attestation under SalaryPadi terms plus staff moderation                                                                                                                                                                                                               | Submitted job fields, attestation and moderation evidence | Yes              | “Submitted by the employer and reviewed by SalaryPadi” | Event-driven; seven-year audit retention                                    | Yes after moderation                  | Yes after moderation        | Yes after moderation        | Authorization attestation and completed moderation are required per submission |
| Licensed Nigeria or Africa partner feed | Licensed partner | Disabled                       | A signed commercial data licence is required; none exists                                                                                                                                                                                                                                        | None                                                      | No               | Contract-specific, unresolved                          | Proposed hourly incremental; no retention until a contract defines it       | No                                    | No                          | No                          | Signed licence, feed credentials, field/retention schedule                     |
| Employer-authorized Greenhouse boards   | Employer ATS     | Disabled template              | Written permission or commercial contract from each employer; official documented Job Board API is transport documentation, not republication permission                                                                                                                                         | No board is allowlisted                                   | No by default    | Employer/source specific                               | Every two hours, deterministic 17-minute jitter; contract may slow it       | No until per-board approval           | No until per-board approval | No until per-board approval | Exact tenant allowlist and written employer permission                         |
| Employer-authorized Lever boards        | Employer ATS     | Disabled template              | Written permission or commercial contract from each employer; official Postings API documentation is not republication permission                                                                                                                                                                | No board is allowlisted                                   | No by default    | Employer/source specific                               | Every two hours, deterministic 17-minute jitter; contract may slow it       | No until per-board approval           | No until per-board approval | No until per-board approval | Exact tenant allowlist and written employer permission                         |
| Employer-authorized Ashby boards        | Employer ATS     | Disabled template              | Written permission or commercial contract from each employer; official Public Job Posting API documentation is not republication permission                                                                                                                                                      | No board is allowlisted                                   | No by default    | Employer/source specific                               | Every two hours, deterministic 17-minute jitter; contract may slow it       | No until per-board approval           | No until per-board approval | No until per-board approval | Exact tenant allowlist and written employer permission                         |
| ReliefWeb jobs API                      | Secondary feed   | Disabled                       | The [official API documentation](https://apidoc.reliefweb.int/) permits API use, caps calls at 1,000/day and warns that jobs may contain copyright owned by information partners. Since 1 November 2025 an app name must be pre-approved.                                                        | Metadata allowlist only after review                      | No               | ReliefWeb plus named information partner               | Proposed incremental every two hours, full daily; 30-day metadata retention | No pending field-rights review        | No                          | No                          | Pre-approved app name and original-content field review                        |
| Remotive public API                     | Secondary feed   | Disabled pending clarification | The [public API page](https://remotive.com/remote-jobs/api) permits attributed sharing and prohibits third-party job-platform submission, while the newer [general terms](https://remotive.com/terms-of-use) prohibit automated extraction and republication. Written clarification is required. | Metadata allowlist; no durable description                | No               | “Source: Remotive” and returned Remotive URL           | Four/day; no more than four requests/day; one-day metadata retention        | No while terms conflict is unresolved | No                          | No                          | Written republication confirmation                                             |
| Jobicy public API                       | Secondary feed   | Enabled read-through           | The [official API/feed page](https://jobicy.com/jobs-rss-feed) permits feed integration and wider distribution, says a few calls/day are sufficient, caps access at no more than hourly, and requests no distribution to Google Jobs, LinkedIn or other job platforms.                           | Metadata allowlist and short excerpt only                 | No               | “Source: Jobicy” and preserved Jobicy URL              | Four/day, six-hour cache; one-day metadata retention                        | Yes, attributed                       | No                          | No                          | Clickable attribution, six-hour polling, no external redistribution            |

| Himalayas public jobs API | Secondary feed | Enabled read-through | The [official API page](https://himalayas.app/api) explicitly permits backfilling job boards, requires a visible Himalayas source link, and prohibits submission to third-party platforms including Google Jobs and LinkedIn Jobs. | Metadata allowlist and short excerpt only | No | "Source: Himalayas" and preserved Himalayas URL | Three bounded pages/day; one-day metadata retention | Yes, attributed | No | No | Clickable attribution, daily polling, no third-party redistribution |

The registry deliberately contains no LinkedIn, Indeed, Glassdoor, Jobberman, MyJobMag, BrighterMonday, Google Jobs, or Workday adapter. Database policy also rejects those adapter keys. There is no generic crawler and no undocumented endpoint constructor.

## Canonical and occurrence model

```text
tracked schedule / direct submission event
  -> current source policy and dependency gate
  -> source-specific budget / distributed claim
  -> documented adapter
  -> import run outcome (complete, partial, failed, timed out, 403, 429)
  -> latest ingest.raw_job_records materialization
  -> append-only ingest.job_source_occurrences observation
  -> normalized app.jobs source job
  -> exact fingerprint reconciliation
  -> authority winner: direct > employer ATS > licensed > secondary
  -> ingest.job_occurrence_links (every occurrence -> canonical job)
  -> public api.jobs row with provenance and freshness JSON
```

`ingest.raw_job_records` remains the latest per-source materialization for compatibility. It is no longer treated as the occurrence history. `ingest.job_source_occurrences` is append-only and idempotent on source, external ID and observation/run key. `ingest.job_occurrence_links` preserves every permitted occurrence-to-canonical relationship, including authority changes. The lifecycle worker is the only retention purge path; it can remove a link and occurrence only after that occurrence's policy-derived `retention_expires_at`. Direct mutation remains blocked.

Exact fingerprint matches reconcile automatically. The nightly fuzzy worker requires the same company, compatible arrangement, same application host, different application URL and title similarity of at least 0.90. It creates an `audit.job_duplicate_candidates` review item and performs zero automatic fuzzy merges.

## Lifecycle contract

- A source-provided deadline closes a job on the next 15-minute lifecycle run.
- An authoritative confirmed-source closure uses `worker_confirm_job_closed` and closes immediately.
- The first omission from a fully successful snapshot moves the job to `checking`.
- A second fully successful omission closes only when at least 30 minutes have elapsed since the first successful omission. Earlier successful omissions remain `checking`.
- Partial, failed, timed-out, HTTP 403 and HTTP 429 outcomes never advance absence evidence and never close a job.
- Seeing the source occurrence again resets absence evidence and returns it to `open`.
- Direct/manual jobs with no deadline close after 30 days without reconfirmation.
- Public jobs require an open canonical row and a currently runnable public-display policy. An overdue policy disappears from public reads even before the monthly state-maintenance worker marks it expired.

## Salary and eligibility evidence

`app.job_salary_evidence` preserves source text, original amount bounds, currency, source period, location scope and gross/net classification. Annual and monthly values are separate derived columns. They require a JSON assumption list and never replace the original values. Current assumptions are 40 hours/week, 5 days/week, 52 weeks/year and 12 months/year.

Decimal-comma magnitude parsing now distinguishes `31,2k` from `31,200`; the former normalizes to 31,200 rather than 312,000. A source period of `unknown` produces no derived annual or monthly value.

Eligibility storage includes included and excluded countries, literal region wording, required timezone overlap, work authorization, visa sponsorship, physical-location requirement and employee/contractor/freelance arrangement evidence. The word “Remote” alone stays `unclear`. Public supply is stricter: a role must be remote and explicitly say worldwide, Africa, EMEA, Nigeria, or name at least one African country. Onsite, hybrid, non-African-only, ambiguous, and disqualifying work-authorization records are counted as policy filters rather than silently published.

## Operational schedules

| Worker                     | Local cron                                      | Contract                                                                                                                  |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Job supply dispatcher      | `*/15 * * * *`                                  | Measures due authorized sources; never activates a source                                                                 |
| Licensed incremental       | `7 * * * *` registry default                    | Disabled until licence and credentials exist                                                                              |
| Authorized ATS             | `2,17,32,47 * * * *`                            | One bounded claim opportunity every 15 minutes; each source remains limited to two hours or its stricter reviewed cadence |
| ReliefWeb incremental/full | Registry defaults `29 */2 * * *` / `11 1 * * *` | Disabled until approved app name and rights review                                                                        |
| Remotive                   | `5 1,7,13,19 * * *`                             | Disabled by current policy conflict; four/day maximum                                                                     |
| Jobicy                     | Registry default `35 1,7,13,19 * * *`           | Enabled read-through; four/day and never more than hourly                                                                 |
| Himalayas                  | Registry default `47 2 * * *`                   | Enabled read-through; three bounded pages once daily                                                                      |
| Direct submissions         | Event-driven                                    | Existing moderated intake                                                                                                 |
| Deadline expiry            | `*/15 * * * *`                                  | Deadline and 30-day manual expiry                                                                                         |
| User alerts                | `*/15 * * * *`                                  | Existing alert claims; source email permission remains independent                                                        |
| Apply-link checks          | `8,23,38,53 * * * *`                            | New jobs are eligible immediately; all canonical links become due every 24 hours                                          |
| Fuzzy review               | `13 3 * * *`                                    | Review queue only, no automatic merge                                                                                     |
| Health digest              | `7 5 * * *`                                     | Durable count-only digest; no external message is sent                                                                    |
| Rights review              | `19 6 1 * *`                                    | Marks overdue enabled policies expired/paused; runtime gates enforce the deadline continuously                            |

Every Netlify worker uses `private.worker_runs` run-key idempotency. ATS/source claims use advisory locks and durable request budgets. Apply checks use row locks with `SKIP LOCKED`. Retry code uses bounded full jitter. HTTP 403/429 checks are indeterminate rather than broken. Apply destinations are HTTPS-only and redirect-free; every resolved address must be public, and the request is pinned to a validated address while retaining the original TLS server name to prevent DNS rebinding.

## Activation gate

Activation is a separate, explicitly approved operation. For one source, an operator must:

1. Record the permission evidence, grantor, terms version, allowed fields, attribution, polling ceiling, retention, display/index/Google/email rights and review deadline.
2. Resolve every dependency without storing a credential value in the policy registry.
3. For ATS, record one exact tenant and destination allowlist per consenting employer.
4. Add recorded fixtures for success, empty, malformed, oversized, timeout, 403, 429 and 5xx behavior.
5. Set an evidenced expected daily new-canonical estimate; until then dashboard authorized capacity remains zero.
6. Run a disabled dry run, database tests, the full quality gate and a deployment review.
7. Obtain explicit approval before changing `policy_state`, the environment kill switch, production data or deployment state.

Database-history reconciliation completed locally during launch review: repository filenames now use the four already-applied production versions (20260713172319, 20260713172330, 20260713172341, 20260713172351), and each SQL body was verified byte-equivalent after normalizing the production ledger's CRLF line endings. No `migration repair`, production SQL, or production write was used. The remaining blocker is execution of the repository migration and pgTAP suites in an isolated database; the review environment did not have a Supabase CLI or Docker runtime.

The 500/day goal is achieved only by seven-day dashboard evidence of distinct `canonical_created` events, not by read-through visibility, raw fetch counts, projected partner volume or duplicate occurrences.
