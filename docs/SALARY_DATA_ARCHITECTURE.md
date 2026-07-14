# Salary data architecture

SalaryPadi has two salary evidence lanes. They share search and presentation,
but they do not share provenance, privacy rules, or ingestion.

## Lane 1: first-party contributions

An authenticated user submits a salary record. The raw record remains private,
is moderated, and contributes to a public cell only after the existing privacy
threshold, publication lag, age window, deduplication, and rounding rules pass.
An individual record is never exposed through the public API.

Public label: **SalaryPadi community — privacy-thresholded approved
contributions**.

## Lane 2: verified online benchmarks

An external benchmark must come from an official statistics publisher, a
written licence, or a verified employer authorization. SalaryPadi uses a
source-specific adapter; it does not run a generic crawler. Every normalized
row retains the publisher, source URL, methodology, original period and amount,
reference dates, retrieval time, source role code/label, normalization version,
and assumptions.

The source registry and each normalized row must both pass review. A successful
download only puts a row into the review queue. It does not make the row public.
Changed values or normalization versions return an already-approved row to
pending review.

Public label: **Verified online benchmark — named publisher and methodology**.

## Why the lanes are separate

- External aggregates do not count toward a contributor privacy threshold.
- A government occupation estimate is not a company salary and is never
  displayed as one.
- A source can be technically reachable while its reuse rights, methodology, or
  mapping is not ready. Reachability is not activation.
- SalaryPadi does not scrape or copy Glassdoor, LinkedIn, Indeed, Levels.fyi, or
  another community salary/review product without an explicit licence.
- Market, company, role, geography, pay period, gross/net basis, and freshness
  remain separate facts instead of being collapsed into one “verified” badge.

## Automation boundary

`salary-source-sync` is scheduled daily and disabled by default with
`SALARY_SOURCE_SYNC_ENABLED=false`. It reads only sources that the database
marks enabled after a current rights review. Each adapter is code-owned and
host/format specific. Inserting a URL cannot create a crawler.

The first candidate registry is `config/salary-sources.json`:

- U.S. Bureau of Labor Statistics OEWS;
- UK Office for National Statistics ASHE;
- Statistics Canada employee wages by occupation;
- Statistics South Africa Quarterly Employment Statistics.

All four remain `draft`. This is deliberate: each still needs its exact licence
attribution, release-file parser, occupation mapping, quality/suppression rules,
and normalization tests before activation. Stats SA QES is industry-level and
must never be presented as role- or company-level evidence.

## Data flow

```text
official/licensed source
  -> code-owned adapter and schema validation
  -> private sync run + text-free rejection diagnostics
  -> normalized pending benchmark
  -> human methodology/provenance review
  -> current approved benchmark
  -> public salary search with source and evidence-lane label
```

## Activation checklist

1. Confirm the source licence or written authorization and required attribution.
2. Pin the exact dataset/release identifier and expected content type.
3. Implement a source-specific parser with bounded download and row limits.
4. Map source occupation codes to SalaryPadi role families with reviewed tests.
5. Preserve source suppression and quality markers; reject ambiguous values.
6. Prove original and annualized values with versioned assumptions.
7. Run a private import, inspect every rejected category, and approve a sample.
8. Enable the source and worker separately.
9. Verify the scheduled run, pending-review queue, public labels, and rollback.

No source should be described as live until those steps have production proof.
