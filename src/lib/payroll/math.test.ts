import { describe, expect, it } from "vitest";

import {
  applyBasisPoints,
  calculateProgressiveTax,
  normalizeToAnnual,
  roundNaira,
  safeSum,
  toMonthlyBreakdown,
} from "./math";
import type { PayrollBreakdown } from "./types";

describe("payroll math boundaries", () => {
  it("rounds periodic inputs before annualizing them", () => {
    expect(roundNaira(1_000.5)).toBe(1_001);
    expect(normalizeToAnnual({ amount: 1_000.49, period: "monthly" })).toBe(
      12_000,
    );
    expect(normalizeToAnnual({ amount: 1_000.5, period: "annual" })).toBe(
      1_001,
    );
  });

  it("rejects missing, negative, non-finite, invalid-period, and unsafe inputs", () => {
    expect(() => normalizeToAnnual(null as never)).toThrow(
      "amount is required",
    );
    expect(() => normalizeToAnnual({ amount: -1, period: "monthly" })).toThrow(
      "finite, non-negative",
    );
    expect(() =>
      normalizeToAnnual({ amount: Number.NaN, period: "monthly" }),
    ).toThrow("finite, non-negative");
    expect(() =>
      normalizeToAnnual({ amount: 1, period: "weekly" } as never),
    ).toThrow("monthly or annual");
    expect(() =>
      normalizeToAnnual({ amount: 100_000_000_000, period: "monthly" }),
    ).toThrow("too large");
  });

  it("applies basis points and protects aggregate integer safety", () => {
    expect(applyBasisPoints(123_456, 850)).toBe(10_494);
    expect(safeSum([1, 2, 3], "deductions")).toBe(6);
    expect(() => safeSum([Number.MAX_SAFE_INTEGER, 1], "deductions")).toThrow(
      "deductions is too large",
    );
  });

  it("taxes progressive bands at exact boundaries and above them", () => {
    const bands = [
      { upperBoundAnnual: 300_000, rateBps: 700 },
      { upperBoundAnnual: 600_000, rateBps: 1_100 },
      { upperBoundAnnual: null, rateBps: 1_500 },
    ] as const;

    expect(calculateProgressiveTax(300_000, bands)).toBe(21_000);
    expect(calculateProgressiveTax(1_000_000, bands)).toBe(114_000);
    expect(calculateProgressiveTax(0, bands)).toBe(0);
  });

  it("fails closed for malformed tax bands and unsafe tax arithmetic", () => {
    expect(() =>
      calculateProgressiveTax(100, [{ upperBoundAnnual: 100, rateBps: -1 }]),
    ).toThrow("non-negative integer");
    expect(() =>
      calculateProgressiveTax(100, [{ upperBoundAnnual: 100, rateBps: 1.5 }]),
    ).toThrow("non-negative integer");
    expect(() =>
      calculateProgressiveTax(200, [
        { upperBoundAnnual: 150, rateBps: 100 },
        { upperBoundAnnual: 100, rateBps: 100 },
      ]),
    ).toThrow("upper bounds must be ordered");
    expect(() =>
      calculateProgressiveTax(Number.MAX_SAFE_INTEGER, [
        { upperBoundAnnual: null, rateBps: 10_000 },
      ]),
    ).toThrow("PAYE is too large");
  });

  it("converts every annual breakdown field to a rounded monthly value", () => {
    const annual: PayrollBreakdown = {
      grossCashPay: 12,
      taxExemptEmploymentIncome: 24,
      taxableCashEmploymentIncome: 36,
      taxableBenefitsInKind: 48,
      grossEmploymentIncome: 60,
      employeePension: 72,
      nationalHousingFund: 84,
      healthInsurance: 96,
      ownerOccupiedMortgageInterest: 108,
      lifeInsuranceOrDeferredAnnuity: 120,
      rentPaid: 132,
      rentRelief: 144,
      totalEligibleTaxDeductions: 156,
      chargeableIncome: 168,
      paye: 180,
      otherDeductions: 192,
      totalCashDeductions: 204,
      takeHomePay: 216,
    };

    expect(toMonthlyBreakdown(annual)).toEqual({
      grossCashPay: 1,
      taxExemptEmploymentIncome: 2,
      taxableCashEmploymentIncome: 3,
      taxableBenefitsInKind: 4,
      grossEmploymentIncome: 5,
      employeePension: 6,
      nationalHousingFund: 7,
      healthInsurance: 8,
      ownerOccupiedMortgageInterest: 9,
      lifeInsuranceOrDeferredAnnuity: 10,
      rentPaid: 11,
      rentRelief: 12,
      totalEligibleTaxDeductions: 13,
      chargeableIncome: 14,
      paye: 15,
      otherDeductions: 16,
      totalCashDeductions: 17,
      takeHomePay: 18,
    });
  });
});
