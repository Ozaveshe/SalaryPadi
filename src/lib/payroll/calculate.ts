import { resolveNigeriaPayrollRules } from "./rules";
import {
  applyBasisPoints,
  calculateProgressiveTax,
  normalizeToAnnual,
  roundNaira,
  safeSum,
  toMonthlyBreakdown,
} from "./math";
import type {
  NhfInput,
  NigeriaPayrollInput,
  NigeriaPayrollResult,
  NormalizedOtherDeduction,
  PayrollBreakdown,
  PayrollNotice,
} from "./types";

const MAX_OTHER_DEDUCTIONS = 100;

export { calculateProgressiveTax, normalizeToAnnual } from "./math";

function addNotice(
  target: PayrollNotice[],
  code: string,
  message: string,
): void {
  target.push({ code, message });
}

function calculateNhf(input: {
  nhf: NhfInput;
  annualGrossCashPay: number;
  annualMinimumWage: number;
  employeeRateBps: number;
  assumptions: PayrollNotice[];
  warnings: PayrollNotice[];
}) {
  const { nhf, annualGrossCashPay, annualMinimumWage, employeeRateBps } = input;
  if (!nhf || typeof nhf !== "object") {
    throw new TypeError("nhf is required");
  }
  if (nhf.sector !== "public" && nhf.sector !== "private") {
    throw new TypeError("nhf.sector must be either public or private");
  }

  const atOrAboveMinimumWage = annualGrossCashPay >= annualMinimumWage;
  const defaultParticipation = nhf.sector === "public" && atOrAboveMinimumWage;
  const usedParticipationOverride = nhf.participationOverride !== undefined;
  const participates = nhf.participationOverride ?? defaultParticipation;

  if (!participates && nhf.actualEmployeeContribution !== undefined) {
    throw new TypeError(
      "nhf.actualEmployeeContribution cannot be supplied when NHF participation is disabled",
    );
  }

  if (
    nhf.sector === "public" &&
    atOrAboveMinimumWage &&
    nhf.participationOverride === false
  ) {
    addNotice(
      input.warnings,
      "PUBLIC_NHF_OPT_OUT_OVERRIDE",
      "NHF was excluded by override even though the rule set treats qualifying public-sector participation as mandatory.",
    );
  }

  if (nhf.sector === "public" && !atOrAboveMinimumWage && participates) {
    addNotice(
      input.warnings,
      "PUBLIC_NHF_BELOW_THRESHOLD_OVERRIDE",
      "NHF was included by override although gross cash pay is below the current minimum-wage threshold.",
    );
  }

  if (nhf.sector === "private" && participates) {
    addNotice(
      input.assumptions,
      "PRIVATE_NHF_OPT_IN",
      "Private-sector NHF participation is voluntary and was included for this calculation.",
    );
  } else if (nhf.sector === "private") {
    addNotice(
      input.assumptions,
      "PRIVATE_NHF_NOT_INCLUDED",
      "Private-sector NHF participation defaults to excluded unless explicitly enabled.",
    );
  }

  if (!participates) {
    return {
      employeeContributionAnnual: 0,
      participates,
      usedParticipationOverride,
      contributionBaseAnnual: null,
      usedActualContribution: false,
    };
  }

  const contributionBaseAnnual = nhf.contributionBase
    ? normalizeToAnnual(nhf.contributionBase, "nhf.contributionBase")
    : annualGrossCashPay;

  if (!nhf.contributionBase) {
    addNotice(
      input.assumptions,
      "NHF_BASE_ASSUMED_GROSS_CASH",
      "No NHF base was supplied, so gross cash pay was used as monthly income; provide the employer's actual base to override it.",
    );
  }
  if (contributionBaseAnnual > annualGrossCashPay) {
    addNotice(
      input.warnings,
      "NHF_BASE_EXCEEDS_GROSS_CASH",
      "The supplied NHF contribution base exceeds gross cash pay; confirm the employer's payroll basis.",
    );
  }

  const usedActualContribution = nhf.actualEmployeeContribution !== undefined;
  const employeeContributionAnnual = nhf.actualEmployeeContribution
    ? normalizeToAnnual(
        nhf.actualEmployeeContribution,
        "nhf.actualEmployeeContribution",
      )
    : applyBasisPoints(contributionBaseAnnual, employeeRateBps);

  if (usedActualContribution) {
    addNotice(
      input.assumptions,
      "ACTUAL_NHF_CONTRIBUTION_USED",
      "The supplied actual NHF contribution was used instead of calculating 2.5% of the contribution base.",
    );
  }

  return {
    employeeContributionAnnual,
    participates,
    usedParticipationOverride,
    contributionBaseAnnual,
    usedActualContribution,
  };
}

