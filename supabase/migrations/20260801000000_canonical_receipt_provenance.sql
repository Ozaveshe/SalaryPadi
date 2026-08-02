-- Canonical data model: close the two auditability gaps found when the
-- existing lifecycle was traced against the canonical-model requirements.
--
-- Gap 1 — receipts recorded WHAT was captured but not HOW or UNDER WHAT
-- RIGHTS. `ingest.job_source_occurrences` is already append-only and
-- immutable (trigger `job_source_occurrences_append_only` blocks UPDATE and
-- DELETE), but rights classification lived only on the mutable
-- `app.job_sources` row. When a source's rights change — as they did on
-- 2026-07-31 when Greenhouse and Ashby boards gained description storage —
-- every historical receipt silently appears to have been captured under the
-- new regime. A receipt must carry the rights it was taken under, and the
-- parser and transformation versions that produced it, or re-parsing history
-- is guesswork.
--
-- Gap 2 — application destinations stored a URL and a health state but never
-- WHAT KIND of destination it is. Without that, "do not send a user through
-- an unnecessary intermediary when a verified direct destination exists"
-- cannot be evaluated in data, only eyeballed.
--
-- Every column is nullable. Legacy receipts genuinely do not know which
-- parser version produced them, and backfilling a guess would be inventing
-- evidence to complete legacy records.

begin;

alter table ingest.job_source_occurrences
  add column if not exists parser_version text,
  add column if not exists transformation_version text,
  add column if not exists rights_classification text,
  add column if not exists source_published_at timestamptz,
  add column if not exists ingestion_status text;

comment on column ingest.job_source_occurrences.parser_version is
  'Adapter/parser build that produced this receipt. Null for receipts captured before provenance versioning.';
comment on column ingest.job_source_occurrences.transformation_version is
  'Normalization contract version applied to this receipt.';
comment on column ingest.job_source_occurrences.rights_classification is
  'The source rights regime in force AT CAPTURE TIME, snapshotted because app.job_sources rights are mutable.';
comment on column ingest.job_source_occurrences.source_published_at is
  'Publication timestamp asserted by the source, distinct from observed_at.';
comment on column ingest.job_source_occurrences.ingestion_status is
  'Outcome of ingesting this receipt: accepted, quarantined, rejected, or rights_blocked.';

alter table ingest.job_source_occurrences
  add constraint job_source_occurrences_rights_classification_known
  check (
    rights_classification is null
    or rights_classification in (
      'direct_employer_authorized',
      'public_ats_permitted',
      'licensed_partner',
      'user_submitted',
      'factual_link_only',
      'metadata_only',
      'review_required',
      'prohibited',
      'disabled'
    )
  );

alter table ingest.job_source_occurrences
  add constraint job_source_occurrences_ingestion_status_known
  check (
    ingestion_status is null
    or ingestion_status in (
      'accepted',
      'quarantined',
      'rejected',
      'rights_blocked'
    )
  );

-- Destination typing. Kept as a column on app.jobs rather than a new table:
-- a canonical job has exactly one current apply destination, the check
-- history already lives in audit.job_apply_link_checks, and a separate table
-- would add a join to the hottest read path on the site for no new fact.
alter table app.jobs
  add column if not exists application_destination_kind text;

comment on column app.jobs.application_destination_kind is
  'What kind of destination the apply URL resolves to. Drives the preferred-destination rule: a direct employer or ATS destination outranks an intermediary.';

alter table app.jobs
  add constraint jobs_application_destination_kind_known
  check (
    application_destination_kind is null
    or application_destination_kind in (
      'direct_employer',
      'employer_ats',
      'agency',
      'email',
      'external_board',
      'aggregator'
    )
  );

commit;
