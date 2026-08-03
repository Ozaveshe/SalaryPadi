# Product metrics

## North star

**Verified eligible application clicks per active job seeker.**

Not job count, not page count, not sessions. The metric asks whether a real
person reached a real opening they could actually apply for — which is the
only outcome SalaryPadi exists to produce.

A click counts only when **all** of these hold:

| Condition                                    | Enforced by                                        |
| -------------------------------------------- | -------------------------------------------------- |
| Canonical, non-duplicate job                 | `job-identity.ts`, `non_duplication` gate          |
| Working application destination              | `apply_link_state`, `application_destination` gate |
| Eligibility appropriate to the user's filter | `quality-gates.ts` + eligibility taxonomy          |
| Recent source verification                   | per-source freshness window                        |
| Valid apply-out event                        | analytics taxonomy                                 |

Repeated clicks within one session on the same job count once. Someone
opening a listing three times to reread it has had one outcome, not three,
and counting it three times would make a confusing page look like a
successful one.

## Why inventory is not the metric

The 2026-08-02 coverage audit is the argument: 230 visible jobs across **10
employers**, three of them holding **84.3%**, with a **median visible age of
173 days**. Every one of those is a large number in some report and a bad
experience for a job seeker. A metric that rises when we add another 500
stale listings from one employer is measuring the wrong thing.

## Supporting metrics

Inventory: active jobs, unique employers, new jobs/day, median job age.

Truth: Nigeria-eligible %, Africa-eligible %, eligibility-unclear %,
salary-disclosed %, direct-apply %, apply-link failure rate, duplicate rate.

Concentration: employer concentration, source concentration — both already
computed by `measureConcentration()` with alerts at 25% single / 60% top three.

Funnel: search→job view, job view→apply, save rate, alert creation, alert
click-through, return rate, tracker activation, offer comparisons,
contribution completion, employer claim conversion.

Segment by job function, seniority, location, eligibility state, source type,
employer, device and acquisition channel.

## Analytics constraint

Segmentation must not become a privacy leak. The current architecture makes
that structurally hard: analytics properties are validated at the call site
and **never transmitted** — the body carries only event name and path, and
Google receives the event name alone. Any new segmentation must preserve that
property rather than route around it.

## Prohibited states are tested, not documented

`src/lib/quality/prohibited-states.test.ts` encodes twelve ways the product
could lie to a user as executable assertions over the modules that make each
decision — a source failure becoming zero jobs, an unclear job promoted as
eligible, a broken link presented as verified, a sponsored job in organic
results, a contribution published below threshold, employer content reading
as independent evidence, an assumption becoming an employer fact, a
placeholder page entering the index.

They are written against the deciding module rather than a rendered page, so
a regression fails at the source and names the rule it broke.

This complements `prohibited-labels.test.ts`, which guards customer-facing
_language_. That guards words; this guards claims.

## Not yet built

- Event taxonomy versioning and the per-event required/prohibited field
  contract.
- The data-quality scorecard as a running dashboard (the queries exist in
  `scripts/canonical-reconciliation.mjs`).
- CI release gates for structured data, performance budget and accessibility.
- Production monitoring and alerting.
- Feature flags for the ranking engine and monetisation.
