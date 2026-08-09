# Career intelligence engine — Phase 1 audit

Audited 2026-08-02 against the running system and production data. This is
Phase 1 of the v2 brief, and it is deliberately the only phase delivered:
the brief's own instruction is to audit, baseline, shadow, and promote only
measured improvements — and **no labelled evaluation set exists yet**. Until
one does, no candidate engine can be shown to be better, so building one
would be building on an unmeasurable claim.

## Component inventory

| #   | Component              | Implementation                                      | Model?                   | Production usage  |
| --- | ---------------------- | --------------------------------------------------- | ------------------------ | ----------------- |
| 1   | Source ingestion       | ATS adapters + policy gates                         | Rules                    | **Live**          |
| 2   | Employer identity      | `canonical/employer-identity.ts`                    | Rules + token similarity | **Not wired**     |
| 3   | Job deduplication      | `canonical/job-identity.ts` + DB fuzzy worker       | Rules                    | Partly live       |
| 4   | Title normalisation    | `normalizeTitle()`                                  | Rules                    | Not wired         |
| 5   | Location normalisation | `app.job_locations` + classifier                    | Rules                    | Live              |
| 6   | Remote classification  | `inferRemoteArrangement`                            | Rules                    | Live              |
| 7   | Eligibility            | `canonical/eligibility-evidence.ts` + DB            | Rules                    | Partly live       |
| 8   | Salary extraction      | `canonical/salary-evidence.ts`                      | Rules                    | **Not wired**     |
| 9   | Search retrieval       | Postgres FTS over `search_document`                 | Lexical                  | Live              |
| 10  | Ranking                | `nigeriaValueTier` then `postedAt`                  | Rules                    | **Live (old)**    |
| 10b | Ranking v2             | `search/ranking.ts`                                 | Weighted linear          | Wired since #112, dark behind `FEATURE_EVIDENCE_RANKING` (default false) |
| 11  | Recommendations        | `/matches` deterministic match                      | Rules                    | Live              |
| 12  | Scam detection         | `lib/scam/definitions.ts`                           | Deterministic signals    | Live              |
| 13  | Personalisation        | Candidate profile                                   | Rules                    | Live              |
| 14  | **LLM usage**          | **None found**                                      | —                        | **None**          |
| 15  | Human review           | `audit.job_duplicate_candidates`, moderation queues | —                        | Live              |
| 16  | Evaluation             | **None**                                            | —                        | **None**          |
| 17  | Versioning             | Receipt `parser_version` / `transformation_version` | —                        | Live, unpopulated |
| 18  | Monitoring             | `/admin/source-health`, structured logs             | —                        | Live              |

**The engine contains no machine-learned models and no LLM calls.** Phase 13
of the brief (LLM responsibilities) therefore currently governs nothing. That
is a defensible position for a product whose value is traceability, and it
means "smarter" here cannot mean "add a model" without first building the
ability to tell whether the model helped.

## Measured coverage (production, 2026-08-02)

| Signal                             | Value            | Read                          |
| ---------------------------------- | ---------------- | ----------------------------- |
| Visible jobs                       | 230              |                               |
| Unique visible employers           | 10               | Binding constraint            |
| Top-three employer share           | 84.3%            | Past every alert threshold    |
| Median visible job age             | 173 days         |                               |
| Public jobs with no source receipt | **0**            | Guarantee holds               |
| Eligibility evidence rows          | 1,874 (all jobs) |                               |
| **Salary evidence rows**           | **0**            | No ingested job discloses pay |
| Duplicate candidates pending       | 81               | None auto-merged              |
| Employer aliases recorded          | **0**            | Alias matching unexercised    |
| Employers without verified domain  | 113 of 216       | Domain matching limited       |
| Destinations via aggregator        | 0                |                               |
| Broken apply links                 | 0                |                               |

## What the numbers say about "smarter"

**Salary extraction cannot be improved, because there is nothing to extract.**
Zero ingested jobs disclose pay. A better parser would parse nothing better.
The constraint is supply, not algorithm.

**Employer resolution is largely unexercised.** Zero recorded aliases and 113
of 216 employers without a verified domain mean the resolver runs mostly on
ATS tenant identity — the strongest rung of the ladder, and the one that
needs no cleverness. Fuzzy matching has almost nothing to be clever about
yet.

**Deduplication performs zero automatic merges.** Its false-merge rate is
therefore zero by construction. Any candidate that merges automatically
starts from a perfect false-merge baseline and can only make it worse. That
asymmetry is worth stating before anyone proposes to improve it.

**Ranking has a real, measurable gap.** Production still sorts by eligibility
tier then `postedAt`. `search/ranking.ts` exists, is tested, and is not wired
in. It is the one component where a candidate genuinely exists and a
comparison could be run tomorrow.

## Failure modes found and fixed this session

| Failure                                                                    | Status                    |
| -------------------------------------------------------------------------- | ------------------------- |
| Stale snapshot fell through to a live provider fetch during page render    | Fixed                     |
| Receipt retention of one day silently un-published jobs whose sync slipped | Fixed                     |
| Application tracker rendered from the live job, rewriting user history     | Fixed                     |
| Description rights withheld text the employer publishes deliberately       | Fixed                     |
| Salary slices could be published at identifying granularity                | Rule added, **not wired** |

## The blocker for every later phase

**There is no labelled evaluation set for anything** — no employer-resolution
labels, no eligibility labels, no judged query sets, no salary-extraction
labels. Consequently:

- No precision, recall, false-merge or false-split rate is known.
- No NDCG or precision@K baseline exists.
- None of the brief's promotion gates can be evaluated.
- Shadow mode would produce disagreements nobody could adjudicate.

This is the honest reason Phases 3–19 are not implemented here.

## Recommended order

1. **Wire `ranking.ts` into live search behind a flag**, with before/after
   comparison on real queries. It is the only component with a ready
   candidate.
2. **Build the eligibility labelled set first** — 200–300 jobs hand-labelled
   across the ten categories the brief lists. Nigeria-eligible false
   positives carry the highest cost, so measurement pays first here.
3. **Then employer-resolution labels**, optimising against false merges.
4. Only then consider learned components.

Salary and recommendation work should wait for supply and usage
respectively; both are currently starved of the data that would make them
measurable.
