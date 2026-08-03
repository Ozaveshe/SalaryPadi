# Contribution privacy

## What already existed

`api.privacy_thresholds` is a versioned, per-metric table — not a single
global number. Measured on 2026-08-02:

| Metric                         | Distinct contributors | For a range | Max age   |
| ------------------------------ | --------------------- | ----------- | --------- |
| `salary_employer_role_country` | 3                     | 5           | 36 months |
| `company_overall_rating`       | 5                     | 5           | 36 months |
| `interview_aggregate`          | 3                     | 5           | 36 months |
| `company_benefit_aggregate`    | 5                     | 5           | 36 months |
| `pay_reliability_aggregate`    | 5                     | 10          | 24 months |

Every metric also carries a **24-hour minimum publication lag**, which
defends against timing attacks: without it, watching a cell change the moment
after someone submits attributes the figure to them.

Pay reliability is deliberately the strictest — allegations about an employer
failing to pay people are the most damaging thing on the platform if wrong,
and the most identifying if the cohort is small.

## What was missing: shape

Thresholds answer _"are there enough people in this cell?"_ They do not
answer the harder question: **"does this cell describe so few people that
naming it identifies them, however many submissions it holds?"**

A median for `Employer · Senior Backend Engineer · Yaba office · March 2026`
with twelve submissions is still a statement about a team small enough that
its members can work out each other's pay. Counting harder does not fix it —
the slice itself is the disclosure.

[`src/lib/contributions/slice-privacy.ts`](../src/lib/contributions/slice-privacy.ts)
decides publishability from the **shape** of a slice, before any count is
consulted.

### Never published, at any count

| Dimension      | Why                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------- |
| `office`       | Names a group of colleagues who already know each other's roles                          |
| `team`         | As above, more so                                                                        |
| `period_month` | Employer plus one month lets anyone who knows a joiner's start date attribute the figure |

### Narrowing dimensions

`employer`, `city`, `seniority` and `employment_type` are each safe alone but
compound. **More than two together is not published at any count** — that
combination describes a handful of named people at the size of company
SalaryPadi actually covers, which is far smaller than the multinationals
these thresholds are usually designed around.

A slice with no narrowing dimensions is _general_ (5 contributors). One or
two makes it _sensitive_ (10).

### One more trap

A "general" `role + country` cell drawn from a **single employer** is an
employer cell wearing a disguise, and is refused even above threshold.

## Shape is decided before size, on purpose

`assessSlice()` never sees the contributor count. Keeping the two apart means
a large cohort cannot argue its way past a shape that should never be
published — the count check happens afterwards, against the minimum that
shape earns.

## Public messages never leak the count

"Two more contributors needed" tells the reader how many people are in the
cell, which is itself a disclosure about a small group. Suppressed cells say
only:

> Insufficient verified data to publish a figure yet.

and for an unpublishable shape:

> We do not publish pay figures at this level of detail, to protect the people
> who contributed them.

The operator-facing `reason` carries the real numbers; the public message is
asserted by test to contain no digits.

## Still to build

- Verification-evidence retention automation (payslips, offer letters) with
  scheduled deletion.
- Wiring `decidePublication()` into the aggregate snapshot worker, which
  currently applies the threshold table alone.
- Contribution export and per-item deletion flows.
