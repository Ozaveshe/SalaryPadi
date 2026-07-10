import { describe, expect, it } from "vitest";

import { compareOffers } from "./compare";
import type { OfferInput } from "./types";
import { OfferComparisonError } from "./types";

function makeOffer(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    id: "offer",
    label: "Offer",
    basePay: { amount: 1_000_000, currency: "NGN", payPeriod: "monthly" },
    payBasis: "net",
    terms: { arrangement: "employee" },
    ...overrides,
  };
}

describe("offer pay and currency normalization", () => {
  it("normalizes monthly and annual pay to the same totals", () => {
    const result = compareOffers({
      comparisonCurrency: "ngn",
      offerA: makeOffer({ id: "a", label: "Monthly" }),
      offerB: makeOffer({
        id: "b",
        label: "Annual",
        basePay: { amount: 12_000_000, currency: "NGN", payPeriod: "annual" },
      }),
    });

    expect(result.comparisonCurrency).toBe("NGN");
    expect(result.offerA.basePay).toEqual({
      currency: "NGN",
      monthly: 1_000_000,
      annual: 12_000_000,
    });
    expect(result.differences.basePay).toMatchObject({
      monthly: 0,
      annual: 0,
      leader: "tie",
    });
  });

  it("uses an explicit user FX rate across all monetary components", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      fxRates: [
        {
          from: "USD",
          to: "NGN",
          rate: 1_500,
          sourceLabel: "User's bank quote",
        },
      ],
      offerA: makeOffer({
        id: "a",
        label: "Dollar offer",
        basePay: { amount: 2_000, currency: "USD", payPeriod: "monthly" },
        payBasis: "gross",
        variablePay: [
          {
            kind: "bonus",
            value: { amount: 1_200, currency: "USD", payPeriod: "annual" },
            guaranteed: true,
          },
          {
            kind: "commission",
            value: { amount: 300, currency: "USD", payPeriod: "monthly" },
            guaranteed: false,
          },
        ],
        benefits: [
          {
            kind: "pension",
            value: { amount: 100, currency: "USD", payPeriod: "monthly" },
          },
          {
            kind: "health",
            value: { amount: 1_200, currency: "USD", payPeriod: "annual" },
          },
        ],
        personalCosts: [
          {
            kind: "remote_work",
            value: { amount: 50, currency: "USD", payPeriod: "monthly" },
          },
          {
            kind: "transfer",
            value: { amount: 20, currency: "USD", payPeriod: "monthly" },
          },
        ],
        estimatedDeductions: [
          {
            label: "User tax estimate",
            value: { amount: 500, currency: "USD", payPeriod: "monthly" },
          },
        ],
      }),
      offerB: makeOffer({ id: "b", label: "Naira offer" }),
    });

    expect(result.offerA).toMatchObject({
      basePay: { monthly: 3_000_000, annual: 36_000_000 },
      guaranteedCashCompensation: {
        monthly: 3_150_000,
        annual: 37_800_000,
      },
      nonGuaranteedCashCompensation: {
        monthly: 450_000,
        annual: 5_400_000,
      },
      totalCashCompensation: { monthly: 3_600_000, annual: 43_200_000 },
      estimatedBenefitValue: { monthly: 300_000, annual: 3_600_000 },
      personalWorkCosts: { monthly: 105_000, annual: 1_260_000 },
      estimatedDeductions: { monthly: 750_000, annual: 9_000_000 },
      estimatedCashTakeHome: { monthly: 2_850_000, annual: 34_200_000 },
      totalCompensation: { monthly: 3_900_000, annual: 46_800_000 },
      effectiveValue: { monthly: 3_795_000, annual: 45_540_000 },
      effectiveTakeHomeValue: {
        monthly: 3_045_000,
        annual: 36_540_000,
      },
    });
  });

  it("can invert a user-entered rate without fetching another rate", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      fxRates: [{ from: "NGN", to: "USD", rate: 1 / 1_600 }],
      offerA: makeOffer({
        id: "a",
        label: "USD",
        basePay: { amount: 1_000, currency: "USD", payPeriod: "monthly" },
      }),
      offerB: makeOffer({ id: "b", label: "NGN" }),
    });

    expect(result.offerA.basePay.monthly).toBe(1_600_000);
  });

  it("refuses to invent a missing exchange rate", () => {
    expect(() =>
      compareOffers({
        comparisonCurrency: "NGN",
        offerA: makeOffer({
          id: "a",
          label: "USD",
          basePay: { amount: 1_000, currency: "USD", payPeriod: "monthly" },
        }),
        offerB: makeOffer({ id: "b", label: "NGN" }),
      }),
    ).toThrow(/Enter an FX rate for USD to NGN/);
  });

  it("requires explicit annual working periods for hourly and daily values", () => {
    expect(() =>
      compareOffers({
        comparisonCurrency: "NGN",
        offerA: makeOffer({
          id: "a",
          label: "Hourly",
          basePay: { amount: 10_000, currency: "NGN", payPeriod: "hourly" },
        }),
        offerB: makeOffer({ id: "b", label: "Monthly" }),
      }),
    ).toThrow(/requires periodsPerYear/);

    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Hourly",
        basePay: {
          amount: 10_000,
          currency: "NGN",
          payPeriod: "hourly",
          periodsPerYear: 2_000,
        },
      }),
      offerB: makeOffer({ id: "b", label: "Monthly" }),
    });
    expect(result.offerA.basePay.annual).toBe(20_000_000);
  });

  it("includes a one-time value in first-year totals and documents that choice", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Equipment offer",
        benefits: [
          {
            kind: "equipment",
            value: { amount: 600_000, currency: "NGN", payPeriod: "one_time" },
          },
        ],
      }),
      offerB: makeOffer({ id: "b", label: "Other" }),
    });

    expect(result.offerA.estimatedBenefitValue).toMatchObject({
      annual: 600_000,
      monthly: 50_000,
    });
    expect(result.normalizationNotes.join(" ")).toContain(
      "One-time values are included in first-year annual totals",
    );
  });
});

