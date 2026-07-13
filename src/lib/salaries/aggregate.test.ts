import { describe, expect, it } from "vitest";

import {
  aggregateSalaryCell,
  aggregateSalaryGroups,
  type SalarySubmissionForAggregation,
} from "./aggregate";

function submission(
  index: number,
  overrides: Partial<SalarySubmissionForAggregation> = {},
): SalarySubmissionForAggregation {
  return {
    id: `submission-${index}`,
    contributorId: `user-${index}`,
    companySlug: "padi-labs",
    roleFamily: "Software Engineer",
    countryCode: "NG",
    seniority: "mid",
    arrangement: "employee",
    currency: "NGN",
    grossNet: "gross",
    annualEquivalent: index * 1_000_000,
    approvedAt: `2026-0${Math.min(index, 9)}-10T00:00:00.000Z`,
    state: "approved",
    superseded: false,
    ...overrides,
  };
}

describe("salary privacy aggregation", () => {
  it("suppresses cells below three distinct contributors", () => {
    expect(aggregateSalaryCell([submission(1), submission(2)])).toBeNull();
  });

  it("counts contributors rather than rows", () => {
    const values = [
      submission(1),
      submission(2, { contributorId: "user-1" }),
      submission(3, { contributorId: "user-1" }),
    ];
    expect(aggregateSalaryCell(values)).toBeNull();
  });

  it("publishes only a rounded median at the minimum threshold", () => {
    const result = aggregateSalaryCell([
      submission(1),
      submission(2),
      submission(3),
    ]);
    expect(result).toMatchObject({
      sampleSize: 3,
      medianAnnual: 2_000_000,
      confidence: "low",
    });
    expect(result?.percentile25Annual).toBeNull();
    expect(result?.percentile75Annual).toBeNull();
  });

  it("publishes a useful percentile band from five distinct contributors", () => {
    const result = aggregateSalaryCell(
      [1, 2, 3, 4, 5].map((index) => submission(index)),
    );
    expect(result).toMatchObject({
      sampleSize: 5,
      percentile25Annual: 2_000_000,
      percentile75Annual: 4_000_000,
      confidence: "medium",
    });
  });

  it("trims an outlier before enforcing the minimum contributor threshold", () => {
    expect(
      aggregateSalaryCell([
        submission(1),
        submission(2),
        submission(3, { annualEquivalent: 100_000_000 }),
      ]),
    ).toBeNull();
  });

  it("suppresses percentiles when trimming leaves fewer than five contributors", () => {
    const result = aggregateSalaryCell([
      submission(1),
      submission(2),
      submission(3),
      submission(4),
      submission(5, { annualEquivalent: 100_000_000 }),
    ]);

    expect(result).toMatchObject({
      sampleSize: 4,
      medianAnnual: 2_500_000,
      percentile25Annual: null,
      percentile75Annual: null,
    });
  });

  it("publishes percentiles only from the retained contributors", () => {
    const result = aggregateSalaryCell([
      submission(1),
      submission(2),
      submission(3),
      submission(4),
      submission(5),
      submission(6, { annualEquivalent: 100_000_000 }),
    ]);

    expect(result).toMatchObject({
      sampleSize: 5,
      medianAnnual: 3_000_000,
      percentile25Annual: 2_000_000,
      percentile75Annual: 4_000_000,
      submissionMonthEnd: "2026-05",
      confidence: "medium",
      ruleVersion: "salary-privacy-v2",
    });
  });

  it("uses a bounded fallback when most retained values are identical", () => {
    const result = aggregateSalaryCell([
      submission(1, { annualEquivalent: 2_000_000 }),
      submission(2, { annualEquivalent: 2_000_000 }),
      submission(3, { annualEquivalent: 2_000_000 }),
      submission(4, { annualEquivalent: 100_000_000 }),
    ]);

    expect(result).toMatchObject({
      sampleSize: 3,
      medianAnnual: 2_000_000,
    });
  });

  it("ignores removed and superseded contributions", () => {
    const result = aggregateSalaryCell([
      submission(1),
      submission(2),
      submission(3, { state: "removed" }),
      submission(4, { superseded: true }),
    ]);
    expect(result).toBeNull();
  });

  it("never mixes currencies or other incompatible cells", () => {
    expect(() =>
      aggregateSalaryCell([
        submission(1),
        submission(2),
        submission(3, { currency: "USD" }),
      ]),
    ).toThrow(/cannot mix/);
    const grouped = aggregateSalaryGroups([
      submission(1),
      submission(2),
      submission(3),
      submission(4, { currency: "USD" }),
      submission(5, { currency: "USD" }),
      submission(6, { currency: "USD" }),
    ]);
    expect(grouped).toHaveLength(2);
  });
});