export function calculateNigeriaPayroll(
  input: NigeriaPayrollInput,
): NigeriaPayrollResult {
  if (!input || typeof input !== "object") {
    throw new TypeError("payroll input is required");
  }

  const rule = resolveNigeriaPayrollRules(input.calculationDate);
  const assumptions: PayrollNotice[] = [];
  const warnings: PayrollNotice[] = [];

  if (input.calculationDate > rule.reviewedThrough) {
    addNotice(
      warnings,
      "RULE_REVIEW_DATE_EXCEEDED",
      `This rule set was last verified through ${rule.reviewedThrough}; confirm that no later law applies.`,
    );
  }

  const annualGrossCashPay = normalizeToAnnual(
    input.grossCashPay,
    "grossCashPay",
  );
  const annualTaxExemptIncome = input.taxExemptEmploymentIncome
    ? normalizeToAnnual(
        input.taxExemptEmploymentIncome,
        "taxExemptEmploymentIncome",
      )
    : 0;
  if (annualTaxExemptIncome > annualGrossCashPay) {
    throw new RangeError(
      "taxExemptEmploymentIncome cannot exceed grossCashPay",
    );
  }

  const annualTaxableCashIncome = annualGrossCashPay - annualTaxExemptIncome;
  const annualTaxableBenefitsInKind = input.taxableBenefitsInKind
    ? normalizeToAnnual(input.taxableBenefitsInKind, "taxableBenefitsInKind")
    : 0;
  const annualGrossEmploymentIncome = safeSum(
    [annualTaxableCashIncome, annualTaxableBenefitsInKind],
    "gross employment income",
  );

  if (annualTaxableBenefitsInKind > 0) {
    addNotice(
      assumptions,
      "NON_CASH_BENEFIT_TAX_ONLY",
      "Taxable benefits in kind increase employment income and PAYE but are not included in cash available to the employee.",
    );
  }

  if (!input.pension || typeof input.pension !== "object") {
    throw new TypeError(
      "pension is required and must explicitly state its mode",
    );
  }

  let pensionableEmolumentsAnnual: number | null = null;
  let statutoryEmployeePensionAnnual: number | null = null;
  let annualEmployeePension = 0;

  switch (input.pension.mode) {
    case "statutory": {
      pensionableEmolumentsAnnual = normalizeToAnnual(
        input.pension.pensionableEmoluments,
        "pension.pensionableEmoluments",
      );
      statutoryEmployeePensionAnnual = applyBasisPoints(
        pensionableEmolumentsAnnual,
        rule.pension.employeeRateBps,
      );
      annualEmployeePension = statutoryEmployeePensionAnnual;
      break;
    }
    case "actual": {
      pensionableEmolumentsAnnual = normalizeToAnnual(
        input.pension.pensionableEmoluments,
        "pension.pensionableEmoluments",
      );
      statutoryEmployeePensionAnnual = applyBasisPoints(
        pensionableEmolumentsAnnual,
        rule.pension.employeeRateBps,
      );
      annualEmployeePension = normalizeToAnnual(
        input.pension.employeeContribution,
        "pension.employeeContribution",
      );
      addNotice(
        assumptions,
        "ACTUAL_PENSION_CONTRIBUTION_USED",
        "The supplied actual employee pension contribution was used for cash and tax deductions.",
      );
      if (annualEmployeePension !== statutoryEmployeePensionAnnual) {
        addNotice(
          warnings,
          "PENSION_DIFFERS_FROM_STATUTORY_RATE",
          "The supplied employee pension contribution differs from 8% of the supplied pensionable emoluments.",
        );
      }
      break;
    }
    case "employer_covers_all":
      addNotice(
        assumptions,
        "EMPLOYER_COVERS_PENSION",
        "The employer was stated to cover the pension contribution, so no employee cash or tax deduction was included.",
      );
      break;
    case "not_applicable":
      addNotice(
        assumptions,
        "PENSION_NOT_APPLICABLE",
        "Pension was explicitly marked not applicable, so no employee contribution was included.",
      );
      break;
    default:
      throw new TypeError("pension.mode is not supported");
  }

  if (
    pensionableEmolumentsAnnual !== null &&
    pensionableEmolumentsAnnual > annualGrossCashPay
  ) {
    addNotice(
      warnings,
      "PENSIONABLE_EMOLUMENTS_EXCEED_GROSS_CASH",
      "Pensionable emoluments exceed gross cash pay; confirm the contractual pension base.",
    );
  }

  const nhf = calculateNhf({
    nhf: input.nhf,
    annualGrossCashPay,
    annualMinimumWage: rule.minimumWage.annual,
    employeeRateBps: rule.nhf.employeeRateBps,
    assumptions,
    warnings,
  });

  if (!input.healthInsuranceContribution) {
    throw new TypeError(
      "healthInsuranceContribution is required; provide an explicit amount, including zero",
    );
  }
  const annualHealthInsurance = normalizeToAnnual(
    input.healthInsuranceContribution,
    "healthInsuranceContribution",
  );
  addNotice(
    assumptions,
    "EXPLICIT_HEALTH_CONTRIBUTION_USED",
    "The supplied employee health-insurance contribution was used; no nationwide rate was inferred.",
  );

  const annualMortgageInterest = input.eligibleTaxDeductions
    ?.ownerOccupiedMortgageInterest
    ? normalizeToAnnual(
        input.eligibleTaxDeductions.ownerOccupiedMortgageInterest,
        "eligibleTaxDeductions.ownerOccupiedMortgageInterest",
      )
    : 0;
  const annualLifeInsurance = input.eligibleTaxDeductions
    ?.lifeInsuranceOrDeferredAnnuity
    ? normalizeToAnnual(
        input.eligibleTaxDeductions.lifeInsuranceOrDeferredAnnuity,
        "eligibleTaxDeductions.lifeInsuranceOrDeferredAnnuity",
      )
    : 0;
  const annualRentPaid = input.eligibleTaxDeductions?.rentPaid
    ? normalizeToAnnual(
        input.eligibleTaxDeductions.rentPaid,
        "eligibleTaxDeductions.rentPaid",
      )
    : 0;
  const annualRentRelief = Math.min(
    applyBasisPoints(annualRentPaid, rule.rentRelief.rateBps),
    rule.rentRelief.maximumAnnual,
  );

  if (
    annualMortgageInterest > 0 ||
    annualLifeInsurance > 0 ||
    annualRentPaid > 0
  ) {
    addNotice(
      warnings,
      "TAX_DEDUCTION_EVIDENCE_REQUIRED",
      "Mortgage-interest, insurance and rent claims must be qualifying amounts actually paid and may require written evidence.",
    );
  }

  const annualEligibleTaxDeductions = safeSum(
    [
      annualEmployeePension,
      nhf.employeeContributionAnnual,
      annualHealthInsurance,
      annualMortgageInterest,
      annualLifeInsurance,
      annualRentRelief,
    ],
    "eligible tax deductions",
  );
  const annualChargeableIncome = Math.max(
    0,
    annualGrossEmploymentIncome - annualEligibleTaxDeductions,
  );
  const minimumWageExemptionApplied =
    annualGrossEmploymentIncome <= rule.minimumWage.annual;
  const annualPaye = minimumWageExemptionApplied
    ? 0
    : calculateProgressiveTax(annualChargeableIncome, rule.payeBands);

  const otherDeductionInputs = input.otherDeductions ?? [];
  if (otherDeductionInputs.length > MAX_OTHER_DEDUCTIONS) {
    throw new RangeError(
      `otherDeductions cannot contain more than ${MAX_OTHER_DEDUCTIONS} items`,
    );
  }
  const otherDeductionItems: NormalizedOtherDeduction[] =
    otherDeductionInputs.map((deduction, index) => {
      if (!deduction || typeof deduction !== "object") {
        throw new TypeError(`otherDeductions[${index}] must be an object`);
      }
      const label = deduction.label?.trim();
      if (!label) {
        throw new TypeError(`otherDeductions[${index}].label is required`);
      }
      if (label.length > 80) {
        throw new RangeError(
          `otherDeductions[${index}].label cannot exceed 80 characters`,
        );
      }
      const annual = normalizeToAnnual(
        deduction.amount,
        `otherDeductions[${index}].amount`,
      );
      return { label, annual, monthly: roundNaira(annual / 12) };
    });
  const annualOtherDeductions = safeSum(
    otherDeductionItems.map((deduction) => deduction.annual),
    "other deductions",
  );

  const annualCashDeductions = safeSum(
    [
      annualEmployeePension,
      nhf.employeeContributionAnnual,
      annualHealthInsurance,
      annualPaye,
      annualOtherDeductions,
    ],
    "cash deductions",
  );
  const annualTakeHomePay = annualGrossCashPay - annualCashDeductions;

  if (annualTakeHomePay < 0) {
    addNotice(
      warnings,
      "NEGATIVE_TAKE_HOME",
      "Employee cash deductions exceed gross cash pay, often because of large non-cash benefits or other deductions.",
    );
  }

  const annual: PayrollBreakdown = {
    grossCashPay: annualGrossCashPay,
    taxExemptEmploymentIncome: annualTaxExemptIncome,
    taxableCashEmploymentIncome: annualTaxableCashIncome,
    taxableBenefitsInKind: annualTaxableBenefitsInKind,
    grossEmploymentIncome: annualGrossEmploymentIncome,
    employeePension: annualEmployeePension,
    nationalHousingFund: nhf.employeeContributionAnnual,
    healthInsurance: annualHealthInsurance,
    ownerOccupiedMortgageInterest: annualMortgageInterest,
    lifeInsuranceOrDeferredAnnuity: annualLifeInsurance,
    rentPaid: annualRentPaid,
    rentRelief: annualRentRelief,
    totalEligibleTaxDeductions: annualEligibleTaxDeductions,
    chargeableIncome: annualChargeableIncome,
    paye: annualPaye,
    otherDeductions: annualOtherDeductions,
    totalCashDeductions: annualCashDeductions,
    takeHomePay: annualTakeHomePay,
  };

  return {
    calculationDate: input.calculationDate,
    currency: rule.currency,
    rounding: rule.rounding,
    rule,
    annual,
    monthly: toMonthlyBreakdown(annual),
    otherDeductionItems,
    decisions: {
      minimumWageExemptionApplied,
      pension: {
        mode: input.pension.mode,
        pensionableEmolumentsAnnual,
        statutoryEmployeeContributionAnnual: statutoryEmployeePensionAnnual,
        actualEmployeeContributionAnnual: annualEmployeePension,
      },
      nhf: {
        sector: input.nhf.sector,
        participates: nhf.participates,
        usedParticipationOverride: nhf.usedParticipationOverride,
        contributionBaseAnnual: nhf.contributionBaseAnnual,
        usedActualContribution: nhf.usedActualContribution,
      },
    },
    assumptions,
    warnings,
  };
}