describe("take-home and effective value", () => {
  it("does not estimate take-home from a gross offer without user deductions", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({ id: "a", label: "Gross", payBasis: "gross" }),
      offerB: makeOffer({ id: "b", label: "Net" }),
    });

    expect(result.offerA.estimatedDeductions).toBeNull();
    expect(result.offerA.estimatedCashTakeHome).toBeNull();
    expect(result.offerA.effectiveTakeHomeValue).toBeNull();
    expect(result.differences.effectiveTakeHomeValue.leader).toBe("unknown");
    expect(result.offerA.warnings.join(" ")).toContain(
      "user-supplied deduction",
    );
    expect(
      result.negotiationTalkingPoints.some(
        (point) => point.kind === "take_home_unknown",
      ),
    ).toBe(true);
  });

  it("honours an explicitly entered zero-deduction gross estimate", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Gross",
        payBasis: "gross",
        estimatedDeductions: [],
      }),
      offerB: makeOffer({ id: "b", label: "Net" }),
    });

    expect(result.offerA.estimatedDeductions?.annual).toBe(0);
    expect(result.offerA.estimatedCashTakeHome?.annual).toBe(12_000_000);
  });

  it("warns rather than silently clamping deductions above cash pay", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Gross",
        payBasis: "gross",
        estimatedDeductions: [
          {
            label: "Entered deductions",
            value: { amount: 2_000_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
      }),
      offerB: makeOffer({ id: "b", label: "Net" }),
    });

    expect(result.offerA.estimatedCashTakeHome?.monthly).toBe(-1_000_000);
    expect(result.offerA.warnings.join(" ")).toContain("exceed total cash");
  });

  it("rejects gross-pay deductions attached to an already-net offer", () => {
    expect(() =>
      compareOffers({
        comparisonCurrency: "NGN",
        offerA: makeOffer({
          id: "a",
          label: "Net",
          estimatedDeductions: [
            {
              label: "Tax",
              value: { amount: 1, currency: "NGN", payPeriod: "annual" },
            },
          ],
        }),
        offerB: makeOffer({ id: "b", label: "Other" }),
      }),
    ).toThrow(/is net pay/);
  });
});

