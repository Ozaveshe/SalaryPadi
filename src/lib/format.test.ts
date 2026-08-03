import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatEnum,
  formatExchangeRate,
  formatSalaryAmount,
} from "./format";

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

  it("never prints a non-finite amount on a public surface", () => {
    expect(formatSalaryAmount(Number.NaN, "NGN")).toBe("Not published");
    expect(formatSalaryAmount(Number.POSITIVE_INFINITY, null)).toBe(
      "Not published",
    );
  });

  it("renders provenance timestamps in one fixed zone for every visitor", () => {
    const formatted = formatDateTime("2026-07-11T09:30:00.000Z");
    expect(formatted).toContain("2026");
    // Pinned to the product's own clock rather than the visitor's, so the same
    // evidence never reads as a different moment for two people — and named in
    // the text, so nobody has to guess which clock it is.
    expect(formatted).toContain("WAT");
    expect(formatted).toContain("10:30");
    expect(formatted).not.toContain("UTC");
  });

  it("omits an unparseable provenance timestamp instead of guessing", () => {
    expect(formatDateTime("not-a-date")).toBeNull();
  });

  it("renders exchange rates without floating-point artefacts", () => {
    expect(formatExchangeRate(1650.4523000000002)).toBe("1,650.45");
    expect(formatExchangeRate(0.00061234567)).toBe("0.000612346");
    expect(formatExchangeRate(Number.NaN)).toBeNull();
  });
});
