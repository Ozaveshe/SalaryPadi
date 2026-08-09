# Job quality gates

Inventory growth is the easiest thing in this product to fake. A job count
rises just as readily from stale, duplicated and un-appliable listings as
from real ones, and the difference is invisible in the number. These gates
are what make the number mean something.

Specified and tested in
[`src/lib/serving/quality-gates.ts`](../src/lib/serving/quality-gates.ts) — a
specification under test, not the shipped gate. The gates production actually
enforces live in the database: the `jobs_public_read` policy (published,
open, non-fixture, deadline, cached provenance, and — since
`20260809130000` — the apply link not confirmed broken), the per-source
rights functions behind the provenance cache, and the lifecycle worker's
closure rules.

## The ten gates, in evaluation order

Order is deliberate: a rejection reason is always the _first_ thing wrong,
not whichever check happened to run first.

| #   | Gate                         | Fails when                                             |
| --- | ---------------------------- | ------------------------------------------------------ |
| 1   | `source_rights`              | The source's recorded rights do not permit publication |
| 2   | `employer_identity`          | No canonical employer resolved                         |
| 3   | `job_identity`               | No canonical job identity assigned                     |
| 4   | `application_destination`    | No destination, or the last check found it broken      |
| 5   | `freshness`                  | Never confirmed, or outside this source's own window   |
| 6   | `minimum_content`            | Title under 3 characters or description under 140      |
| 7   | `location_representation`    | No location evidence                                   |
| 8   | `eligibility_representation` | Explicitly excludes Nigeria, or states nothing at all  |
| 9   | `non_duplication`            | Already represented by another canonical job           |
| 10  | `safety`                     | Held by scam or risk screening                         |

Rights is first because nothing else matters if we may not publish at all.

## What is deliberately not a gate

**Salary.** Most Nigerian postings do not disclose pay — the audit found
zero disclosed among ingested jobs. Requiring it would empty the board while
teaching employers nothing. Undisclosed pay is shown as undisclosed.

**Unclear eligibility.** A job whose wording does not resolve to a country
rule is still real work, and hiding it serves nobody. It publishes, clearly
marked, and is never promoted into a Nigeria-eligible collection.

## Publishable is not promotable

`evaluateQualityGates()` returns an `eligibilityCollection` alongside the
verdict, and `mayEnterNigeriaCollection()` is a separate function precisely
so a caller cannot treat one permission as the other. Appearing in a
Nigeria-eligible collection is itself a claim that the reader can apply.

| Eligibility evidence        | Publishes?  | Nigeria collection? |
| --------------------------- | ----------- | ------------------- |
| Explicitly Nigeria-eligible | Yes         | Yes                 |
| Africa-eligible             | Yes         | No                  |
| Global remote               | Yes         | No                  |
| Unclear                     | Yes, marked | **No**              |
| Not stated                  | No          | No                  |
| Explicitly excludes Nigeria | No          | No                  |

## Freshness is per source

The window is a property of the source, not a global constant: a board
permitted four requests a day cannot be held to an hourly standard. A job
outside its own source's window fails the gate; a source that is merely
unreachable does not close anything, which is enforced separately in the
lifecycle service.

## Reporting

`summariseGateOutcomes()` aggregates verdicts into counts per gate, so the
operational dashboard can show _where_ jobs die rather than only how many
survived. A sudden spike in `application_destination` rejections is an ATS
change; a spike in `source_rights` is a policy change.
