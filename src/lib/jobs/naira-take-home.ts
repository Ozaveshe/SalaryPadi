import { calculateNigeriaPayroll } from "@/lib/payroll";
import type { ReferenceCurrencyRate } from "@/lib/currency/types";

import type { SalaryRange } from "./types";

/**
 * Answers the question every Nigerian candidate actually has about a
 * disclosed salary: what does it come to per month in naira, after PAYE?
 * The estimate only exists when the source stated an explicit currency and
 * pay period, converts through the published reference rates, and applies
 * the same statutory Nigeria payroll engine as the take-home tool with its
 * default assumptions (statutory pension, private-sector NHF, no health
 * insurance). A "net" disclosure is never re-taxed.
 */

const ANNUALIZATION_FACTORS: Record<SalaryRange["payPeriod"], number | null> = {
  hourly: 2_080,
  daily: 260,
  weekly: 52,
  monthly: 12,
  annual: 1,
  unknown: null,
};

export type NairaTakeHomeEstimate = {
  basis: "minimum" | "maximum";
  sourceCurrency: string;
  sourceAnnualAmount: number;
  annualGrossNgn: number;
  monthlyTakeHomeNgn: number;
  /** NGN per unit of the source currency; null when the salary is in NGN. */
  effectiveRate: number | null;
  rateProviderName: string | null;
  rateObservedAt: string | null;
  /** True when the source did not say gross or net and gross was assumed. */
  grossAssumed: boolean;
};

function nairaRateFor(
  currency: string,
  rates: readonly ReferenceCurrencyRate[],
): { rate: number; providerName: string; observedAt: string } | null {
  for (const row of rates) {
    if (row.base_currency === currency && row.quote_currency === "NGN") {
      return {
        rate: row.rate,
        providerName: row.provider_name,
        observedAt: row.observed_at,
      };
    }
    if (row.base_currency === "NGN" && row.quote_currency === currency) {
      return {
        rate: 1 / row.rate,
        providerName: row.provider_name,
        observedAt: row.observed_at,
      };
    }
  }
  // Cross through a shared base (the reference provider publishes one base
  // currency against many quotes).
  for (const toNaira of rates) {
    if (toNaira.quote_currency !== "NGN") continue;
    const toSource = rates.find(
      (row) =>
        row.base_currency === toNaira.base_currency &&
        row.quote_currency === currency,
    );
    if (!toSource) continue;
    return {
      rate: toNaira.rate / toSource.rate,
      providerName: toNaira.provider_name,
      observedAt: toNaira.observed_at,
    };
  }
  return null;
}

export function estimateNairaTakeHome(
  salary: SalaryRange | null,
  rates: readonly ReferenceCurrencyRate[],
  calculationDate: string = new Date().toISOString().slice(0, 10),
): NairaTakeHomeEstimate | null {
  if (!salary || !salary.currency) return null;
  if (salary.grossNet === "net") return null;
  const factor = ANNUALIZATION_FACTORS[salary.payPeriod];
  if (factor === null) return null;

  const basis = salary.minimum !== null ? "minimum" : "maximum";
  const amount = salary.minimum ?? salary.maximum;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const sourceAnnualAmount = amount * factor;

  let annualGrossNgn: number;
  let effectiveRate: number | null = null;
  let rateProviderName: string | null = null;
  let rateObservedAt: string | null = null;
  if (salary.currency === "NGN") {
    annualGrossNgn = sourceAnnualAmount;
  } else {
    const conversion = nairaRateFor(salary.currency, rates);
    if (!conversion) return null;
    annualGrossNgn = sourceAnnualAmount * conversion.rate;
    effectiveRate = conversion.rate;
    rateProviderName = conversion.providerName;
    rateObservedAt = conversion.observedAt;
  }
  if (!Number.isFinite(annualGrossNgn) || annualGrossNgn <= 0) return null;

  let monthlyTakeHomeNgn: number;
  try {
    const payroll = calculateNigeriaPayroll({
      calculationDate,
      grossCashPay: { amount: annualGrossNgn, period: "annual" },
      pension: {
        mode: "statutory",
        pensionableEmoluments: { amount: annualGrossNgn, period: "annual" },
      },
      nhf: { sector: "private" },
      healthInsuranceContribution: { amount: 0, period: "annual" },
    });
    monthlyTakeHomeNgn = payroll.monthly.takeHomePay;
  } catch {
    return null;
  }
  if (!Number.isFinite(monthlyTakeHomeNgn) || monthlyTakeHomeNgn <= 0) {
    return null;
  }

  return {
    basis,
    sourceCurrency: salary.currency,
    sourceAnnualAmount,
    annualGrossNgn,
    monthlyTakeHomeNgn,
    effectiveRate,
    rateProviderName,
    rateObservedAt,
    grossAssumed: salary.grossNet === "unknown",
  };
}
