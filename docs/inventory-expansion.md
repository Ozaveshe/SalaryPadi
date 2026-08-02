# Inventory expansion

The target is 20,000 active, useful jobs. The audit
([`coverage-metrics.md`](./coverage-metrics.md)) says the constraint is not
what it looks like, so this document starts with what the numbers actually
force.

## What the audit changed about the plan

**Publishing everything currently held gives 1,130 jobs — 5.6% of target.**
So the gap is genuine supply, not locked-up inventory. But the shape of the
supply matters more than the volume:

- **10 employers hold all 230 visible jobs**, three of them 84.3%. Adding one
  more large board makes the product worse, not better: concentration is
  already past every alert threshold.
- **Median visible job age is 173 days.** Nineteen jobs arrived last week.
  Refresh rate, not catalogue size, is why the site looks quiet.
- **654 of 900 held jobs are Egyptian**, in a country pack that is not
  activated. That is the largest single lever available and the one most
  constrained by review.

## Ordering of work, by leverage

1. **More employers, smaller each.** The discovery queue
   ([`employer-discovery.ts`](../src/lib/serving/employer-discovery.ts))
   scores Nigerian presence at +40 and a direct ATS board at +25, while
   capping raw volume at +10 — deliberately, because uncapped volume is what
   produced the current concentration.
2. **Refresh rate before catalogue size.** A stale job that passes every gate
   still fails the reader. Freshness targets are in the metrics doc.
3. **Country packs**, on evidence and never on a number.
4. **New ATS adapters**, which widen the funnel but do not by themselves add
   a single employer.

## Growth that does not bypass anything

Every added job passes the same ten gates
([`job-quality-gates.md`](./job-quality-gates.md)). Nothing in the expansion
path can widen them:

- Discovery **proposes**; a person registers. `scoreEmployerCandidate()`
  returns `reviewable`, never `publishable`, and there is a test asserting
  the result object has no publication field at all.
- Registration goes through the existing recipe, including the deliberate
  pause when configuration changes.
- Rights classification is checked at ingest and snapshotted onto every
  receipt.

## Guardrails against fake growth

| Failure mode                             | What stops it                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Re-enabling a disabled source for volume | Rights review required; four sources named and reasoned in `source-rights.md` |
| Registering a dormant board              | Discovery blocks a board whose newest posting is over 180 days old            |
| Registering a wrong-company tenant       | Discovery blocks a candidate with neither domain nor ATS tenant               |
| Counting duplicates                      | `non_duplication` gate, plus fuzzy matches going to review not merge          |
| Counting stale jobs                      | Per-source freshness window in the gate                                       |
| One employer flooding results            | Per-employer cap of 3 in the leading 20 results                               |

## Measuring progress honestly

Total inventory is explicitly not the success metric. The targets table in
[`coverage-metrics.md`](./coverage-metrics.md) pairs every volume number with
a quality number — employer count, concentration share, median age, salary
disclosure, apply-link health, and the invariant that no public job lacks a
source receipt.

A run that doubles inventory while pushing top-three concentration above 84%
has failed, and the metrics say so.
