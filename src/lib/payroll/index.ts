export {
  calculateNigeriaPayroll,
  calculateProgressiveTax,
  normalizeToAnnual,
} from "./calculate";
export {
  NIGERIA_PAYROLL_RULE_SETS,
  NIGERIA_PAYROLL_RULES_2026,
  assertIsoDate,
  assertNigeriaPayrollRuleSets,
  resolveNigeriaPayrollRules,
} from "./rules";
export type {
  EligibleTaxDeductionInput,
  NhfInput,
  NigeriaPayrollInput,
  NigeriaPayrollResult,
  NigeriaPayrollRuleSet,
  NormalizedOtherDeduction,
  OtherDeductionInput,
  PayrollBreakdown,
  PayrollCalculationDecision,
  PayrollNotice,
  PayrollPeriod,
  PayrollRuleSource,
  PensionInput,
  PeriodicAmount,
  ProgressiveTaxBand,
} from "./types";
