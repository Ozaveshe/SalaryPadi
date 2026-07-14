import { describe, expect, it } from "vitest";

import type { AtsSourceRecord } from "./ats";
import { normalizeAtsImportRecords } from "./ats-import";

const checkedAt = "2026-07-11T00:00:00.000Z";

function record(overrides: Partial<AtsSourceRecord> = {}): AtsSourceRecord {
  return {
    provider: "greenhouse",
    sourceKey: "employer_ats_example",
    employerName: "Example Nigeria",
    externalId: "123",
    title: "Senior Platform Engineer",
    location: "Worldwide",
    workplaceType: "Remote",
    employmentType: "FullTime",
    department: "Engineering",
    team: "Platform",
    descriptionHtml:
      "<p>Build reliable systems for customers across Africa.</p><script>alert(1)</script>",
    descriptionText: null,
    publishedAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-10T14:00:00.000Z",
    sourceUrl: "https://boards.greenhouse.io/example/jobs/123",
    applicationUrl: "https://boards.greenhouse.io/example/jobs/123",
    checkedAt,
    ...overrides,
  };
}

const noDescriptionPolicy = {
  sourceKey: "employer_ats_example",
  employerName: "Example Nigeria",
  mayStoreFullDescription: false,
};

describe("ATS import normalization", () => {
  it("builds a stable, remote-only worldwide job contract", () => {
    const first = normalizeAtsImportRecords([record()], noDescriptionPolicy);
    const second = normalizeAtsImportRecords([record()], noDescriptionPolicy);

    expect(first.quarantinedCount).toBe(0);
    expect(first.jobs).toHaveLength(1);
    expect(first.jobs[0]).toMatchObject({
      external_id: "123",
      work_arrangement: "remote",
      employment_type: "full_time",
      engagement_type: "employee",
      eligibility: {
        scope: "worldwide",
        evidence_text: "Worldwide",
        provenance: "source_provided",
        countries: [],
      },
      locations: [],
      raw_payload: null,
      description_text: null,
    });
    expect(first.jobs[0]?.slug).toBe(second.jobs[0]?.slug);
    expect(first.jobs[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.jobs[0]?.dedup_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores only sanitized plain text when the reviewed policy permits it", () => {
    const result = normalizeAtsImportRecords([record()], {
      ...noDescriptionPolicy,
      mayStoreFullDescription: true,
    });

    expect(result.jobs[0]?.description_text).toBe(
      "Build reliable systems for customers across Africa.",
    );
    expect(JSON.stringify(result.jobs[0]?.raw_payload)).not.toContain(
      "<script",
    );
    expect(JSON.stringify(result.jobs[0]?.raw_payload)).not.toContain(
      "alert(1)",
    );
  });

  it("keeps only explicitly remote arrangements", () => {
    const result = normalizeAtsImportRecords(
      [
        record({ externalId: "remote", workplaceType: "Remote" }),
        record({ externalId: "onsite", workplaceType: "OnSite" }),
        record({ externalId: "hybrid", workplaceType: "Hybrid" }),
      ],
      noDescriptionPolicy,
    );
    expect(result.jobs.map((job) => job.external_id)).toEqual(["remote"]);
    expect(result.filteredCount).toBe(2);
    expect(result.filterCodes).toEqual({ not_remote: 2 });
  });

  it("accepts EMEA but rejects an unclear remote location", () => {
    const result = normalizeAtsImportRecords(
      [
        record({ externalId: "emea", location: "EMEA" }),
        record({ externalId: "flex", location: "Flexible" }),
      ],
      noDescriptionPolicy,
    );
    expect(result.jobs.map((job) => job.eligibility.scope)).toEqual(["emea"]);
    expect(
      result.jobs.every((job) => job.eligibility.countries.length === 0),
    ).toBe(true);
    expect(result.filterCodes).toEqual({ eligibility_unclear: 1 });
  });

  it.each([
    ["Remote (Nigeria preferred)", "nigeria", ["NG"]],
    ["Africa & EMEA", "africa", []],
    ["LATAM/Africa", "africa", []],
    ["Ivory Coast / DRC / UAE", "named_countries", ["CI", "CD", "AE"]],
  ] as const)(
    "uses the shared classifier for %s",
    (location, scope, countryCodes) => {
      const result = normalizeAtsImportRecords(
        [record({ location })],
        noDescriptionPolicy,
      );

      expect(result.jobs[0]?.eligibility.scope).toBe(scope);
      expect(
        result.jobs[0]?.eligibility.countries
          .filter(({ rule }) => rule === "include")
          .map(({ country_code }) => country_code),
      ).toEqual(countryCodes);
      expect(result.jobs[0]?.eligibility.evidence_text).toBe(location);
    },
  );

  it("canonicalizes ATS apply variants without dropping posting IDs", () => {
    const hosted = normalizeAtsImportRecords(
      [
        record({
          provider: "lever",
          applicationUrl: "https://jobs.lever.co/example/role-123",
        }),
      ],
      noDescriptionPolicy,
    );
    const trackedApply = normalizeAtsImportRecords(
      [
        record({
          provider: "lever",
          applicationUrl:
            "https://jobs.lever.co/example/role-123/apply?utm_source=feed",
        }),
      ],
      noDescriptionPolicy,
    );
    const otherPosting = normalizeAtsImportRecords(
      [
        record({
          provider: "lever",
          applicationUrl: "https://jobs.lever.co/example/role-456/apply",
        }),
      ],
      noDescriptionPolicy,
    );

    expect(hosted.jobs[0]?.dedup_fingerprint).toBe(
      trackedApply.jobs[0]?.dedup_fingerprint,
    );
    expect(hosted.jobs[0]?.dedup_fingerprint).not.toBe(
      otherPosting.jobs[0]?.dedup_fingerprint,
    );
  });

  it("quarantines duplicate and mismatched records without rejecting good rows", () => {
    const result = normalizeAtsImportRecords(
      [
        record(),
        record({ title: "Duplicate" }),
        record({ externalId: "456", sourceKey: "another_source" }),
        record({ externalId: "789", title: "Another valid job" }),
      ],
      noDescriptionPolicy,
    );

    expect(result.jobs.map((job) => job.external_id)).toEqual(["123", "789"]);
    expect(result.quarantinedCount).toBe(2);
    expect(result.quarantineCodes).toEqual({
      duplicate_external_id: 1,
      source_identity_mismatch: 1,
    });
  });

  it.each(["sourceUrl", "applicationUrl"] as const)(
    "quarantines credentials embedded in %s",
    (field) => {
      const result = normalizeAtsImportRecords(
        [
          record({
            [field]:
              "https://user:secret@boards.greenhouse.io/example/jobs/123",
          }),
        ],
        noDescriptionPolicy,
      );

      expect(result.jobs).toEqual([]);
      expect(result.quarantineCodes).toEqual({ invalid_record: 1 });
    },
  );

  it.each([
    { checkedAt: "not-a-timestamp" },
    { checkedAt: "2026-07-11T00:06:00.000Z" },
    { publishedAt: "2026-07-11T00:06:00.000Z" },
    { updatedAt: "2026-07-11T00:06:00.000Z" },
    { publishedAt: "2026-02-30T00:00:00.000Z" },
  ])("quarantines malformed or future-dated evidence: %o", (overrides) => {
    const result = normalizeAtsImportRecords(
      [record(overrides)],
      noDescriptionPolicy,
      new Date(checkedAt),
    );

    expect(result.jobs).toEqual([]);
    expect(result.quarantineCodes).toEqual({ invalid_record: 1 });
  });

  it("accepts a complete empty input as an empty normalized snapshot", () => {
    expect(normalizeAtsImportRecords([], noDescriptionPolicy)).toEqual({
      jobs: [],
      filteredCount: 0,
      filterCodes: {},
      quarantinedCount: 0,
      quarantineCodes: {},
    });
  });

  it("filters remote roles whose geography excludes African applicants", () => {
    const result = normalizeAtsImportRecords(
      [
        record({ externalId: "us", location: "Remote - United States" }),
        record({ externalId: "unknown", location: "Remote" }),
      ],
      noDescriptionPolicy,
    );

    expect(result.jobs).toEqual([]);
    expect(result.filteredCount).toBe(2);
    expect(result.filterCodes).toEqual({
      geography_restricted: 1,
      eligibility_unclear: 1,
    });
    expect(result.quarantinedCount).toBe(0);
  });
});
