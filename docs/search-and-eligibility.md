# Search and eligibility

Entry point; depth in [search-ranking.md](search-ranking.md) and
[eligibility-taxonomy.md](eligibility-taxonomy.md).

## Eligibility (2026-08-09 model)

Two layers, one derivation:

- The **axes** (`nigeria`, `africa`: eligible / not_eligible / unclear)
  answer "may this applicant apply". Generic "remote" never becomes
  eligible; an explicit NG exclusion beats everything.
- The **basis** (`nigeriaEligibilityBasis`: explicit / africa_wide /
  worldwide_reviewed) answers "on what evidence". Every surface that claims
  *explicit* Nigeria evidence reads the basis: the "Nigeria named by the
  source" filter, the badge copy ("Applicants in Nigeria can apply" vs
  "Open to applicants worldwide" vs "Open to applicants across Africa"),
  and the ranking rungs. `nigeria_open` is the broad union filter and the
  homepage/alerts default. A named-countries role excluding Nigeria renders
  neutral, never success, and a consistency test pins card tone against
  ranker state.

## Search

- Live order: relevance → `nigeriaValueTier` → recency; in-memory over the
  assembled feed. The evidence ranker (8 weighted signals) is wired behind
  `FEATURE_EVIDENCE_RANKING`, default off everywhere; before enabling it,
  fix its adapter's constant inputs (`applyLinkState: "unchecked"`,
  `employerVerified: false`, unfed location/preference weights).
- Diversity reordering applies only to `sort=relevance`; "Newest posted" and
  "Highest salary" are honoured verbatim.
- Failure states: a failed read is "Unavailable", partial is labelled, and
  the copy states it is not evidence that no jobs exist — CI-tested.

## Known gaps

Missing filters: not-eligible, direct-employer, employer-verified, salary
max, industry. No feed-level `stale` state. The per-employer cap /
"more from this employer" affordance and the concentration alerts
(`serving/result-diversity.ts`) remain unwired.
