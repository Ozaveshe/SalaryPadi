import { describe, expect, it } from "vitest";

import {
  payeResultSchema,
  salaryConversionResultSchema,
  offerCompareRequestSchema,
  scamCheckRequestSchema,
} from "@/lib/afrotools/schemas";

function offer(id: "a" | "b") {
  return {
    id,
    label: `Offer ${id.toUpperCase()}`,
    basePay: { amount: 500_000, currency: "NGN", payPeriod: "monthly" },
    payBasis: "gross",
    estimatedDeductions: [],
    terms: { arrangement: "employee", workMode: "remote" },
  };
}

describe("AfroTools request boundaries", () => {
  it("requires explicit external-processing consent", () => {
    expect(
      offerCompareRequestSchema.safeParse({
        consent: false,
        input: {
          offerA: offer("a"),
          offerB: offer("b"),
          comparisonCurrency: "NGN",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded two-offer request", () => {
    expect(
      offerCompareRequestSchema.safeParse({
        consent: true,
        input: {
          offerA: offer("a"),
          offerB: offer("b"),
          comparisonCurrency: "NGN",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects vacancy text beyond the API privacy boundary", () => {
    expect(
      scamCheckRequestSchema.safeParse({
        consent: true,
        input: { vacancyText: "x".repeat(20_001) },
      }).success,
    ).toBe(false);
  });

  it("rejects a conversion that does not match its bounded FX evidence", () => {
    expect(
      salaryConversionResultSchema.safeParse({
        amount: 100,
        convertedAmount: 1_000,
        from: "USD",
        to: "NGN",
        period: "monthly",
        evidence: {
          from: "USD",
          to: "NGN",
          rate: 1_500,
          source: "AfroFX",
          updatedAt: "2026-07-14T00:00:00Z",
          freshness: "fresh",
          sandbox: false,
          dataPolicy: "Provider rate",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an unsafe PAYE provenance link at the UI boundary", () => {
    expect(
      payeResultSchema.safeParse({
        grossAnnual: 6_000_000,
        grossMonthly: 500_000,
        netAnnual: 4_800_000,
        netMonthly: 400_000,
        incomeTaxAnnual: 800_000,
        taxableIncomeAnnual: 5_000_000,
        deductionsAnnual: 400_000,
        effectiveRate: "13.33%",
        evidence: {
          provider: "AfroTools",
          apiVersion: "v1",
          rulesVersion: "NTA_2026",
          rulesYear: "2026",
          source: "Nigeria Tax Act",
          taxAuthority: "NRS",
          lastVerifiedAt: "2026-07-14T00:00:00Z",
          dataPolicy: "Official rules",
          docsUrl: "javascript:alert(1)",
          sandbox: false,
        },
      }).success,
    ).toBe(false);
  });
});