describe("differences and evidence-grounded negotiation points", () => {
  it("treats lower personal costs as the favourable difference", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Remote",
        personalCosts: [
          {
            kind: "electricity",
            value: { amount: 20_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
      }),
      offerB: makeOffer({
        id: "b",
        label: "Onsite",
        personalCosts: [
          {
            kind: "commute",
            value: { amount: 80_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
      }),
    });

    expect(result.differences.personalWorkCosts).toMatchObject({
      monthly: -60_000,
      annual: -720_000,
      leader: "offer_a",
    });
    expect(
      result.negotiationTalkingPoints.find(
        (point) => point.kind === "work_cost_gap",
      )?.evidence,
    ).toContain("60,000");
  });

  it("surfaces contract, leave, commute and equipment differences", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "Employee role",
        terms: {
          arrangement: "employee",
          workMode: "hybrid",
          paidLeaveDays: 20,
          commuteHoursPerWeek: 4,
          contractTermMonths: 24,
          noticePeriodDays: 30,
          equipmentProvided: ["Laptop", "Headset"],
        },
      }),
      offerB: makeOffer({
        id: "b",
        label: "Contract role",
        terms: {
          arrangement: "contractor",
          workMode: "remote",
          paidLeaveDays: 10,
          commuteHoursPerWeek: 0,
          contractTermMonths: 12,
          noticePeriodDays: 7,
          equipmentProvided: ["Laptop"],
        },
      }),
    });

    expect(result.nonFinancialDifferences.map((item) => item.kind)).toEqual([
      "arrangement",
      "work_mode",
      "paid_leave",
      "commute_time",
      "contract_term",
      "notice_period",
      "equipment",
    ]);
    expect(result.negotiationTalkingPoints.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "contract_difference",
        "paid_leave_gap",
        "commute_gap",
        "equipment_gap",
      ]),
    );
  });

  it("creates talking points only from entered evidence, without market claims", () => {
    const result = compareOffers({
      comparisonCurrency: "NGN",
      offerA: makeOffer({
        id: "a",
        label: "A",
        variablePay: [
          {
            kind: "commission",
            guaranteed: false,
            value: { amount: 100_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
        benefits: [
          {
            kind: "health",
            value: { amount: 50_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
        personalCosts: [
          {
            kind: "transfer",
            value: { amount: 10_000, currency: "NGN", payPeriod: "monthly" },
          },
        ],
      }),
      offerB: makeOffer({
        id: "b",
        label: "B",
        basePay: { amount: 900_000, currency: "NGN", payPeriod: "monthly" },
      }),
    });

    const text = result.negotiationTalkingPoints
      .flatMap((point) => [point.evidence, point.suggestion])
      .join(" ");
    expect(text).toContain("based on the entered values");
    expect(text.toLowerCase()).not.toContain("market rate");
    expect(text.toLowerCase()).not.toContain("industry standard");
    expect(result.negotiationTalkingPoints.map((point) => point.kind)).toEqual(
      expect.arrayContaining([
        "guaranteed_cash_gap",
        "variable_pay_clarity",
        "benefit_gap",
        "work_cost_gap",
        "transfer_cost",
      ]),
    );
  });
});

describe("input safety", () => {
  it("returns all basic validation issues in a typed error", () => {
    try {
      compareOffers({
        comparisonCurrency: "N",
        fxRates: [{ from: "USD", to: "NGN", rate: 0 }],
        offerA: makeOffer({
          id: "",
          label: "",
          basePay: { amount: -1, currency: "naira", payPeriod: "monthly" },
          terms: { arrangement: "employee", paidLeaveDays: -1 },
        }),
        offerB: makeOffer({ id: "b", label: "B" }),
      });
      throw new Error("Expected comparison to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(OfferComparisonError);
      const comparisonError = error as OfferComparisonError;
      expect(comparisonError.issues.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("rejects conflicting user rates for the same pair", () => {
    expect(() =>
      compareOffers({
        comparisonCurrency: "NGN",
        fxRates: [
          { from: "USD", to: "NGN", rate: 1_500 },
          { from: "usd", to: "ngn", rate: 1_600 },
        ],
        offerA: makeOffer({ id: "a", label: "A" }),
        offerB: makeOffer({ id: "b", label: "B" }),
      }),
    ).toThrow(/Conflicting user FX rates/);
  });
});
