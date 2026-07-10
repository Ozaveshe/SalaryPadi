export type PayrollPeriod = "monthly" | "annual";

export interface PeriodicAmount {
  amount: number;
  period: PayrollPeriod;
}

export interface PayrollRuleSource {
  id: string;
  title: string;
  authority: string;
  url: string;
  supports: readonly string[];
}

export interface ProgressiveTaxBand {
  upperBoundAnnual: number | null;
  rateBps: number;
}

export interface NigeriaPayrollRuleSet {
  id: string;
  version: string;
  jurisdiction: "NG";
  currency: "NGN";
  effectiveFrom: string;
  effectiveTo: string | null;
  reviewedThrough: string;
  rounding: "nearest_naira";
  minimumWage: {
    monthly: number;
    annual: number;
  };
  payeBands: readonly ProgressiveTaxBand[];
  pension: {
    employeeRateBps: number;
    employerRateBps: number;
    minimumPensionableComponents: readonly ["basic", "housing", "transport"];
  };
  nhf: {
    employeeRateBps: number;
    publicSectorMandatoryAtMinimumWage: true;
    privateSectorVoluntary: true;
  };
  healthInsurance: {
    nationalDefaultEmployeeRateBps: null;
  };
  rentRelief: {
    rateBps: number;
    maximumAnnual: number;
  };
  eligibleDeductionCodes: readonly [
    "employee_pension",
    "employee_nhf",
    "employee_health_insurance",
    "owner_occupied_mortgage_interest",
    "life_insurance_or_deferred_annuity",
    "rent_relief",
  ];
  caveats: readonly string[];
  sources: readonly PayrollRuleSource[];
}

export type PensionInput =
  | {
      mode: "statutory";
      pensionableEmoluments: PeriodicAmount;
    }
  | {
      mode: "actual";
      pensionableEmoluments: PeriodicAmount;
      employeeContribution: PeriodicAmount;
    }
  | {
      mode: "employer_covers_all";
    }
  | {
      mode: "not_applicable";
    };

export interface NhfInput {
  sector: "public" | "private";
  participationOverride?: boolean;
  contributionBase?: PeriodicAmount;
  actualEmployeeContribution?: PeriodicAmount;
}

export interface EligibleTaxDeductionInput {
  ownerOccupiedMortgageInterest?: PeriodicAmount;
  lifeInsuranceOrDeferredAnnuity?: PeriodicAmount;
  rentPaid?: PeriodicAmount;
}

export interface OtherDeductionInput {
  label: string;
  amount: PeriodicAmount;
}

export interface NigeriaPayrollInput {
  calculationDate: string;
  grossCashPay: PeriodicAmount;
  pension: PensionInput;
  nhf: NhfInput;
  healthInsuranceContribution: PeriodicAmount;
  taxExemptEmploymentIncome?: PeriodicAmount;
  taxableBenefitsInKind?: PeriodicAmount;
  eligibleTaxDeductions?: EligibleTaxDeductionInput;
  otherDeductions?: readonly OtherDeductionInput[];
}

export interface PayrollNotice {
  code: string;
  message: string;
}

export interface PayrollBreakdown {
  grossCashPay: number;
  taxExemptEmploymentIncome: number;
  taxableCashEmploymentIncome: number;
  taxableBenefitsInKind: number;
  grossEmploymentIncome: number;
  employeePension: number;
  nationalHousingFund: number;
  healthInsurance: number;
  ownerOccupiedMortgageInterest: number;
  lifeInsuranceOrDeferredAnnuity: number;
  rentPaid: number;
  rentRelief: number;
  totalEligibleTaxDeductions: number;
  chargeableIncome: number;
  paye: number;
  otherDeductions: number;
  totalCashDeductions: number;
  takeHomePay: number;
}

export interface NormalizedOtherDeduction {
  label: string;
  annual: number;
  monthly: number;
}

export interface PayrollCalculationDecision {
  minimumWageExemptionApplied: boolean;
  pension: {
    mode: PensionInput["mode"];
    pensionableEmolumentsAnnual: number | null;
    statutoryEmployeeContributionAnnual: number | null;
    actualEmployeeContributionAnnual: number;
  };
  nhf: {
    sector: NhfInput["sector"];
    participates: boolean;
    usedParticipationOverride: boolean;
    contributionBaseAnnual: number | null;
    usedActualContribution: boolean;
  };
}

export interface NigeriaPayrollResult {
  calculationDate: string;
  currency: "NGN";
  rounding: "nearest_naira";
  rule: NigeriaPayrollRuleSet;
  annual: PayrollBreakdown;
  monthly: PayrollBreakdown;
  otherDeductionItems: readonly NormalizedOtherDeduction[];
  decisions: PayrollCalculationDecision;
  assumptions: readonly PayrollNotice[];
  warnings: readonly PayrollNotice[];
}
