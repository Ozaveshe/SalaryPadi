export type OfferPayPeriod =
  "hourly" | "daily" | "weekly" | "monthly" | "annual" | "one_time";

export type PayBasis = "gross" | "net";

export type ContractArrangement =
  | "employee"
  | "contractor"
  | "freelance"
  | "fixed_term"
  | "internship"
  | "other";

export type OfferWorkMode = "remote" | "hybrid" | "onsite" | "flexible";

export interface MoneyInput {
  amount: number;
  currency: string;
  payPeriod: OfferPayPeriod;
  /**
   * Required for hourly and daily values. It may also override the standard
   * annual multiplier for another period when the user's contract differs.
   */
  periodsPerYear?: number;
}

export type VariablePayKind =
  "bonus" | "commission" | "thirteenth_month" | "other";

export interface VariablePayInput {
  kind: VariablePayKind;
  label?: string;
  value: MoneyInput;
  guaranteed: boolean;
}

export type BenefitKind =
  | "pension"
  | "health"
  | "transport"
  | "housing"
  | "lunch"
  | "data"
  | "paid_leave"
  | "equipment"
  | "other";

export interface ValuedBenefitInput {
  kind: BenefitKind;
  label?: string;
  /** The user's own estimated monetary value, not a market estimate. */
  value: MoneyInput;
}

export type WorkCostKind =
  "remote_work" | "electricity" | "commute" | "transfer" | "exchange" | "other";

export interface WorkCostInput {
  kind: WorkCostKind;
  label?: string;
  value: MoneyInput;
}

export interface DeductionInput {
  label: string;
  value: MoneyInput;
}

export interface OfferTermsInput {
  arrangement: ContractArrangement;
  workMode?: OfferWorkMode;
  paidLeaveDays?: number;
  equipmentProvided?: readonly string[];
  commuteHoursPerWeek?: number;
  contractTermMonths?: number;
  noticePeriodDays?: number;
}

export interface OfferInput {
  id: string;
  label: string;
  basePay: MoneyInput;
  payBasis: PayBasis;
  variablePay?: readonly VariablePayInput[];
  benefits?: readonly ValuedBenefitInput[];
  personalCosts?: readonly WorkCostInput[];
  /**
   * Explicit user-supplied estimated deductions from gross total cash pay.
   * Leave undefined when unknown. An empty array means the user explicitly
   * chose a zero-deduction estimate.
   */
  estimatedDeductions?: readonly DeductionInput[];
  terms: OfferTermsInput;
}

export interface FxRateInput {
  from: string;
  to: string;
  /** Units of `to` currency for one unit of `from` currency. */
  rate: number;
  asOf?: string;
  sourceLabel?: string;
}

export interface CompareOffersInput {
  offerA: OfferInput;
  offerB: OfferInput;
  comparisonCurrency: string;
  /** Rates entered or approved by the user. SalaryPadi never fetches a rate. */
  fxRates?: readonly FxRateInput[];
}

export interface NormalizedAmount {
  currency: string;
  monthly: number;
  annual: number;
}

export interface NormalizedOffer {
  id: string;
  label: string;
  payBasis: PayBasis;
  comparisonCurrency: string;
  basePay: NormalizedAmount;
  guaranteedCashCompensation: NormalizedAmount;
  nonGuaranteedCashCompensation: NormalizedAmount;
  totalCashCompensation: NormalizedAmount;
  estimatedBenefitValue: NormalizedAmount;
  personalWorkCosts: NormalizedAmount;
  estimatedDeductions: NormalizedAmount | null;
  estimatedCashTakeHome: NormalizedAmount | null;
  totalCompensation: NormalizedAmount;
  /** Total cash + benefits - personal costs, retaining the stated gross/net basis. */
  effectiveValue: NormalizedAmount;
  /** Cash after explicit deductions + benefits - personal costs. */
  effectiveTakeHomeValue: NormalizedAmount | null;
  terms: OfferTermsInput;
  warnings: string[];
}

export type DifferenceLeader = "offer_a" | "offer_b" | "tie" | "unknown";

export interface AmountDifference {
  currency: string;
  /** Offer A minus Offer B. */
  monthly: number | null;
  /** Offer A minus Offer B. */
  annual: number | null;
  leader: DifferenceLeader;
}

export interface OfferDifferences {
  basePay: AmountDifference;
  guaranteedCashCompensation: AmountDifference;
  nonGuaranteedCashCompensation: AmountDifference;
  totalCashCompensation: AmountDifference;
  estimatedBenefitValue: AmountDifference;
  personalWorkCosts: AmountDifference;
  estimatedDeductions: AmountDifference;
  estimatedCashTakeHome: AmountDifference;
  totalCompensation: AmountDifference;
  effectiveValue: AmountDifference;
  effectiveTakeHomeValue: AmountDifference;
}

export type NonFinancialDifferenceKind =
  | "arrangement"
  | "work_mode"
  | "paid_leave"
  | "equipment"
  | "commute_time"
  | "contract_term"
  | "notice_period";

export interface NonFinancialDifference {
  kind: NonFinancialDifferenceKind;
  offerA: string;
  offerB: string;
  summary: string;
}

export type NegotiationPointKind =
  | "guaranteed_cash_gap"
  | "variable_pay_clarity"
  | "benefit_gap"
  | "work_cost_gap"
  | "transfer_cost"
  | "take_home_unknown"
  | "contract_difference"
  | "paid_leave_gap"
  | "commute_gap"
  | "equipment_gap";

export interface NegotiationTalkingPoint {
  kind: NegotiationPointKind;
  title: string;
  /** A statement derived only from the entered offers and rates. */
  evidence: string;
  suggestion: string;
}

export interface OfferComparisonResult {
  comparisonCurrency: string;
  offerA: NormalizedOffer;
  offerB: NormalizedOffer;
  differences: OfferDifferences;
  nonFinancialDifferences: NonFinancialDifference[];
  negotiationTalkingPoints: NegotiationTalkingPoint[];
  normalizationNotes: string[];
}

export class OfferComparisonError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Cannot compare offers: ${issues.join(" ")}`);
    this.name = "OfferComparisonError";
    this.issues = issues;
  }
}
