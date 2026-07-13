import { describe, expect, it, vi } from "vitest";

import {
  addAmounts,
  amountFromAnnual,
  isValidCurrency,
  normalizeCurrency,
  normalizeMoney,
  roundMoney,
  subtractAmounts,
} from "./money";

describe("offer money normalization", () => {
  it("normalizes currency codes and rounds money to two decimals", () => {
    expect(normalizeCurrency(" ngn ")).toBe("NGN");
    expect(isValidCurrency(" usd ")).toBe(true);
    expect(isValidCurrency("US")).toBe(false);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(amountFromAnnual("USD", 1_200.126)).toEqual({
      currency: "USD",
      monthly: 100.01,
      annual: 1_200.13,
    });
  });

  it("normalizes standard and explicit pay periods through the supplied rate", () => {
    const resolveRate = vi.fn(() => 0.001);

    expect(
      normalizeMoney(
        { amount: 100_000, currency: "ngn", payPeriod: "monthly" },
        "USD",
        resolveRate,
      ),
    ).toEqual({ currency: "USD", monthly: 100, annual: 1_200 });
    expect(
      normalizeMoney(
        {
          amount: 25,
          currency: "USD",
          payPeriod: "hourly",
          periodsPerYear: 2_000,
        },
        "USD",
        () => 1,
      ),
    ).toEqual({ currency: "USD", monthly: 4_166.67, annual: 50_000 });
    expect(resolveRate).toHaveBeenCalledWith("NGN", "USD");
  });

  it("requires an explicit annual multiplier for hourly and daily inputs", () => {
    expect(() =>
      normalizeMoney(
        { amount: 10, currency: "USD", payPeriod: "hourly" },
        "USD",
        () => 1,
      ),
    ).toThrow("hourly values require an explicit periodsPerYear");
  });

  it("adds and subtracts normalized annual values consistently", () => {
    const base = amountFromAnnual("USD", 24_000);
    const bonus = amountFromAnnual("USD", 1_200);

    expect(addAmounts("USD", [base, bonus])).toEqual({
      currency: "USD",
      monthly: 2_100,
      annual: 25_200,
    });
    expect(subtractAmounts("USD", base, bonus)).toEqual({
      currency: "USD",
      monthly: 1_900,
      annual: 22_800,
    });
  });
});
