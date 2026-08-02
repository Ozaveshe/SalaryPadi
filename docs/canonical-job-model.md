# Canonical job model

A canonical job is one real vacancy. Several sources may describe it, each
producing its own immutable receipt; the canonical row is what SalaryPadi
asserts about the vacancy, and every assertion is traceable to at least one
receipt.

## The pipeline, as it actually runs

```
scheduled worker tick
  -> source policy + rights + dependency gate      (fail closed)
  -> per-source budget / distributed fetch claim
  -> documented adapter                            (no generic crawler)
  -> import run outcome                            (complete | partial | failed | timeout | 403 | 429)
  -> ingest.raw_job_records                        latest materialization per source record
  -> ingest.job_source_occurrences                 APPEND-ONLY immutable receipt
  -> normalized app.jobs row
  -> exact fingerprint reconciliation
  -> authority winner: direct > employer ATS > licensed > secondary
  -> ingest.job_occurrence_links                   every occurrence -> canonical job
  -> api.jobs                                      public row with provenance + freshness
```

## Table map

The canonical model was largely already in place. This is the mapping from
the model's responsibilities to the tables that carry them.

| Responsibility          | Table                                                                                   | Notes                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| source_registry         | `app.job_sources`                                                                       | 44 columns incl. rights, authority, policy state                      |
| source_rights_policy    | `app.job_sources` + `app.source_country_rights`                                         | Per-country rights are a subset of source rights, enforced by trigger |
| source_receipt          | `ingest.job_source_occurrences`                                                         | Append-only; UPDATE and DELETE blocked by trigger                     |
| source_job              | `ingest.raw_job_records`                                                                | Latest materialization; history lives in receipts                     |
| canonical_employer      | `app.companies`                                                                         |                                                                       |
| employer_alias          | `app.company_aliases`                                                                   |                                                                       |
| employer_domain         | `app.company_domains`                                                                   | Drives direct-employer destination proof                              |
| canonical_job           | `app.jobs`                                                                              |                                                                       |
| job_source_link         | `ingest.job_occurrence_links`                                                           | Carries `authority` per link                                          |
| eligibility_evidence    | `app.job_eligibility` + `app.job_eligibility_countries`                                 |                                                                       |
| salary_evidence         | `app.job_salary_evidence`                                                               |                                                                       |
| location_evidence       | `app.job_locations`                                                                     |                                                                       |
| employment_arrangement  | `app.jobs.work_arrangement`, `employment_type`, `engagement_type`                       | Columns, not a table: one arrangement per canonical job               |
| application_destination | `app.jobs` URL columns + `application_destination_kind` + `audit.job_apply_link_checks` |                                                                       |
| job_status_event        | `audit.canonical_job_events`                                                            |                                                                       |
| job_freshness_check     | `ingest.raw_job_records` absence counters + `audit.job_apply_link_checks`               |                                                                       |
| employer_claim          | `private.company_claims`                                                                |                                                                       |
| user_contribution       | `private.contributions`                                                                 |                                                                       |
| moderation_record       | `private.moderation_cases`, `moderation_actions`, `moderation_flags`                    |                                                                       |

## Receipts are immutable

`ingest.job_source_occurrences` has a `job_source_occurrences_append_only`
trigger that raises on UPDATE and DELETE. When a listing changes, a new
receipt is written; the previous one stays exactly as captured. The receipt
records:

| Field                                      | Meaning                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `source_id`, `external_source_id`          | Which source, and its own ID for the record           |
| `observation_key`, `import_run_id`         | Idempotency: re-running an import writes no duplicate |
| `observed_at`                              | When SalaryPadi saw it                                |
| `source_published_at`                      | When the source says it was published                 |
| `source_url`, `application_url`            | Where it was read, where it points                    |
| `content_hash`, `dedup_fingerprint`        | Change detection and duplicate detection              |
| `allowed_payload`                          | Only the fields the source's rights permit storing    |
| `parser_version`, `transformation_version` | Which code produced this receipt                      |
| `rights_classification`                    | **The rights regime in force at capture time**        |
| `ingestion_status`                         | accepted, quarantined, rejected, rights_blocked       |

