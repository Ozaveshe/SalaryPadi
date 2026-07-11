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
    location: "Lagos, Nigeria",
    workplaceType: "Hybrid",
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
  it("builds a stable, conservative Nigeria job contract", () => {
    const first = normalizeAtsImportRecords([record()], noDescriptionPolicy);
    const second = normalizeAtsImportRecords([record()], noDescriptionPolicy);

    expect(first.quarantinedCount).toBe(0);
    expect(first.jobs).toHaveLength(1);
    expect(first.jobs[0]).toMatchObject({
      external_id: "123",
      work_arrangement: "hybrid",
      employment_type: "full_time",
      engagement_type: "employee",
      eligibility: {
        scope: "nigeria",
        evidence_text: "Lagos, Nigeria",
        provenance: "source_provided",
        countries: [{ country_code: "NG", rule: "include" }],
      },
      locations: [
        {
          country_code: "NG",
          city: "Lagos",
          region: null,
          is_primary: true,
        },
      ],
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

  it.each([
    ["Remote", "remote"],
    ["OnSite", "onsite"],
    ["on-site", "onsite"],
    ["Hybrid", "hybrid"],
  ])("maps %s workplace values to %s", (value, expected) => {
    const result = normalizeAtsImportRecords(
      [record({ workplaceType: value })],
      noDescriptionPolicy,
    );
    expect(result.jobs[0]?.work_arrangement).toBe(expected);
  });

  it("does not overstate EMEA or an unclear location", () => {
    const result = normalizeAtsImportRecords(
      [
        record({ externalId: "emea", location: "EMEA" }),
        record({ externalId: "flex", location: "Flexible" }),
      ],
      noDescriptionPolicy,
    );
    expect(result.jobs.map((job) => job.eligibility.scope)).toEqual([
      "emea",
      "restricted_region",
    ]);
    expect(
      result.jobs.every((job) => job.eligibility.countries.length === 0),
    ).toBe(true);
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

  it("accepts a complete empty input as an empty normalized snapshot", () => {
    expect(normalizeAtsImportRecords([], noDescriptionPolicy)).toEqual({
      jobs: [],
      quarantinedCount: 0,
      quarantineCodes: {},
    });
  });
});
