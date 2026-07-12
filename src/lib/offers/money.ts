import type { MoneyInput, NormalizedAmount } from "./types";
import { OfferComparisonError } from "./types";

const STANDARD_PERIODS_PER_YEAR = {
  weekly: 52,
  monthly: 12,
  annual: 1,
  one_time: 1,
} as const;

export const MONEY_PRECISION = 2;

export function roundMoney(value: number): number {
  const scale = 10 ** MONEY_PRECISION;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(normalizeCurrency(value));
}

function periodsPerYear(value: MoneyInput): number {
  if (value.periodsPerYear !== undefined) {
    return value.periodsPerYear;
  }

  if (value.payPeriod === "hourly" || value.payPeriod === "daily") {
    throw new OfferComparisonError([
      `${value.payPeriod} values require an explicit periodsPerYear value.`,
    ]);
  }

  return STANDARD_PERIODS_PER_YEAR[value.payPeriod];
}

export function amountFromAnnual(
  currency: string,
  annualValue: number,
): NormalizedAmount {
  const annual = roundMoney(annualValue);
  return {
    currency,
    monthly: roundMoney(annualValue / 12),
    annual,
  };
}

export function addAmounts(
  currency: string,
  amounts: readonly NormalizedAmount[],
): NormalizedAmount {
  return amountFromAnnual(
    currency,
    amounts.reduce((total, amount) => total + amount.annual, 0),
  );
}

export function subtractAmounts(
  currency: string,
  left: NormalizedAmount,
  ...right: readonly NormalizedAmount[]
): NormalizedAmount {
  return amountFromAnnual(
    currency,
    left.annual - right.reduce((total, amount) => total + amount.annual, 0),
  );
}

export function normalizeMoney(
  value: MoneyInput,
  comparisonCurrency: string,
  resolveRate: (from: string, to: string) => number,
): NormalizedAmount {
  const annualInOriginalCurrency = value.amount * periodsPerYear(value);
  const annual =
    annualInOriginalCurrency *
    resolveRate(normalizeCurrency(value.currency), comparisonCurrency);
  return amountFromAnnual(comparisonCurrency, annual);
}
