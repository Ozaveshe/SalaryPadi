-- SalaryPadi canonical data-model reconciliation
-- Regenerate with: node scripts/canonical-reconciliation.mjs
select
  (select count(*) from ingest.job_source_occurrences) as source_receipts_inspected,
  (select count(*) from app.jobs) as canonical_jobs,
  (select count(*) from api.jobs) as publicly_visible,
  (select count(*) from api.jobs pj
     where not exists (select 1 from ingest.job_occurrence_links l
                        where l.canonical_job_id = pj.id)) as public_without_receipt_link,
  (select count(*) from app.jobs j
     where not exists (select 1 from ingest.job_occurrence_links l
                        where l.canonical_job_id = j.id)) as jobs_held_without_receipt_link,
  (select count(*) from audit.job_duplicate_candidates) as duplicate_candidates_pending,
  (select count(*) from app.jobs where canonical_job_id is not null and canonical_job_id <> id) as jobs_merged_as_duplicate,
  (select count(*) from app.companies) as canonical_employers,
  (select count(*) from app.company_aliases) as employer_aliases,
  (select count(*) from app.company_domains) as employer_domains,
  (select count(*) from app.companies c
     where not exists (select 1 from app.company_domains d where d.company_id = c.id)) as employers_without_domain,
  (select count(*) from app.job_eligibility) as eligibility_evidence_rows,
  (select count(*) from app.jobs j
     where not exists (select 1 from app.job_eligibility e where e.job_id = j.id)) as jobs_without_eligibility_evidence,
  (select count(*) from app.job_salary_evidence) as salary_evidence_rows,
  (select count(*) from app.jobs where apply_link_state = 'broken') as jobs_broken_destination,
  (select count(*) from app.jobs where apply_link_state = 'unchecked') as jobs_destination_unchecked,
  (select count(*) from app.jobs where application_destination_kind is null) as jobs_destination_unclassified,
  (select count(*) from ingest.job_source_occurrences where rights_classification is null) as receipts_without_rights_snapshot,
  (select count(*) from ingest.job_source_occurrences where parser_version is null) as receipts_without_parser_version,
  (select count(*) from app.job_sources
     where status <> 'active' or policy_state <> 'enabled') as rights_blocked_sources,
  (select count(*) from private.moderation_cases where state in ('open','in_review','escalated')) as manual_review_items;

-- What each figure proves

-- source_receipts_inspected: Total immutable receipts held.
-- canonical_jobs: Canonical job rows, published or held.
-- publicly_visible: Jobs a visitor can actually see.
-- public_without_receipt_link [MUST BE ZERO]: MUST BE ZERO. A published job with no receipt cannot be traced to a source.
-- jobs_held_without_receipt_link: Held (non-public) records without receipts. Not a defect: these never reach a visitor.
-- duplicate_candidates_pending: Fuzzy matches awaiting human review. Never auto-merged.
-- jobs_merged_as_duplicate: Jobs folded into another canonical record.
-- canonical_employers: Canonical employer identities.
-- employer_aliases: Recorded alternate names used for deterministic resolution.
-- employer_domains: Verified employer domains. These drive direct-employer destination classification.
-- employers_without_domain: Employers whose destinations cannot be proven direct. Ambiguous identity risk.
-- eligibility_evidence_rows: Eligibility decisions backed by a stored evidence row.
-- jobs_without_eligibility_evidence: MUST BE ZERO for published jobs; an eligibility badge needs evidence.
-- salary_evidence_rows: Salary evidence rows. Zero means no ingested job currently discloses pay — an honest absence, not a failure.
-- jobs_broken_destination: Jobs whose apply link failed its last check.
-- jobs_destination_unchecked: Destinations never verified.
-- jobs_destination_unclassified: Destinations with no recorded kind, so the preferred-destination rule cannot be applied to them.
-- receipts_without_rights_snapshot: Receipts predating rights snapshotting. Not backfilled: the regime in force at capture is genuinely unrecorded.
-- receipts_without_parser_version: Receipts that cannot be attributed to a parser build.
-- rights_blocked_sources: Sources that may not publish. Re-enabling requires a rights review, not a job-count argument.
-- manual_review_items: Open moderation cases.
