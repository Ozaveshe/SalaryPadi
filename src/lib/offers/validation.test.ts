import { describe, expect, it } from "vitest";

import type { OfferInput } from "./types";
import { buildRateResolver, validateOffer, validateRates } from "./validation";

function offer(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    id: "offer-a",
    label: "Offer A",
    basePay: { amount: 100_000, currency: "NGN", payPeriod: "monthly" },
    payBasis: "gross",
    terms: { arrangement: "employee" },
    ...overrides,
  };
}

describe("offer validation", () => {
  it("accepts a complete finite offer", () => {
    expect(validateOffer(offer(), "A")).toEqual([]);
  });

  it("reports identity, money, net-deduction, and term boundary errors", () => {
    const issues = validateOffer(
      offer({
        id: " ",
        label: "",
        basePay: {
          amount: -1,
          currency: "N",
          payPeriod: "hourly",
          periodsPerYear: 0,
        },
        payBasis: "net",
        estimatedDeductions: [
          {
            label: "Tax",
            value: { amount: 1, currency: "NGN", payPeriod: "annual" },
          },
        ],
        terms: {
          arrangement: "employee",
          paidLeaveDays: -1,
          commuteHoursPerWeek: Number.NaN,
        },
      }),
      "B",
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        "Offer B must have an id.",
        "Offer B must have a label.",
        "Offer B money item 1 must have a non-negative finite amount.",
        "Offer B money item 1 must use a three-letter currency code.",
        "Offer B money item 1 has an invalid periodsPerYear.",
        "Offer B is net pay, so estimated gross-pay deductions must not be supplied.",
        "Offer B paidLeaveDays must be a non-negative finite number.",
        "Offer B commuteHoursPerWeek must be a non-negative finite number.",
      ]),
    );
  });

  it("reports a missing hourly multiplier separately", () => {
    expect(
      validateOffer(
        offer({
          basePay: { amount: 10, currency: "USD", payPeriod: "hourly" },
        }),
        "A",
      ),
    ).toContain("Offer A hourly money item 1 requires periodsPerYear.");
  });
});

describe("offer FX validation and resolution", () => {
  it("rejects malformed, non-positive, self, and conflicting rates", () => {
    const issues = validateRates([
      { from: "US", to: "NGN", rate: -1 },
      { from: "USD", to: "USD", rate: 2 },
      { from: "USD", to: "NGN", rate: 1_500 },
      { from: "usd", to: "ngn", rate: 1_600 },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        "FX rate 1 must use three-letter currency codes.",
        "FX rate 1 must be a positive finite number.",
        "FX rate 2 converts a currency to itself and must equal 1.",
        "Conflicting user FX rates were supplied for USD to NGN.",
      ]),
    );
  });

  it("uses identity, direct, and inverse rates without inferring a market rate", () => {
    const resolve = buildRateResolver([
      { from: "USD", to: "NGN", rate: 1_500 },
    ]);

    expect(resolve("ngn", "NGN")).toBe(1);
    expect(resolve("USD", "NGN")).toBe(1_500);
    expect(resolve("NGN", "USD")).toBeCloseTo(1 / 1_500);
    expect(() => resolve("GBP", "NGN")).toThrow(
      "SalaryPadi does not fetch or infer market rates",
    );
  });
});
