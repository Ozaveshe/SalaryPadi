# Contribution privacy

## What already existed

`api.privacy_thresholds` is a versioned, per-metric table — not a single
global number. Measured on 2026-08-02:

| Metric                         | Distinct contributors     | For a range | Max age   |
| ------------------------------ | ------------------------- | ----------- | --------- |
| `salary_employer_role_country` | 3 (10 naming an employer) | 5           | 36 months |
| `company_overall_rating`       | 5                         | 5           | 36 months |
| `interview_aggregate`          | 3                         | 5           | 36 months |
| `company_benefit_aggregate`    | 5                         | 5           | 36 months |
| `pay_reliability_aggregate`    | 5                         | 10          | 24 months |

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

A slice with no narrowing dimensions is _general_. One or two makes it
_sensitive_. The module carries default counts (5 and 10);
`app.privacy_rule_versions` is the authority per metric, so a threshold can
be changed by a reviewed rule row rather than a deploy.

### One more trap

A `role + country` cell drawn from a **single employer** is an employer cell
wearing a disguise, and is refused even above threshold.

This check used to be gated on the general tier, which meant any slice
carrying a narrowing dimension escaped it — precisely the slices where the
disguise matters more. It now applies to every slice that does not name its
employer.

## What the worker enforces (2026-08-03)

`security.refresh_salary_aggregates()` is the worker that publishes salary
figures. It applied the threshold table alone. It now applies the shape rule
too:

| Cell              | Requirement                                           |
| ----------------- | ----------------------------------------------------- |
| Names an employer | `min_sensitive_contributors` (10)                     |
| Names no employer | `min_distinct_contributors` (3) **and** ≥ 2 employers |
| Office-scoped     | Never released, at any count                          |

The employer threshold is the change with product consequences: a company
median used to publish off three people and now needs ten. Three colleagues
at one Nigerian company can identify each other's pay from a median; that is
the disclosure the count was supposed to prevent.

`app.salary_aggregate_snapshots` carries an `office_id` column, so the
office rule is enforced by a **check constraint** as well as by the worker —
`not (is_released and office_id is not null)`. A cell at that granularity may
be computed; it may never be released.

The employer-spread rule counts _identified_ employers. Contributions that
name no employer cannot be shown to come from different ones, so they do not
count towards the spread and a cell of entirely anonymous-employer
contributions fails closed.

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
- The same shape gate for the review, interview, benefit and pay-reliability
  workers. Only the salary worker enforces it today.
- Contribution export and per-item deletion flows.
