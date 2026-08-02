#!/usr/bin/env node
/**
 * Canonical data-model reconciliation report.
 *
 * Emits the SQL that measures whether the canonical model's guarantees hold,
 * so the report can be re-run against production at any time and compared
 * with the last one. It prints SQL rather than connecting directly: the
 * repository has no production credentials by design, and the query is run
 * through the project-scoped Supabase MCP or the CLI.
 *
 * Usage:
 *   node scripts/canonical-reconciliation.mjs           # print the SQL
 *   node scripts/canonical-reconciliation.mjs --explain # with what each row proves
 */

const CHECKS = [
  {
    key: "source_receipts_inspected",
    sql: "(select count(*) from ingest.job_source_occurrences)",
    proves: "Total immutable receipts held.",
  },
  {
    key: "canonical_jobs",
    sql: "(select count(*) from app.jobs)",
    proves: "Canonical job rows, published or held.",
  },
  {
    key: "publicly_visible",
    sql: "(select count(*) from api.jobs)",
    proves: "Jobs a visitor can actually see.",
  },
  {
    key: "public_without_receipt_link",
    sql: `(select count(*) from api.jobs pj
     where not exists (select 1 from ingest.job_occurrence_links l
                        where l.canonical_job_id = pj.id))`,
    proves:
      "MUST BE ZERO. A published job with no receipt cannot be traced to a source.",
    mustBeZero: true,
  },
  {
    key: "jobs_held_without_receipt_link",
    sql: `(select count(*) from app.jobs j
     where not exists (select 1 from ingest.job_occurrence_links l
                        where l.canonical_job_id = j.id))`,
    proves:
      "Held (non-public) records without receipts. Not a defect: these never reach a visitor.",
  },
  {
    key: "duplicate_candidates_pending",
    sql: "(select count(*) from audit.job_duplicate_candidates)",
    proves: "Fuzzy matches awaiting human review. Never auto-merged.",
  },
  {
    key: "jobs_merged_as_duplicate",
    sql: "(select count(*) from app.jobs where canonical_job_id is not null and canonical_job_id <> id)",
    proves: "Jobs folded into another canonical record.",
  },
  {
    key: "canonical_employers",
    sql: "(select count(*) from app.companies)",
    proves: "Canonical employer identities.",
  },
  {
    key: "employer_aliases",
    sql: "(select count(*) from app.company_aliases)",
    proves: "Recorded alternate names used for deterministic resolution.",
  },
  {
    key: "employer_domains",
    sql: "(select count(*) from app.company_domains)",
    proves:
      "Verified employer domains. These drive direct-employer destination classification.",
  },
  {
    key: "employers_without_domain",
    sql: `(select count(*) from app.companies c
     where not exists (select 1 from app.company_domains d where d.company_id = c.id))`,
    proves:
      "Employers whose destinations cannot be proven direct. Ambiguous identity risk.",
  },
  {
    key: "eligibility_evidence_rows",
    sql: "(select count(*) from app.job_eligibility)",
    proves: "Eligibility decisions backed by a stored evidence row.",
  },
  {
    key: "jobs_without_eligibility_evidence",
    sql: `(select count(*) from app.jobs j
     where not exists (select 1 from app.job_eligibility e where e.job_id = j.id))`,
    proves:
      "MUST BE ZERO for published jobs; an eligibility badge needs evidence.",
  },
  {
    key: "salary_evidence_rows",
    sql: "(select count(*) from app.job_salary_evidence)",
    proves:
      "Salary evidence rows. Zero means no ingested job currently discloses pay — an honest absence, not a failure.",
  },
  {
    key: "jobs_broken_destination",
    sql: "(select count(*) from app.jobs where apply_link_state = 'broken')",
    proves: "Jobs whose apply link failed its last check.",
  },
  {
    key: "jobs_destination_unchecked",
    sql: "(select count(*) from app.jobs where apply_link_state = 'unchecked')",
    proves: "Destinations never verified.",
  },
  {
    key: "jobs_destination_unclassified",
    sql: "(select count(*) from app.jobs where application_destination_kind is null)",
    proves:
      "Destinations with no recorded kind, so the preferred-destination rule cannot be applied to them.",
  },
  {
    key: "receipts_without_rights_snapshot",
    sql: "(select count(*) from ingest.job_source_occurrences where rights_classification is null)",
    proves:
      "Receipts predating rights snapshotting. Not backfilled: the regime in force at capture is genuinely unrecorded.",
  },
  {
    key: "receipts_without_parser_version",
    sql: "(select count(*) from ingest.job_source_occurrences where parser_version is null)",
    proves: "Receipts that cannot be attributed to a parser build.",
  },
  {
    key: "rights_blocked_sources",
    sql: `(select count(*) from app.job_sources
     where status <> 'active' or policy_state <> 'enabled')`,
    proves:
      "Sources that may not publish. Re-enabling requires a rights review, not a job-count argument.",
  },
  {
    key: "manual_review_items",
    sql: "(select count(*) from private.moderation_cases where state in ('open','in_review','escalated'))",
    proves: "Open moderation cases.",
  },
];

const explain = process.argv.includes("--explain");

const select = CHECKS.map((check) => `  ${check.sql} as ${check.key}`).join(
  ",\n",
);

console.log("-- SalaryPadi canonical data-model reconciliation");
console.log("-- Regenerate with: node scripts/canonical-reconciliation.mjs");
console.log(`select\n${select};`);

if (explain) {
  console.log("\n-- What each figure proves\n");
  for (const check of CHECKS) {
    const flag = check.mustBeZero ? " [MUST BE ZERO]" : "";
    console.log(`-- ${check.key}${flag}: ${check.proves}`);
  }
}