The last two exist because of a real failure mode. Rights on
`app.job_sources` are mutable — on 2026-07-31 nine Greenhouse and Ashby
boards gained description-storage rights. Without a snapshot on the receipt,
every historical receipt would appear to have been captured under the new
regime, and a later audit could not tell which text we were entitled to hold
when. Parser and transformation versions serve the same purpose for logic:
re-parsing history is guesswork unless you know what parsed it.

Legacy receipts have these fields null. They are **not** backfilled, because
the regime in force at capture is genuinely unrecorded and a plausible guess
would be invented evidence.

### Receipts are immutable, but they are not permanent

Immutability and retention are different things, and an earlier version of
this document conflated them. A receipt cannot be altered — the append-only
trigger blocks UPDATE and DELETE from application code — but the lifecycle
worker purges receipts once they pass their source's `raw_retention`.

Until 2026-08-02 every employer-ATS board carried a one-day retention,
inherited from the metadata-only posture they registered under. The
consequences were measured, not theoretical: the entire occurrence table was
one day deep, and because the public view requires a receipt link, a board
whose sync slipped past the purge silently un-published its jobs. Retention
is now 30 days on those boards
(`docs/data/20260802_raise_ats_receipt_retention.sql`).

The audit guarantee is therefore bounded: **every published job is traceable
to a receipt, and receipts are auditable for as long as their source's
retention allows** — not forever.

## Job identity and deduplication

A canonical job is identified by evidence, never by title alone. The
fingerprint combines employer identity, source requisition ID, normalised
title, location, work arrangement, employment type, and the application
destination.

- **Exact fingerprint matches reconcile automatically.**
- **Fuzzy matches never auto-merge.** The nightly worker requires the same
  company, compatible arrangement, the same application host, a different
  application URL, and title similarity ≥ 0.90 — and then writes an
  `audit.job_duplicate_candidates` row for human review. There are 81 such
  candidates pending; none has been merged by a machine.

Every merged job keeps its provenance: each occurrence retains its link row,
including links that lost the authority contest.

## Authority: which source describes the job

`direct_employer > employer_ats > licensed_partner > secondary_feed`

The winner supplies the canonical assertions. Losing occurrences are kept and
remain queryable — they are evidence that the vacancy was seen elsewhere, not
noise to discard.

## Verified state (2026-08-01)

Measured by `scripts/canonical-reconciliation.mjs`:

| Figure                                     | Value                 |
| ------------------------------------------ | --------------------- |
| Immutable receipts                         | 3,609                 |
| Publicly visible jobs                      | 230                   |
| **Public jobs with no receipt link**       | **0**                 |
| Held records without receipt links         | 955 (never public)    |
| Destinations classified                    | 1,875 of 1,875        |
| Destinations via an aggregator             | 0                     |
| Broken destinations                        | 0                     |
| Duplicate candidates pending review        | 81 (none auto-merged) |
| Canonical employers / with verified domain | 216 / 103             |
| Salary evidence rows                       | 0                     |

Three of these deserve reading carefully rather than as failures:

- **955 held records without receipt links** are not published. They are
  stored-but-withheld rows, mostly roles awaiting a country pack. The
  guarantee that matters is the one above it: _zero published jobs lack a
  receipt._
- **0 salary evidence rows** means no currently ingested vacancy discloses
  pay in a form we may store. That is an honest absence; filling it with an
  estimate is what the model exists to prevent.
- **113 employers without a verified domain** is a real gap, and it is why 55
  jobs are classified `external_board` when their destination is in fact the
  employer's own site. Fixing the label requires a citation, not a code
  change, and the system correctly under-claims until one exists.
