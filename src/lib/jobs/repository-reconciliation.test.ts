import { describe, expect, it } from "vitest";

import type { SourceFeed } from "./repository-contracts";
import { combineJobSources } from "./repository-reconciliation";
import type { Job } from "./types";

const checkedAt = "2026-07-14T12:00:00.000Z";
const now = new Date("2026-07-14T12:30:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    databaseId: "11111111-1111-4111-8111-111111111111",
    slug: "job-1",
    externalId: "external-1",
    source: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Direct employer",
      type: "employer",
      termsUrl: "/terms",
      termsReviewedAt: checkedAt,
      attributionRequired: "Submitted by the employer.",
      canStoreFullDescription: true,
      canIndex: true,
      canUseJobPostingStructuredData: true,
      canEmail: true,
      destinationRequirement: "employer_application_url",
      refreshIntervalSeconds: 86_400,
    },
    sourceUrl: "https://acme.example/jobs/job-1",
    applicationUrl: "https://acme.example/jobs/job-1/apply",
    title: "Operations manager",
    company: {
      name: "Acme",
      slug: "acme",
      verification: "employer_verified",
    },
    locationDisplay: "Lagos, Nigeria",
    workMode: "hybrid",
    employmentType: "full_time",
    arrangement: "employee",
    experienceLevel: "mid",
    category: "Operations",
    skills: ["Operations"],
    salary: null,
    eligibility: {
      scope: "nigeria",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: ["Nigeria"],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText: "Applicants must be based in Nigeria.",
      provenance: "manually_verified",
      lastVerifiedAt: checkedAt,
    },
    description: "A reviewed first-party employer vacancy.",
    requirements: null,
    benefits: null,
    postedAt: checkedAt,
    lastCheckedAt: checkedAt,
    validThrough: "2099-12-31T23:59:59.000Z",
    status: "open",
    riskIndicators: [],
    fingerprint: "a".repeat(64),
    ...overrides,
  };
}

function source(key: SourceFeed["key"], jobs: Job[]): SourceFeed {
  return {
    key,
    jobs,
    state: "live",
    checkedAt,
    count: jobs.length,
  };
}

describe("job source reconciliation", () => {
  it("does not label a missing source registry as a live empty feed", () => {
    expect(combineJobSources([], now)).toMatchObject({
      state: "unavailable",
      jobs: [],
      checkedAt: now.toISOString(),
      message: "No job sources were supplied.",
      sources: [],
    });
  });

  it.each(["not-a-timestamp", "2099-01-01T00:00:00.000Z"])(
    "quarantines unverifiable source freshness evidence: %s",
    (sourceCheckedAt) => {
      expect(
        combineJobSources(
          [{ ...source("database", [job()]), checkedAt: sourceCheckedAt }],
          now,
        ),
      ).toMatchObject({
        state: "unavailable",
        jobs: [],
        sources: [
          {
            key: "database",
            state: "unavailable",
            checkedAt: now.toISOString(),
            code: "source_checked_at_invalid",
          },
        ],
      });
    },
  );

  it("quarantines duplicate source identities instead of merging them", () => {
    expect(
      combineJobSources(
        [source("database", [job()]), source("database", [job()])],
        now,
      ),
    ).toMatchObject({
      state: "unavailable",
      jobs: [],
      sources: [
        {
          key: "database",
          state: "unavailable",
          code: "duplicate_source_key",
        },
      ],
    });
  });

  it("keeps moderated onsite and hybrid employer jobs", () => {
    const hybrid = job();
    const onsite = job({
      id: "job-2",
      slug: "job-2",
      externalId: "external-2",
      workMode: "onsite",
      fingerprint: "b".repeat(64),
    });

    expect(
      combineJobSources([source("database", [hybrid, onsite])], now),
    ).toMatchObject({
      state: "live",
      jobs: [hybrid, onsite],
      sources: [{ key: "database", count: 2 }],
    });
  });

  it("retains the remote Africa-access rule for Remotive", () => {
    const remote = job({
      databaseId: null,
      workMode: "remote",
      eligibility: {
        ...job().eligibility,
        scope: "worldwide",
        evidenceText: "Worldwide",
      },
      source: { ...job().source, type: "permitted_api" },
    });
    const hybrid = job({
      id: "job-2",
      slug: "job-2",
      externalId: "external-2",
      fingerprint: "b".repeat(64),
    });

    expect(
      combineJobSources([source("remotive", [remote, hybrid])], now),
    ).toMatchObject({
      jobs: [remote],
      sources: [{ key: "remotive", count: 1 }],
    });
  });

  it("never republishes expired or explicitly closed jobs", () => {
    const expiredByDate = job({
      validThrough: "2000-01-01T00:00:00.000Z",
    });
    const expiredByStatus = job({
      id: "job-2",
      fingerprint: "b".repeat(64),
      status: "expired",
    });

    expect(
      combineJobSources(
        [source("database", [expiredByDate, expiredByStatus])],
        now,
      ),
    ).toMatchObject({ jobs: [], sources: [{ key: "database", count: 0 }] });
  });
});
