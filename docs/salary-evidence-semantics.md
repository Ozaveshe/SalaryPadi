# Salary evidence semantics

Entry point; architecture in
[SALARY_DATA_ARCHITECTURE.md](SALARY_DATA_ARCHITECTURE.md), privacy in
[contribution-privacy.md](contribution-privacy.md).

## Lanes

Two stored lanes with schema-enforced separation
(`first_party_contributions` may not carry a source URL;
`verified_online_benchmark` must carry all four source fields), presented as
three labelled lanes (local community evidence / disclosed-pay jobs /
international benchmarks) that are never merged into one market number.
Estimates exist only as presentation (`estimateNairaTakeHome`, labelled
"(est.)" with assumptions disclosed).

## Dates

`app.salary_benchmarks` stores the full set: `effective_from/to` (reference
period), `source_published_at`, `retrieved_at`, `reviewed_at`; first-party
snapshots carry `computed_at`. Publishing requires `reviewed_at` and
`source_published_at`.

**Known defects to fix before the first benchmark source goes live** (all
four registry sources are still draft):

1. The public view substitutes `retrieved_at` for `calculated_at`, and the
   card labels it "Calculated" — a download time shown as a computation time.
2. `source_published_at` and `reviewed_at` are not projected publicly.
3. No forecast-period semantics exist: nothing prevents a future
   `effective_to`, and a projected figure would render as observed evidence.

## Privacy thresholds

`app.privacy_rule_versions` drives the workers: 3 distinct contributors
across ≥2 employers for role-and-country cells, **10** for employer-named
cells, range percentiles suppressed below their own minimum, office-scoped
cells refused outright, shape suppression for identifying slices.
Sub-threshold counts never appear publicly, and public copy no longer quotes
a hard-coded number. The dead TypeScript mirror
(`salaries/aggregate.ts`, hard-coded 3) should be deleted or wired before
anyone imports it.
