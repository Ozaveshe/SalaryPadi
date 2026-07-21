import { describe, expect, it } from "vitest";

import type { ReferenceCurrencyRate } from "@/lib/currency/types";

import { estimateNairaTakeHome } from "./naira-take-home";
import type { SalaryRange } from "./types";

const calculationDate = "2026-07-21";

function rate(
  base: string,
  quote: string,
  value: number,
): ReferenceCurrencyRate {
  return {
    base_currency: base,
    quote_currency: quote,
    rate: value,
    provider_name: "European Commission InforEuro",
    source_url: "https://commission.europa.eu/inforeuro",
    license_url: null,
    attribution_text: null,
    observed_at: "2026-07-01T00:00:00+00:00",
    fetched_at: "2026-07-02T00:00:00+00:00",
    data_period: "2026-07-01",
  };
}

const eurRates = [rate("EUR", "NGN", 1_700), rate("EUR", "USD", 1.1)];

function salary(overrides: Partial<SalaryRange> = {}): SalaryRange {
  return {
    originalText: "$60,000 per year",
    currency: "USD",
    minimum: 60_000,
    maximum: null,
    payPeriod: "annual",
    grossNet: "gross",
    ...overrides,
  };
}

describe("naira take-home estimate", () => {
  it("converts a USD annual salary through the shared reference base", () => {
    const estimate = estimateNairaTakeHome(salary(), eurRates, calculationDate);

    expect(estimate).not.toBeNull();
    // 60,000 USD -> EUR at 1.1, -> NGN at 1,700: ~92.7m NGN gross.
    expect(estimate!.annualGrossNgn).toBeCloseTo((60_000 / 1.1) * 1_700, 0);
    expect(estimate!.monthlyTakeHomeNgn).toBeGreaterThan(0);
    expect(estimate!.monthlyTakeHomeNgn).toBeLessThan(
      estimate!.annualGrossNgn / 12,
    );
    expect(estimate!.effectiveRate).toBeCloseTo(1_700 / 1.1, 4);
    expect(estimate!.grossAssumed).toBe(false);
  });

  it("uses a direct NGN pair when one exists", () => {
    const estimate = estimateNairaTakeHome(
      salary(),
      [rate("USD", "NGN", 1_500)],
      calculationDate,
    );
    expect(estimate!.effectiveRate).toBe(1_500);
  });

  it("needs no conversion for naira salaries", () => {
    const estimate = estimateNairaTakeHome(
      salary({ currency: "NGN", minimum: 12_000_000 }),
      [],
      calculationDate,
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.effectiveRate).toBeNull();
    expect(estimate!.annualGrossNgn).toBe(12_000_000);
  });

  it("annualizes monthly pay before taxing", () => {
    const monthly = estimateNairaTakeHome(
      salary({ currency: "NGN", minimum: 1_000_000, payPeriod: "monthly" }),
      [],
      calculationDate,
    );
    expect(monthly!.annualGrossNgn).toBe(12_000_000);
  });

  it("marks a gross assumption when the source did not state gross or net", () => {
    const estimate = estimateNairaTakeHome(
      salary({ grossNet: "unknown" }),
      eurRates,
      calculationDate,
    );
    expect(estimate!.grossAssumed).toBe(true);
  });

  it.each<[string, SalaryRange | null]>([
    ["no salary", null],
    ["no currency", salary({ currency: null })],
    ["unknown period", salary({ payPeriod: "unknown" })],
    ["net disclosure", salary({ grossNet: "net" })],
    ["no amounts", salary({ minimum: null, maximum: null })],
  ])("returns null for %s", (_label, value) => {
    expect(estimateNairaTakeHome(value, eurRates, calculationDate)).toBeNull();
  });

  it("returns null when no conversion path exists", () => {
    expect(
      estimateNairaTakeHome(
        salary({ currency: "KES" }),
        eurRates,
        calculationDate,
      ),
    ).toBeNull();
  });

  it("falls back to the maximum when only a maximum is stated", () => {
    const estimate = estimateNairaTakeHome(
      salary({ minimum: null, maximum: 80_000 }),
      eurRates,
      calculationDate,
    );
    expect(estimate!.basis).toBe("maximum");
    expect(estimate!.sourceAnnualAmount).toBe(80_000);
  });
});
