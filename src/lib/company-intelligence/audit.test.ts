import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const ingressAuditScript = join(
  root,
  "scripts/audit-company-intelligence-ingress.mjs",
);

const provenanceMigration = readFileSync(
  join(root, "supabase/migrations/20260714030526_company_fact_provenance.sql"),
  "utf8",
);
const intakeMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260714030633_company_contribution_intake.sql",
  ),
  "utf8",
);
const employerMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260714030647_employer_claims_and_responses.sql",
  ),
  "utf8",
);
const aggregateMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260714030700_company_aggregate_evidence.sql",
  ),
  "utf8",
);
const artifact = JSON.parse(
  readFileSync(join(root, "reports/company-intelligence-audit.json"), "utf8"),
) as {
  production: Record<string, number>;
  quarantine: { stores_raw_text: boolean };
};

// The audit derives its scan root from its own location, so a copy of the real
// script inside a sandbox audits the fixtures written there instead of the
// repository. That keeps these cases on the shipped rule with no test-only
// affordance in the script. Run without `--check` so a fixture that is meant to
// fail still exits zero and reports through the summary.
function runIngressAudit(sources: Record<string, string>) {
  const sandbox = mkdtempSync(join(tmpdir(), "company-intelligence-audit-"));
  try {
    const script = join(
      sandbox,
      "scripts/audit-company-intelligence-ingress.mjs",
    );
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(ingressAuditScript, script);
    mkdirSync(join(sandbox, "reports"), { recursive: true });
    writeFileSync(
      join(sandbox, "reports/company-intelligence-audit.json"),
      JSON.stringify({
        schema_version: 1,
        production: { raw_contributions: 0, public_review_publications: 0 },
      }),
    );
    for (const [path, contents] of Object.entries(sources)) {
      const file = join(sandbox, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
    return JSON.parse(
      execFileSync(process.execPath, [script], {
        cwd: sandbox,
        encoding: "utf8",
      }),
    ) as { external_opinion_application_matches: number; status: string };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

describe("company intelligence audit contract", () => {
  it("records the production empty-state without inventing evidence", () => {
    expect(artifact.production.raw_contributions).toBe(0);
    expect(artifact.production.public_review_publications).toBe(0);
    expect(artifact.production.external_review_text_rows_observed).toBe(0);
    expect(artifact.production.community_feed_posts).toBe(0);
    expect(artifact.production.community_forum_threads).toBe(0);
    expect(artifact.production.community_forum_replies).toBe(0);
    expect(artifact.quarantine.stores_raw_text).toBe(false);
  });

  it("finds no external review ingress in database, seed, index, or prompts", () => {
    const output = execFileSync(
      process.execPath,
      [join(root, "scripts/audit-company-intelligence-ingress.mjs"), "--check"],
      { cwd: root, encoding: "utf8" },
    );
    expect(JSON.parse(output)).toMatchObject({
      external_opinion_application_matches: 0,
      external_opinion_database_matches: 0,
      external_opinion_seed_or_index_matches: 0,
      external_opinion_prompt_matches: 0,
      status: "pass",
    });
  });

  it("reads an OAuth origin allowlist beside contribution routes as network policy", () => {
    expect(
      runIngressAudit({
        "src/proxy.ts": [
          "const OAUTH_FORM_ACTION_ORIGINS = [",
          '  "https://accounts.google.com",',
          '  "https://api.linkedin.com",',
          '  "https://www.linkedin.com",',
          "];",
          "",
          "const protectedPrefixes = [",
          '  "/contribute/salary",',
          '  "/contribute/review",',
          '  "/contribute/interview",',
          "];",
        ].join("\n"),
      }),
    ).toMatchObject({
      external_opinion_application_matches: 0,
      status: "pass",
    });
  });

  it("still reports a platform URL that names a resource", () => {
    expect(
      runIngressAudit({
        "src/lib/companies/import.ts":
          'const source = "https://www.glassdoor.com/Reviews/company.htm";',
      }),
    ).toMatchObject({
      external_opinion_application_matches: 1,
      status: "fail",
    });
  });

  it("still reports a platform name written outside an origin", () => {
    expect(
      runIngressAudit({
        "src/lib/companies/import.ts": [
          "export async function importLinkedinEvidence() {",
          "  return { rating: null };",
          "}",
        ].join("\n"),
      }),
    ).toMatchObject({
      external_opinion_application_matches: 1,
      status: "fail",
    });
  });

  it("keeps quarantine evidence text-free and immutable", () => {
    const table = provenanceMigration.slice(
      provenanceMigration.indexOf(
        "create table if not exists audit.company_opinion_quarantine",
      ),
      provenanceMigration.indexOf(
        "drop trigger if exists company_opinion_quarantine_append_only",
      ),
    );
    expect(table).toContain("content_hash text not null");
    expect(table).not.toMatch(
      /\b(?:pros|cons|review_text|salary_text|content)\s+text\b/i,
    );
    expect(provenanceMigration).toMatch(
      /company_opinion_quarantine_append_only[\s\S]+security\.reject_mutation\(\)/,
    );
  });

  it("covers PII, doxxing, threat, hate, duplicate, campaign, confidential, allegation and malicious flags", () => {
    for (const flag of [
      "pii",
      "doxxing",
      "threat",
      "hate_speech",
      "duplicate",
      "coordinated_campaign",
      "confidential_material",
      "serious_allegation",
      "malicious_text",
    ]) {
      expect(intakeMigration).toContain(`'${flag}'`);
    }
    expect(intakeMigration).toContain("c.content_hash = v_content_hash");
    expect(intakeMigration).toContain("select count(*) >= 4");
  });

  it("rejects every document-verification bypass", () => {
    expect(intakeMigration).toContain("document_verified_later', false");
    expect(intakeMigration).toContain(
      "contribution_document_verification_disabled",
    );
    expect(intakeMigration).toContain("contains_prohibited_company_evidence");
    expect(intakeMigration).toContain(
      "payslip|pay_slip|document|attachment|verification_evidence|work_email",
    );
  });

  it("requires contribution deletion targets to belong to the requester", () => {
    expect(intakeMigration).toContain("privacy_request_contribution_owner");
    expect(intakeMigration).toContain("c.contributor_user_id = new.user_id");
  });

  it("keeps work-domain verification private and tied to a verified membership", () => {
    expect(intakeMigration).toContain("'work_domain_verified'");
    expect(intakeMigration).toContain("private.company_memberships");
    expect(intakeMigration).toContain("m.status = 'verified'");
  });

  it("does not expose employer or contributor identity in public employer responses", () => {
    const publicView = employerMigration.slice(
      employerMigration.indexOf(
        "create or replace view api.employer_responses",
      ),
      employerMigration.indexOf(
        "create or replace view api.my_employer_responses",
      ),
    );
    expect(publicView).not.toContain("author_user_id");
    expect(publicView).not.toContain("work_email");
    expect(publicView).not.toContain("contributor_user_id");
  });

  it("prevents employer actions from mutating community evidence", () => {
    const transition = employerMigration.slice(
      employerMigration.indexOf(
        "create or replace function security.transition_employer_response",
      ),
      employerMigration.indexOf(
        "create or replace function api.submit_company_claim",
      ),
    );
    expect(transition).not.toContain("company_rating_snapshots");
    expect(transition).not.toContain("review_publications");
    expect(transition).not.toContain("salary_aggregate_snapshots");
  });

  it("keeps every public community aggregate behind a cohort", () => {
    expect(aggregateMigration).toMatch(
      /view api\.company_ratings[\s\S]+sample_size >= 5/,
    );
    expect(aggregateMigration).toMatch(
      /view api\.company_benefits[\s\S]+sample_size >= 5/,
    );
    expect(aggregateMigration).toMatch(
      /view api\.pay_reliability_aggregates[\s\S]+sample_size >= 5/,
    );
  });

  it("withholds rare reviewer and interview attributes", () => {
    expect(aggregateMigration).toContain("company_evidence_cohort_met");
    expect(aggregateMigration).toMatch(
      /view api\.company_reviews[\s\S]+else 'WITHHELD'[\s\S]+null::text as employment_status/,
    );
    expect(aggregateMigration).toMatch(
      /view api\.interview_experiences[\s\S]+null::text as application_source[\s\S]+null::text as outcome/,
    );
  });
});
