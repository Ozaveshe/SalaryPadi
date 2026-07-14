import { describe, expect, it } from "vitest";

import salarySourceRegistry from "../../../config/salary-sources.json";
import {
  normalizedSalaryBenchmarkSchema,
  salarySourceRegistrySchema,
} from "./source-contract";

const validBenchmark = {
  externalRecordId: "occupation-15-1252-2025",
  sourceRoleCode: "15-1252",
  sourceRoleLabel: "Software developers",
  roleFamilySlug: "software-engineering",
  countryCode: "US",
  regionLabel: "United States",
  currencyCode: "USD",
  payPeriod: "annual",
  grossNet: "gross",
  medianAmount: 120000,
  percentile25Amount: 90000,
  percentile75Amount: 155000,
  medianAnnual: 120000,
  percentile25Annual: 90000,
  percentile75Annual: 155000,
  sampleSize: 1000,
  effectiveFrom: "2025-05-01",
  effectiveTo: "2025-05-31",
  sourcePublishedAt: "2026-04-01T00:00:00.000Z",
  retrievedAt: "2026-07-14T00:00:00.000Z",
  sourceUrl: "https://example.gov/official-dataset",
  methodologyUrl: "https://example.gov/methodology",
  normalizationVersion: "annual-v1",
  normalizationAssumptions: [],
};

describe("verified salary source contract", () => {
  it("keeps every configured source in draft with explicit blockers", () => {
    const registry = salarySourceRegistrySchema.parse(salarySourceRegistry);

    expect(registry.sources).toHaveLength(4);
    expect(registry.sources.every((source) => source.status === "draft")).toBe(
      true,
    );
    expect(registry.policy.allowGenericCrawler).toBe(false);
    expect(registry.policy.blendWithFirstPartyContributions).toBe(false);
  });

  it("accepts a complete source-preserving normalized benchmark", () => {
    expect(normalizedSalaryBenchmarkSchema.parse(validBenchmark)).toMatchObject(
      {
        externalRecordId: "occupation-15-1252-2025",
        medianAnnual: 120000,
      },
    );
  });

  it("rejects inverted ranges and non-HTTPS evidence", () => {
    const result = normalizedSalaryBenchmarkSchema.safeParse({
      ...validBenchmark,
      percentile25Annual: 130000,
      sourceUrl: "http://example.gov/official-dataset",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["percentile25Annual", "sourceUrl"]),
      );
    }
  });
});
