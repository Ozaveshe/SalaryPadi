import { describe, expect, it } from "vitest";

import {
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
});
