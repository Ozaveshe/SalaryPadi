# Search ranking

## What this replaced

The previous order was `nigeriaValueTier(b) - nigeriaValueTier(a) ||
Date.parse(b.postedAt) - Date.parse(a.postedAt)` — eligibility bucket, then
recency. That makes the newest job in a bucket the best job in that bucket,
which is true only by accident. A freshly ingested listing with no salary, an
unverified apply link and a vague location outranked a three-week-old role at
a verified employer that states its pay.

Implemented in [`src/lib/search/ranking.ts`](../src/lib/search/ranking.ts).

## The stages

1. Query parsing (existing synonym layer, `search-synonyms.ts`)
2. Candidate retrieval (Postgres full-text, `search_document`)
3. **Hard filters** — eligibility, status, rights. Nothing below can rescue a
   job that fails these.
4. Relevance ranking
5. Quality and freshness reranking
6. Diversity adjustment (`result-diversity.ts`)
7. Personalisation, opt-in only
8. Explainable presentation

Stages 3 and 4-7 are deliberately separate: a filter is a fact about whether
a job belongs in the result set, a score is an opinion about its order. Mixing
them lets a strong opinion smuggle in an ineligible job.

## Weights

| Signal              | Weight | Why                                             |
| ------------------- | ------ | ----------------------------------------------- |
| Text relevance      | 30     | What the user asked for                         |
| **Eligibility**     | **25** | The question the product exists to answer       |
| Freshness           | 15     | Posted age and confirmation age, weighted 60/40 |
| Preference          | 12     | Opt-in only; zero when personalisation is off   |
| Source reliability  | 10     | Direct employer > ATS > licensed > secondary    |
| Apply quality       | 8      | Destination kind × link health                  |
| Salary transparency | 6      | Rewards disclosure without requiring it         |
| Location match      | 4      |                                                 |

Eligibility carries the second-largest weight on purpose: a perfectly
relevant job a Nigerian cannot apply for is worth less than a slightly less
relevant one they can.

## Eligibility ladder

| State                                | Score |
| ------------------------------------ | ----- |
| Nigeria explicitly accepted          | 1.0   |
| Africa explicitly accepted           | 0.8   |
| Global remote, restrictions reviewed | 0.6   |
| Local presence required              | 0.3   |
| Eligibility unclear                  | 0.25  |
| Not eligible for Nigeria             | 0     |

Unclear is deliberately mid-low rather than zero. These are real jobs, and
scoring them at zero would bury them out of existence — which hides work from
people who might qualify. They rank below anything explicit and are never
promoted into an explicitly-eligible collection.

## Freshness

Posted age and confirmation age are scored separately, then combined 60/40.
An older posting the source still lists today is more trustworthy than a
recent one nobody has re-checked. Unknown age scores 0.5 — neither fresh nor
stale — rather than defaulting to either extreme.

## Rules the weights cannot break

Enforced by test, not convention:

- **A broken apply link scores zero application quality.** A job nobody can
  apply to does not rank on the strength of its title.
- **A verified employer cannot outrank eligibility.** Verification is folded
  into source reliability at ×1.1 rather than given its own weight.
- **Preference cannot rescue an ineligible job.** Opted-in personalisation
  reorders jobs a user could take; it does not surface ones they cannot.
- **Ties break on recency, then job id** (`rankJobs`), so equal-evidence jobs surface newest-first and pagination stays stable.

## Sponsored placement

`rankJobs()` returns `{ organic, sponsored }` — two lists, never one.

Sponsorship contributes **nothing** to the score; a sponsored job and an
identical organic job score identically, and a test asserts it. There is no
combined array a caller could render by accident, which is a stronger
guarantee than a flag someone must remember to check.

## Explanations

`explainRanking()` returns the largest contributors in consumer language —
"You can apply from Nigeria", "Salary is disclosed", "Applies directly to the
employer". Never weights, never raw scores, never internal component names.
