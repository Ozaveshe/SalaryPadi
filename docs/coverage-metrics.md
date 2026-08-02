# Coverage metrics

Audited against production on 2026-08-02. Every figure here is measured, not
estimated.

## The matrix

| Metric                              | Value        |
| ----------------------------------- | ------------ |
| Active public jobs                  | **230**      |
| Published rows in the database      | 1,130        |
| Unique employers visible publicly   | **10**       |
| Unique employers with any record    | 101          |
| Jobs added, last 24h                | 4            |
| Jobs added, last 7d                 | 19           |
| Median age of a visible job         | **173 days** |
| Posted within the last 30 days      | 55 of 230    |
| Destination: employer ATS           | 1,820        |
| Destination: external board         | 55           |
| Destination: aggregator             | **0**        |
| Active sources                      | 64           |
| Jobs with disclosed salary          | **0**        |
| Broken apply links                  | 0            |
| Duplicate candidates pending review | 81           |

## The three findings that matter

### 1. The 900-job gap is not a defect

1,130 rows are published but only 230 are publicly visible. That looked like
a bug worth chasing. It is not: the source-of-truth function
`security.public_job_provenance()` agrees with the cache on every sampled
row, so the withholding is correct.

Where the 900 actually are:

| Country                                                  | Held jobs | Employers |
| -------------------------------------------------------- | --------- | --------- |
| **Egypt**                                                | **654**   | 30        |
| (no location)                                            | 68        | 1         |
| Nigeria                                                  | 25        | 3         |
| Morocco                                                  | 23        | 8         |
| Algeria                                                  | 17        | 3         |
| Rwanda                                                   | 15        | 5         |
| Ethiopia, South Sudan, Benin, Cameroon, Tanzania, Uganda | 7–12 each | 2–4 each  |

Egypt alone is 73% of the held inventory. These are roles in countries whose
packs are not activated — the country-pack gate doing exactly its job. 863 of
the 900 also lack a source-evidence link, which is the canonical model
refusing to publish anything it cannot trace.

**Implication for growth:** activating a country pack is the single largest
available inventory lever (Egypt would nearly quadruple visible inventory),
but pack activation is a legal and content decision requiring reviewed
evidence, not a configuration flip. It must not be done to hit a number.

The 25 held **Nigerian** jobs are the exception worth individual diagnosis,
since Nigeria is the active market — they should be visible and are not.

### 2. Three employers own 84.3% of what a visitor sees

| Employer                | Jobs   | Share |
| ----------------------- | ------ | ----- |
| Renmoney                | 70     | 30.4% |
| Canonical               | 68     | 29.6% |
| Moniepoint              | 56     | 24.3% |
| Kuda                    | 13     | 5.7%  |
| FairMoney               | 8      | 3.5%  |
| Zipline                 | 6      | 2.6%  |
| One Acre Fund           | 4      | 1.7%  |
| M-KOPA, Evidence Action | 2 each | 0.9%  |
| LemFi                   | 1      | 0.4%  |

Ranked by relevance or recency alone, a first page is one or two employers. A
job seeker then concludes the platform has nothing for them while eight other
employers sit below the fold.

This is addressed by
[`src/lib/serving/result-diversity.ts`](../src/lib/serving/result-diversity.ts):
a per-employer cap of 3 within the leading 20 results, with the complete set
still returned and deferred counts reported so the interface can offer "more
jobs from this employer". Concentration monitoring raises an alert above 25%
for a single employer or 60% for the top three — both breached today.

### 3. Median visible job age is 173 days

Only 55 of 230 visible jobs were posted in the last 30 days, and just 19 in
the last week. The inventory is not being refreshed at anything like the rate
needed to look alive, which is a supply problem rather than a gate problem.

## Distance to 20,000

Publishing every currently held job would give 1,130 — **5.6%** of the
target. The gap is genuine supply, and the audit says where it must come
from:

- **More employers, not more jobs per employer.** 10 visible employers is the
  binding constraint; adding another Renmoney-sized board worsens
  concentration rather than improving the experience.
- **Direct employer and ATS sources first.** 1,820 of 1,875 destinations
  already go to an employer ATS and **zero** to an aggregator. That posture
  is worth preserving as volume grows.
- **Country packs are the largest single lever** and the one most constrained
  by review.

## Targets

Volume alone is explicitly not the measure of success.

| Metric                               | Today    | Target    |
| ------------------------------------ | -------- | --------- |
| Unique visible employers             | 10       | 150+      |
| Largest employer share               | 30.4%    | < 10%     |
| Top-three share                      | 84.3%    | < 25%     |
| New active jobs/day                  | ~3       | 200+      |
| Median visible job age               | 173 days | < 30 days |
| Posted within 30 days                | 24%      | > 70%     |
| Jobs with disclosed salary           | 0        | > 15%     |
| Aggregator destinations              | 0        | stays 0   |
| Broken apply links                   | 0        | < 1%      |
| Public jobs without a source receipt | 0        | stays 0   |

## Re-running this audit

The queries are re-runnable against production through the project-scoped
Supabase MCP. Concentration can be measured in application code with
`measureConcentration()` from the diversity module, which is what the
operational alert should call.
