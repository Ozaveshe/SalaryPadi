import type {
  PayrollBreakdown,
  PayrollPeriod,
  PeriodicAmount,
  ProgressiveTaxBand,
} from "./types";

const BASIS_POINTS_DENOMINATOR = 10_000;
const MAX_ANNUAL_AMOUNT = 1_000_000_000_000;

export function roundNaira(value: number): number {
  return Math.round(value);
}

function assertFiniteNonNegativeAmount(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite, non-negative number`);
  }
}

function assertPeriod(
  value: unknown,
  label: string,
): asserts value is PayrollPeriod {
  if (value !== "monthly" && value !== "annual") {
    throw new TypeError(`${label}.period must be either monthly or annual`);
  }
}

export function normalizeToAnnual(
  value: PeriodicAmount,
  label = "amount",
): number {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${label} is required`);
  }

  assertFiniteNonNegativeAmount(value.amount, `${label}.amount`);
  assertPeriod(value.period, label);

  const roundedInput = roundNaira(value.amount);
  const annual = value.period === "monthly" ? roundedInput * 12 : roundedInput;
  if (!Number.isSafeInteger(annual) || annual > MAX_ANNUAL_AMOUNT) {
    throw new RangeError(`${label} is too large to calculate safely`);
  }

  return annual;
}

export function applyBasisPoints(amount: number, rateBps: number): number {
  return roundNaira((amount * rateBps) / BASIS_POINTS_DENOMINATOR);
}

export function safeSum(values: readonly number[], label: string): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`${label} is too large to calculate safely`);
  }
  return total;
}

export function calculateProgressiveTax(
  annualChargeableIncome: number,
  bands: readonly ProgressiveTaxBand[],
): number {
  assertFiniteNonNegativeAmount(
    annualChargeableIncome,
    "annualChargeableIncome",
  );
  const chargeableIncome = roundNaira(annualChargeableIncome);

  let lowerBound = 0;
  let taxBasisPointNaira = 0;

  for (const band of bands) {
    if (!Number.isInteger(band.rateBps) || band.rateBps < 0) {
      throw new TypeError(
        "Tax-band rates must be non-negative integer basis points",
      );
    }

    const upperBound = band.upperBoundAnnual ?? chargeableIncome;
    if (upperBound < lowerBound) {
      throw new TypeError("Tax-band upper bounds must be ordered");
    }

    const taxableInBand = Math.max(
      0,
      Math.min(chargeableIncome, upperBound) - lowerBound,
    );
    taxBasisPointNaira += taxableInBand * band.rateBps;

    if (chargeableIncome <= upperBound || band.upperBoundAnnual === null) {
      break;
    }
    lowerBound = upperBound;
  }

  if (!Number.isSafeInteger(taxBasisPointNaira)) {
    throw new RangeError("PAYE is too large to calculate safely");
  }

  return roundNaira(taxBasisPointNaira / BASIS_POINTS_DENOMINATOR);
}

export function toMonthlyBreakdown(annual: PayrollBreakdown): PayrollBreakdown {
  return {
    grossCashPay: roundNaira(annual.grossCashPay / 12),
    taxExemptEmploymentIncome: roundNaira(
      annual.taxExemptEmploymentIncome / 12,
    ),
    taxableCashEmploymentIncome: roundNaira(
      annual.taxableCashEmploymentIncome / 12,
    ),
    taxableBenefitsInKind: roundNaira(annual.taxableBenefitsInKind / 12),
    grossEmploymentIncome: roundNaira(annual.grossEmploymentIncome / 12),
    employeePension: roundNaira(annual.employeePension / 12),
    nationalHousingFund: roundNaira(annual.nationalHousingFund / 12),
    healthInsurance: roundNaira(annual.healthInsurance / 12),
    ownerOccupiedMortgageInterest: roundNaira(
      annual.ownerOccupiedMortgageInterest / 12,
    ),
    lifeInsuranceOrDeferredAnnuity: roundNaira(
      annual.lifeInsuranceOrDeferredAnnuity / 12,
    ),
    rentPaid: roundNaira(annual.rentPaid / 12),
    rentRelief: roundNaira(annual.rentRelief / 12),
    totalEligibleTaxDeductions: roundNaira(
      annual.totalEligibleTaxDeductions / 12,
    ),
    chargeableIncome: roundNaira(annual.chargeableIncome / 12),
    paye: roundNaira(annual.paye / 12),
    otherDeductions: roundNaira(annual.otherDeductions / 12),
    totalCashDeductions: roundNaira(annual.totalCashDeductions / 12),
    takeHomePay: roundNaira(annual.takeHomePay / 12),
  };
}
