import { describe, expect, it } from "vitest";

import { formatDate, formatEnum, formatSalaryAmount } from "./format";

describe("format helpers", () => {
  it("formats valid dates and rejects invalid timestamps", () => {
    expect(formatDate("not-a-date")).toBe("Unknown");
    expect(formatDate("2026-07-11T00:00:00.000Z")).toContain("2026");
  });

  it("formats enum labels", () => {
    expect(formatEnum("career_growth")).toBe("Career Growth");
  });

  it("formats amounts with and without currencies", () => {
    expect(formatSalaryAmount(1_000, null)).toContain("1,000");
    expect(formatSalaryAmount(1_000, "NGN")).toContain("1,000");
  });

  it("falls back safely for unsupported currency codes", () => {
    expect(formatSalaryAmount(1_000, "NOT_A_CURRENCY")).toContain(
      "NOT_A_CURRENCY",
    );
  });
});
