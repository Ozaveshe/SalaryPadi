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
  const value = (amount: number) => Math.round(amount / 12);
  return {
    grossCashPay: value(annual.grossCashPay),
    taxExemptEmploymentIncome: value(annual.taxExemptEmploymentIncome),
    taxableCashEmploymentIncome: value(annual.taxableCashEmploymentIncome),
    taxableBenefitsInKind: value(annual.taxableBenefitsInKind),
    grossEmploymentIncome: value(annual.grossEmploymentIncome),
    employeePension: value(annual.employeePension),
    nationalHousingFund: value(annual.nationalHousingFund),
    healthInsurance: value(annual.healthInsurance),
    ownerOccupiedMortgageInterest: value(annual.ownerOccupiedMortgageInterest),
    lifeInsuranceOrDeferredAnnuity: value(
      annual.lifeInsuranceOrDeferredAnnuity,
    ),
    rentPaid: value(annual.rentPaid),
    rentRelief: value(annual.rentRelief),
    totalEligibleTaxDeductions: value(annual.totalEligibleTaxDeductions),
    chargeableIncome: value(annual.chargeableIncome),
    paye: value(annual.paye),
    otherDeductions: value(annual.otherDeductions),
    totalCashDeductions: value(annual.totalCashDeductions),
    takeHomePay: value(annual.takeHomePay),
  };
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
