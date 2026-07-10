import type { NigeriaPayrollResult, PayrollBreakdown } from "@/lib/payroll";

export interface AfroToolsTaxResult {
  deductions: {
    pension: number;
    nhf: number;
    nhis: number;
    rentRelief: number;
  };
  tax: {
    taxableIncome: number;
    netTax: number;
  };
}

function monthly(annual: PayrollBreakdown): PayrollBreakdown {
  return Object.fromEntries(
    Object.entries(annual).map(([key, value]) => [key, Math.round(value / 12)]),
  ) as unknown as PayrollBreakdown;
}

export function mergeAfroToolsTaxResult(
  local: NigeriaPayrollResult,
  upstream: AfroToolsTaxResult,
): NigeriaPayrollResult {
  const annual: PayrollBreakdown = {
    ...local.annual,
    employeePension: Math.round(upstream.deductions.pension),
    nationalHousingFund: Math.round(upstream.deductions.nhf),
    healthInsurance: Math.round(upstream.deductions.nhis),
    rentRelief: Math.round(upstream.deductions.rentRelief),
    chargeableIncome: Math.round(upstream.tax.taxableIncome),
    paye: Math.round(upstream.tax.netTax),
  };
  annual.totalEligibleTaxDeductions =
    annual.employeePension +
    annual.nationalHousingFund +
    annual.healthInsurance +
    annual.ownerOccupiedMortgageInterest +
    annual.lifeInsuranceOrDeferredAnnuity +
    annual.rentRelief;
  annual.totalCashDeductions =
    annual.employeePension +
    annual.nationalHousingFund +
    annual.healthInsurance +
    annual.paye +
    annual.otherDeductions;
  annual.takeHomePay = annual.grossCashPay - annual.totalCashDeductions;
  return { ...local, annual, monthly: monthly(annual) };
}
