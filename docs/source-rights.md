# Source rights

Rights decide whether a record may be published at all. They are the first
gate in the pipeline and the one that is never widened to raise a job count.

**Technical accessibility is not permission.** That a board answers an HTTP
request says nothing about whether its content may be republished.

## Classifications

Defined in [`src/lib/canonical/source-rights.ts`](../src/lib/canonical/source-rights.ts).
Each grants exactly what it states; anything unstated is not granted.

| Classification               | Publish | Store description | Index | JobPosting |
| ---------------------------- | ------- | ----------------- | ----- | ---------- |
| `direct_employer_authorized` | yes     | yes               | yes   | yes        |
| `public_ats_permitted`       | yes     | yes               | yes   | yes        |
| `licensed_partner`           | yes     | yes               | yes   | yes        |
| `user_submitted`             | yes     | yes               | yes   | yes        |
| `factual_link_only`          | yes     | no                | no    | no         |
| `metadata_only`              | yes     | no                | no    | no         |
| `review_required`            | no      | no                | no    | no         |
| `prohibited`                 | no      | no                | no    | no         |
| `disabled`                   | no      | no                | no    | no         |

Two invariants are enforced by test:

- **Structured data requires description rights.** Google's JobPosting markup
  requires a description; emitting it without the right to store one would
  publish an empty or placeholder claim as a rich result.
- **Indexing requires publication.** A page that may not be shown may not be
  indexed.

## Fail closed

`mayPublishUnderRights()` returns false for null, empty and unrecognised
values. The absence of a recorded right is not the presence of one.

This matches the database, where a source must satisfy all of: `policy_state
= 'enabled'`, `status = 'active'`, a future `policy_review_due_at`, non-empty
`allowed_fields`, evidenced dependencies, and a current authorization review.
Failing any one stops the source before a provider request is made.

## Rights are enforced at three layers

1. **Registry** — `config/job-source-policy-registry.json`, the machine source
   of truth for what each adapter may do.
2. **Database** — triggers on `app.job_sources`, `app.source_country_rights`
   and `ingest.raw_job_records` reject writes that exceed recorded rights.
3. **Environment** — per-source kill switches.

These are deliberately not collapsed into one check. Each can independently
stop a source, and an error in one does not open the gate.

## Rights change over time, so receipts snapshot them

`app.job_sources` rights are mutable. On 2026-07-31 nine Greenhouse and Ashby
boards moved from metadata-only to description-storing. Receipts captured
before that change were taken under different permissions.

Every new receipt therefore records `rights_classification` as it was **at
capture time**. Historical receipts carry null and are not backfilled: what
regime applied is genuinely unrecorded, and a guess would be invented
evidence.

## Per-country rights

`app.source_country_rights` narrows source rights per market and can never
exceed them — enforced by a subset check in the database. A source permitted
to store descriptions globally can still be limited to metadata in a specific
country.

## Disabled sources stay disabled

The following are switched off and may not be re-enabled to increase supply:

| Source              | Why                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **SmartRecruiters** | The public Posting API is transport documentation, not republication permission. Probing also found zombie boards carrying year-old postings. |
| **Jooble**          | Partner API terms have not been obtained or reviewed.                                                                                         |
| **Remotive**        | Its API page and general terms contradict each other on republication; written clarification was never received.                              |
| **ReliefWeb**       | Content carries information partners' rights and an app name must be pre-approved.                                                            |

Re-enabling any of them requires a completed rights review recorded in the
registry and the policy matrix — never a job-count argument.

## Adding a source

1. Confirm the licence permits the intended use, in writing. If it cannot be
   confirmed, the source is not used.
2. Probe real data first: wrong-company tenants and zombie boards are
   rejected before registration.
3. Register as draft → configure → re-review → activate → grant country
   rights and evidence dependencies.
4. Confirm with `security.authorized_ats_source_config_rows()`.

Registration deliberately revokes the authorization review when configuration
changes, pausing the source until it is re-reviewed. That is the system
working, not a bug — it has surfaced twice in production changes.
