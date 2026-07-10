import { describe, expect, it } from "vitest";

import { mapDatabaseJobRow } from "./database";
import { buildJobFingerprint } from "./normalize";

function databaseRow() {
  return {
    id: "00000000-0000-4000-8000-000000000077",
    slug: "platform-engineer-at-example-ltd",
    external_source_id: "example-77",
    title: "Platform Engineer",
    description_text: "Build reliable systems.",
    requirements_text: null,
    benefits_text: null,
    work_arrangement: "remote",
    employment_type: "full_time",
    engagement_type: "employee",
    experience_level: "mid",
    salary_min: null,
    salary_max: null,
    currency_code: null,
    pay_period: null,
    gross_net: "unknown",
    bonus_text: null,
    application_url: "https://jobs.example.test/platform-engineer",
    source_url: "https://jobs.example.test/platform-engineer",
    posted_at: "2026-07-09T09:00:00+00:00",
    valid_through: null,
    last_checked_at: "2026-07-10T13:05:00+00:00",
    last_verified_at: "2026-07-10T13:05:00+00:00",
    company_slug: "example-ltd",
    company_name: "Example Ltd",
    company_verification_status: "domain_verified",
    source_name: "Example employer submission",
    source_id: "00000000-0000-4000-8000-000000000078",
    source_type: "direct_employer",
    source_terms_url: "/terms",
    source_homepage_url: "https://jobs.example.test",
    attribution_required: true,
    attribution_text: "Submitted by the employer.",
    may_store_full_description: true,
    may_index_jobs: true,
    may_emit_jobposting_schema: true,
    required_destination_kind: "employer_application_url",
    refresh_interval_seconds: 86_400,
    terms_reviewed_at: "2026-07-10T00:00:00+00:00",
    eligibility_scope: "worldwide",
    required_timezone_overlap: null,
    work_authorization_requirement: null,
    visa_sponsorship: null,
    relocation_support: null,
    eligibility_evidence: "Worldwide",
    eligibility_provenance: "source_provided",
    eligibility_verified_at: "2026-07-10T13:05:00+00:00",
    role_family: "Software Development",
    dedup_fingerprint: "legacy-source-specific-fingerprint",
    locations: [],
    eligibility_countries: [],
    skills: ["TypeScript"],
    risk_indicators: [],
  };
}

describe("database job normalization", () => {
  it("recomputes the shared canonical fingerprint instead of trusting a source-specific hash", () => {
    const job = mapDatabaseJobRow(databaseRow());

    expect(job).not.toBeNull();
    expect(job?.fingerprint).toBe(
      buildJobFingerprint({
        title: "Platform Engineer",
        company: "Example Ltd",
        location: "Worldwide",
        arrangement: "employee",
        destination: "https://jobs.example.test/platform-engineer",
      }),
    );
    expect(job?.fingerprint).not.toBe("legacy-source-specific-fingerprint");
  });

  it("rejects malformed nested public data instead of silently erasing it", () => {
    expect(
      mapDatabaseJobRow({
        ...databaseRow(),
        locations: [{ country_code: 123 }],
      }),
    ).toBeNull();
  });
});
