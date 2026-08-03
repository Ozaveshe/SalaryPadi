# Career engine risk register

Ordered by cost to a user, not by likelihood.

| #   | Risk                                               | Cost if it happens                                                                   | Current control                                                                            | Residual                                     |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | A job is marked Nigeria-eligible without evidence  | Someone spends an afternoon on an application they could never win                   | Bare "Remote" resolves to unclear; explicit exclusion beats inclusion; both pinned by test | Low                                          |
| 2   | Two employers are merged wrongly                   | Salary, review and interview evidence transfers between companies; near-irreversible | Fuzzy matching only proposes; parent/subsidiary merges refused outright                    | Low                                          |
| 3   | An undisclosed salary is presented as disclosed    | Destroys the core claim of the product                                               | Origin tagging; weakest-input rule; zero disclosed rows today                              | Low                                          |
| 4   | A source outage renders as "no jobs"               | Tells a job seeker the market is dead when the pipeline broke                        | Five freshness states; a failed read can never reach confirmed-empty                       | Low                                          |
| 5   | A contribution is identifiable from an aggregate   | Real-world consequences for the contributor                                          | Per-metric thresholds, 24-hour lag, shape suppression                                      | **Medium — rule not wired into the worker**  |
| 6   | A paid job outranks organically                    | Silently turns the product into an ad marketplace                                    | Sponsored partitioned into a separate list; no combined array exists to render by accident | Low                                          |
| 7   | An employer edits independent evidence             | Trust data becomes marketing                                                         | Field boundary, fail-closed by default                                                     | **Medium — not wired into admin write path** |
| 8   | A ranking change degrades eligibility precision    | Invisible; looks like an engagement win                                              | **None — no labelled set**                                                                 | **High**                                     |
| 9   | A candidate model is promoted on unmeasured claims | Compounds silently across every later change                                         | **None — no evaluation harness**                                                           | **High**                                     |
| 10  | Receipt purge un-publishes live jobs               | Inventory vanishes with no error anywhere                                            | Retention raised to 30 days                                                                | Low                                          |

## The two high risks share one cause

Risks 8 and 9 are both "we cannot tell whether a change helped." Neither is
fixed by more sophisticated modelling; both are fixed by labelled data and an
evaluation harness.

Any work that adds engine capability before that lands **increases risk 9
rather than reducing risk 8**. That is the argument for building the
evaluation set before the engine.

## Rules that must survive any v2

- Unknown stays unknown. Reducing the unknown rate is not itself a win.
- Nigeria-eligible false positives cost more than false negatives.
- False employer merges cost more than false splits.
- No LLM output becomes a public claim without a source receipt and an
  evidence span.
- Sponsored placement never touches an organic score.
- An engine output without traceable evidence is never presented as verified.
