import { describe, expect, it } from "vitest";

import type { Job } from "../../../src/lib/jobs/types";
import { buildEditorialSnapshot } from "./editorial";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    databaseId: null,
    slug: "job-1",
    externalId: "1",
    source: {
      id: "employer-source",
      name: "Employer",
      type: "employer",
      termsUrl: "https://example.com/terms",
      termsReviewedAt: "2026-07-01T00:00:00.000Z",
      attributionRequired: "Source: Employer",
      canStoreFullDescription: true,
      canIndex: true,
      canUseJobPostingStructuredData: true,
      canEmail: true,
      destinationRequirement: "employer",
      refreshIntervalSeconds: 21_600,
    },
    sourceUrl: "https://example.com/jobs/1",
    applicationUrl: "https://example.com/jobs/1/apply",
    title: "Engineer",
    company: {
      name: "Example",
      slug: "example",
      verification: "employer_verified",
    },
    locationDisplay: "Worldwide",
    workMode: "remote",
    employmentType: "full_time",
    arrangement: "employee",
    experienceLevel: "mid",
    category: null,
    skills: [],
    salary: null,
    eligibility: {
      scope: "worldwide",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: [],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText: "Worldwide",
      provenance: "source_provided",
      lastVerifiedAt: "2026-07-11T03:50:00.000Z",
    },
    description: "Role",
    requirements: null,
    benefits: null,
    postedAt: "2026-07-10T00:00:00.000Z",
    lastCheckedAt: "2026-07-11T03:50:00.000Z",
    validThrough: "2026-08-01T00:00:00.000Z",
    status: "open",
    riskIndicators: [],
    fingerprint: "one",
    ...overrides,
  };
}

describe("editorial job snapshot", () => {
  it("counts only active records and preserves eligibility ambiguity", () => {
    const now = new Date("2026-07-11T04:00:00.000Z");
    const result = buildEditorialSnapshot(
      [
        job(),
        job({
          id: "job-2",
          fingerprint: "two",
          eligibility: {
            ...job().eligibility,
            nigeria: "unclear",
            scope: "emea",
          },
          source: { ...job().source, id: "noindex", canIndex: false },
          validThrough: null,
        }),
        job({
          id: "expired",
          fingerprint: "three",
          validThrough: "2026-07-10T00:00:00.000Z",
        }),
      ],
      now,
    );
    expect(result.metrics).toEqual({
      active_jobs: 2,
      indexable_jobs: 1,
      remote_jobs: 2,
      nigeria_eligible: 1,
      nigeria_unclear: 1,
      jobs_with_deadlines: 1,
      jobs_without_deadlines: 1,
    });
    expect(result.snapshotKey).toBe("2026-07-11T04:00Z");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
