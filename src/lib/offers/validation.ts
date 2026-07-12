import { isValidCurrency, normalizeCurrency } from "./money";
import type {
  FxRateInput,
  MoneyInput,
  OfferInput,
  OfferTermsInput,
} from "./types";
import { OfferComparisonError } from "./types";

function collectMoneyInputs(offer: OfferInput): MoneyInput[] {
  return [
    offer.basePay,
    ...(offer.variablePay ?? []).map((component) => component.value),
    ...(offer.benefits ?? []).map((component) => component.value),
    ...(offer.personalCosts ?? []).map((component) => component.value),
    ...(offer.estimatedDeductions ?? []).map((component) => component.value),
  ];
}

export function validateOffer(
  offer: OfferInput,
  position: "A" | "B",
): string[] {
  const issues: string[] = [];
  const prefix = `Offer ${position}`;

  if (!offer.id.trim()) issues.push(`${prefix} must have an id.`);
  if (!offer.label.trim()) issues.push(`${prefix} must have a label.`);

  collectMoneyInputs(offer).forEach((money, index) => {
    if (!Number.isFinite(money.amount) || money.amount < 0) {
      issues.push(
        `${prefix} money item ${index + 1} must have a non-negative finite amount.`,
      );
    }
    if (!isValidCurrency(money.currency)) {
      issues.push(
        `${prefix} money item ${index + 1} must use a three-letter currency code.`,
      );
    }
    if (
      (money.payPeriod === "hourly" || money.payPeriod === "daily") &&
      money.periodsPerYear === undefined
    ) {
      issues.push(
        `${prefix} ${money.payPeriod} money item ${index + 1} requires periodsPerYear.`,
      );
    }
    if (
      money.periodsPerYear !== undefined &&
      (!Number.isFinite(money.periodsPerYear) || money.periodsPerYear <= 0)
    ) {
      issues.push(
        `${prefix} money item ${index + 1} has an invalid periodsPerYear.`,
      );
    }
  });

  if (
    offer.payBasis === "net" &&
    offer.estimatedDeductions !== undefined &&
    offer.estimatedDeductions.length > 0
  ) {
    issues.push(
      `${prefix} is net pay, so estimated gross-pay deductions must not be supplied.`,
    );
  }

  const nonNegativeTerms: Array<[keyof OfferTermsInput, number | undefined]> = [
    ["paidLeaveDays", offer.terms.paidLeaveDays],
    ["commuteHoursPerWeek", offer.terms.commuteHoursPerWeek],
    ["contractTermMonths", offer.terms.contractTermMonths],
    ["noticePeriodDays", offer.terms.noticePeriodDays],
  ];

  nonNegativeTerms.forEach(([key, value]) => {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      issues.push(`${prefix} ${key} must be a non-negative finite number.`);
    }
  });

  return issues;
}

export function validateRates(rates: readonly FxRateInput[]): string[] {
  const issues: string[] = [];
  const seen = new Map<string, number>();

  rates.forEach((rate, index) => {
    const from = normalizeCurrency(rate.from);
    const to = normalizeCurrency(rate.to);
    if (!isValidCurrency(from) || !isValidCurrency(to)) {
      issues.push(`FX rate ${index + 1} must use three-letter currency codes.`);
    }
    if (!Number.isFinite(rate.rate) || rate.rate <= 0) {
      issues.push(`FX rate ${index + 1} must be a positive finite number.`);
    }
    if (from === to && rate.rate !== 1) {
      issues.push(
        `FX rate ${index + 1} converts a currency to itself and must equal 1.`,
      );
    }

    const key = `${from}:${to}`;
    const existing = seen.get(key);
    if (existing !== undefined && existing !== rate.rate) {
      issues.push(
        `Conflicting user FX rates were supplied for ${from} to ${to}.`,
      );
    }
    seen.set(key, rate.rate);
  });

  return issues;
}

export function buildRateResolver(rates: readonly FxRateInput[]) {
  const direct = new Map<string, number>();
  rates.forEach((rate) => {
    direct.set(
      `${normalizeCurrency(rate.from)}:${normalizeCurrency(rate.to)}`,
      rate.rate,
    );
  });

  return (fromValue: string, toValue: string): number => {
    const from = normalizeCurrency(fromValue);
    const to = normalizeCurrency(toValue);
    if (from === to) return 1;

    const entered = direct.get(`${from}:${to}`);
    if (entered !== undefined) return entered;

    const reverse = direct.get(`${to}:${from}`);
    if (reverse !== undefined) return 1 / reverse;

    throw new OfferComparisonError([
      `Enter an FX rate for ${from} to ${to}; SalaryPadi does not fetch or infer market rates.`,
    ]);
  };
}
