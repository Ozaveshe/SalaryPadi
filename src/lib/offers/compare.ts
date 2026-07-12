import type {
  AmountDifference,
  CompareOffersInput,
  DifferenceLeader,
  MoneyInput,
  NegotiationTalkingPoint,
  NonFinancialDifference,
  NormalizedAmount,
  NormalizedOffer,
  OfferComparisonResult,
  OfferInput,
  WorkCostInput,
} from "./types";
import { OfferComparisonError } from "./types";
import {
  addAmounts,
  isValidCurrency,
  MONEY_PRECISION,
  normalizeCurrency,
  normalizeMoney,
  roundMoney,
  subtractAmounts,
} from "./money";
import { buildRateResolver, validateOffer, validateRates } from "./validation";

function normalizeOffer(
  offer: OfferInput,
  comparisonCurrency: string,
  resolveRate: (from: string, to: string) => number,
): NormalizedOffer {
  const normalize = (value: MoneyInput) =>
    normalizeMoney(value, comparisonCurrency, resolveRate);
  const basePay = normalize(offer.basePay);
  const guaranteedVariables = (offer.variablePay ?? [])
    .filter((component) => component.guaranteed)
    .map((component) => normalize(component.value));
  const nonGuaranteedVariables = (offer.variablePay ?? [])
    .filter((component) => !component.guaranteed)
    .map((component) => normalize(component.value));
  const guaranteedCashCompensation = addAmounts(comparisonCurrency, [
    basePay,
    ...guaranteedVariables,
  ]);
  const nonGuaranteedCashCompensation = addAmounts(
    comparisonCurrency,
    nonGuaranteedVariables,
  );
  const totalCashCompensation = addAmounts(comparisonCurrency, [
    guaranteedCashCompensation,
    nonGuaranteedCashCompensation,
  ]);
  const estimatedBenefitValue = addAmounts(
    comparisonCurrency,
    (offer.benefits ?? []).map((component) => normalize(component.value)),
  );
  const personalWorkCosts = addAmounts(
    comparisonCurrency,
    (offer.personalCosts ?? []).map((component) => normalize(component.value)),
  );
  const deductionsWereExplicit = offer.estimatedDeductions !== undefined;
  const estimatedDeductions =
    offer.payBasis === "gross" && deductionsWereExplicit
      ? addAmounts(
          comparisonCurrency,
          (offer.estimatedDeductions ?? []).map((component) =>
            normalize(component.value),
          ),
        )
      : null;
  const estimatedCashTakeHome =
    offer.payBasis === "net"
      ? totalCashCompensation
      : estimatedDeductions
        ? subtractAmounts(
            comparisonCurrency,
            totalCashCompensation,
            estimatedDeductions,
          )
        : null;
  const totalCompensation = addAmounts(comparisonCurrency, [
    totalCashCompensation,
    estimatedBenefitValue,
  ]);
  const effectiveValue = subtractAmounts(
    comparisonCurrency,
    totalCompensation,
    personalWorkCosts,
  );
  const effectiveTakeHomeValue = estimatedCashTakeHome
    ? subtractAmounts(
        comparisonCurrency,
        addAmounts(comparisonCurrency, [
          estimatedCashTakeHome,
          estimatedBenefitValue,
        ]),
        personalWorkCosts,
      )
    : null;

  const warnings: string[] = [];
  if (offer.payBasis === "gross" && !deductionsWereExplicit) {
    warnings.push(
      "Take-home value is unavailable because this gross offer has no user-supplied deduction estimate.",
    );
  }
  if (
    estimatedDeductions &&
    estimatedDeductions.annual > totalCashCompensation.annual
  ) {
    warnings.push(
      "The entered deductions exceed total cash compensation; check the deduction inputs.",
    );
  }

  return {
    id: offer.id,
    label: offer.label,
    payBasis: offer.payBasis,
    comparisonCurrency,
    basePay,
    guaranteedCashCompensation,
    nonGuaranteedCashCompensation,
    totalCashCompensation,
    estimatedBenefitValue,
    personalWorkCosts,
    estimatedDeductions,
    estimatedCashTakeHome,
    totalCompensation,
    effectiveValue,
    effectiveTakeHomeValue,
    terms: offer.terms,
    warnings,
  };
}

function leaderForDelta(
  delta: number,
  lowerIsBetter: boolean,
): DifferenceLeader {
  if (delta === 0) return "tie";
  if (lowerIsBetter) return delta < 0 ? "offer_a" : "offer_b";
  return delta > 0 ? "offer_a" : "offer_b";
}

function difference(
  currency: string,
  offerA: NormalizedAmount | null,
  offerB: NormalizedAmount | null,
  lowerIsBetter = false,
): AmountDifference {
  if (!offerA || !offerB) {
    return { currency, monthly: null, annual: null, leader: "unknown" };
  }

  const annual = roundMoney(offerA.annual - offerB.annual);
  const monthly = roundMoney(offerA.monthly - offerB.monthly);
  return {
    currency,
    monthly,
    annual,
    leader: leaderForDelta(annual, lowerIsBetter),
  };
}

function displayValue(
  value: string | number | undefined,
  fallback = "Not entered",
) {
  return value === undefined ? fallback : String(value);
}

function equipmentLabel(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "None entered";
}

function buildNonFinancialDifferences(
  offerA: NormalizedOffer,
  offerB: NormalizedOffer,
): NonFinancialDifference[] {
  const differences: NonFinancialDifference[] = [];
  const add = (
    kind: NonFinancialDifference["kind"],
    valueA: string | number | undefined,
    valueB: string | number | undefined,
    summary: string,
  ) => {
    if (valueA !== valueB) {
      differences.push({
        kind,
        offerA: displayValue(valueA),
        offerB: displayValue(valueB),
        summary,
      });
    }
  };

  add(
    "arrangement",
    offerA.terms.arrangement,
    offerB.terms.arrangement,
    "The contract arrangements differ; compare the written responsibilities and protections in each agreement.",
  );
  add(
    "work_mode",
    offerA.terms.workMode,
    offerB.terms.workMode,
    "The entered work modes differ.",
  );
  add(
    "paid_leave",
    offerA.terms.paidLeaveDays,
    offerB.terms.paidLeaveDays,
    "The entered paid-leave allowances differ.",
  );
  add(
    "commute_time",
    offerA.terms.commuteHoursPerWeek,
    offerB.terms.commuteHoursPerWeek,
    "The entered weekly commute times differ.",
  );
  add(
    "contract_term",
    offerA.terms.contractTermMonths,
    offerB.terms.contractTermMonths,
    "The entered contract terms differ.",
  );
  add(
    "notice_period",
    offerA.terms.noticePeriodDays,
    offerB.terms.noticePeriodDays,
    "The entered notice periods differ.",
  );

  const equipmentA = equipmentLabel(offerA.terms.equipmentProvided);
  const equipmentB = equipmentLabel(offerB.terms.equipmentProvided);
  if (equipmentA !== equipmentB) {
    differences.push({
      kind: "equipment",
      offerA: equipmentA,
      offerB: equipmentB,
      summary: "The equipment listed as provided differs.",
    });
  }

  return differences;
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${roundMoney(Math.abs(amount)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: MONEY_PRECISION,
  })}`;
}

function higherAndLower(
  delta: number,
  offerA: NormalizedOffer,
  offerB: NormalizedOffer,
) {
  return delta > 0
    ? { higher: offerA, lower: offerB }
    : { higher: offerB, lower: offerA };
}

function totalCostsByKind(
  offer: OfferInput,
  kinds: readonly WorkCostInput["kind"][],
  comparisonCurrency: string,
  resolveRate: (from: string, to: string) => number,
): NormalizedAmount {
  return addAmounts(
    comparisonCurrency,
    (offer.personalCosts ?? [])
      .filter((cost) => kinds.includes(cost.kind))
      .map((cost) =>
        normalizeMoney(cost.value, comparisonCurrency, resolveRate),
      ),
  );
}

function buildTalkingPoints(
  sourceA: OfferInput,
  sourceB: OfferInput,
  offerA: NormalizedOffer,
  offerB: NormalizedOffer,
  comparisonCurrency: string,
  resolveRate: (from: string, to: string) => number,
): NegotiationTalkingPoint[] {
  const points: NegotiationTalkingPoint[] = [];
  const guaranteedDelta =
    offerA.guaranteedCashCompensation.monthly -
    offerB.guaranteedCashCompensation.monthly;
  if (roundMoney(guaranteedDelta) !== 0) {
    const { higher, lower } = higherAndLower(guaranteedDelta, offerA, offerB);
    points.push({
      kind: "guaranteed_cash_gap",
      title: "Discuss the guaranteed cash gap",
      evidence: `${higher.label} has ${formatMoney(comparisonCurrency, guaranteedDelta)} more guaranteed cash per normalized month than ${lower.label}, based on the entered values.`,
      suggestion: `Ask whether ${lower.label} can increase base pay or a guaranteed allowance to narrow that entered gap.`,
    });
  }

  [offerA, offerB].forEach((offer) => {
    if (offer.nonGuaranteedCashCompensation.annual > 0) {
      points.push({
        kind: "variable_pay_clarity",
        title: `Clarify ${offer.label}'s variable pay`,
        evidence: `${formatMoney(comparisonCurrency, offer.nonGuaranteedCashCompensation.annual)} of ${offer.label}'s entered annual cash is not guaranteed.`,
        suggestion:
          "Ask for the written targets, calculation formula, payment timing, eligibility rules, and conditions that can reduce or cancel payment.",
      });
    }
  });

  const benefitDelta =
    offerA.estimatedBenefitValue.monthly - offerB.estimatedBenefitValue.monthly;
  if (roundMoney(benefitDelta) !== 0) {
    const { higher, lower } = higherAndLower(benefitDelta, offerA, offerB);
    points.push({
      kind: "benefit_gap",
      title: "Discuss the benefit-value gap",
      evidence: `Your entered benefit values are ${formatMoney(comparisonCurrency, benefitDelta)} higher per normalized month for ${higher.label} than ${lower.label}.`,
      suggestion: `Ask whether ${lower.label} can add an equivalent benefit or allowance; keep the comparison tied to your own entered valuations.`,
    });
  }

  const costDelta =
    offerA.personalWorkCosts.monthly - offerB.personalWorkCosts.monthly;
  if (roundMoney(costDelta) !== 0) {
    const { higher, lower } = higherAndLower(costDelta, offerA, offerB);
    points.push({
      kind: "work_cost_gap",
      title: "Address the work-cost gap",
      evidence: `You entered ${formatMoney(comparisonCurrency, costDelta)} more personal work costs per normalized month for ${higher.label} than ${lower.label}.`,
      suggestion: `Ask ${higher.label} about a transport, electricity, data, or remote-work allowance that matches the costs you actually entered.`,
    });
  }

  [
    { source: sourceA, normalized: offerA },
    { source: sourceB, normalized: offerB },
  ].forEach(({ source, normalized }) => {
    const transferCosts = totalCostsByKind(
      source,
      ["transfer", "exchange"],
      comparisonCurrency,
      resolveRate,
    );
    if (transferCosts.annual > 0) {
      points.push({
        kind: "transfer_cost",
        title: `Confirm payment costs for ${normalized.label}`,
        evidence: `You entered ${formatMoney(comparisonCurrency, transferCosts.annual)} a year in exchange or transfer costs for ${normalized.label}.`,
        suggestion:
          "Ask which exchange rate, transfer method, payment currency, and fee payer will be written into the agreement.",
      });
    }
    if (!normalized.estimatedCashTakeHome) {
      points.push({
        kind: "take_home_unknown",
        title: `Resolve ${normalized.label}'s take-home uncertainty`,
        evidence: `${normalized.label} is entered as gross pay without an explicit deduction estimate, so SalaryPadi did not calculate take-home value.`,
        suggestion:
          "Confirm who handles tax and statutory deductions, then enter your own estimate before comparing take-home values.",
      });
    }
  });

  if (offerA.terms.arrangement !== offerB.terms.arrangement) {
    points.push({
      kind: "contract_difference",
      title: "Compare the written contract responsibilities",
      evidence: `${offerA.label} is entered as ${offerA.terms.arrangement}, while ${offerB.label} is entered as ${offerB.terms.arrangement}.`,
      suggestion:
        "Ask each employer to clarify tax handling, leave, equipment, notice, termination, insurance, and statutory-benefit responsibilities in writing.",
    });
  }

  const leaveA = offerA.terms.paidLeaveDays;
  const leaveB = offerB.terms.paidLeaveDays;
  if (leaveA !== undefined && leaveB !== undefined && leaveA !== leaveB) {
    const higher = leaveA > leaveB ? offerA : offerB;
    const lower = leaveA > leaveB ? offerB : offerA;
    points.push({
      kind: "paid_leave_gap",
      title: "Discuss paid leave",
      evidence: `${higher.label} includes ${Math.abs(leaveA - leaveB)} more entered paid-leave days than ${lower.label}.`,
      suggestion: `Ask whether ${lower.label} can match the leave allowance or explain how unused leave and public holidays are handled.`,
    });
  }

  const commuteA = offerA.terms.commuteHoursPerWeek;
  const commuteB = offerB.terms.commuteHoursPerWeek;
  if (
    commuteA !== undefined &&
    commuteB !== undefined &&
    commuteA !== commuteB
  ) {
    const higher = commuteA > commuteB ? offerA : offerB;
    const lower = commuteA > commuteB ? offerB : offerA;
    points.push({
      kind: "commute_gap",
      title: "Discuss commute time or flexibility",
      evidence: `You entered ${Math.abs(commuteA - commuteB)} more commute hours per week for ${higher.label} than ${lower.label}.`,
      suggestion: `Ask ${higher.label} whether hybrid days, flexible hours, or transport support can reduce the entered difference.`,
    });
  }

  const equipmentA = equipmentLabel(offerA.terms.equipmentProvided);
  const equipmentB = equipmentLabel(offerB.terms.equipmentProvided);
  if (equipmentA !== equipmentB) {
    points.push({
      kind: "equipment_gap",
      title: "Confirm equipment in writing",
      evidence: `${offerA.label} lists ${equipmentA}; ${offerB.label} lists ${equipmentB}.`,
      suggestion:
        "Ask what will be supplied, who pays for maintenance and replacement, and whether any repayment condition applies.",
    });
  }

  return points;
}

/**
 * Normalizes two user-entered offers without external calls or market data.
 * Currency conversion uses only the rates present in `input.fxRates`.
 */
export function compareOffers(
  input: CompareOffersInput,
): OfferComparisonResult {
  const comparisonCurrency = normalizeCurrency(input.comparisonCurrency);
  const rates = input.fxRates ?? [];
  const issues = [
    ...(isValidCurrency(comparisonCurrency)
      ? []
      : ["Comparison currency must be a three-letter currency code."]),
    ...validateOffer(input.offerA, "A"),
    ...validateOffer(input.offerB, "B"),
    ...validateRates(rates),
  ];
  if (issues.length > 0) throw new OfferComparisonError(issues);

  const resolveRate = buildRateResolver(rates);
  const offerA = normalizeOffer(input.offerA, comparisonCurrency, resolveRate);
  const offerB = normalizeOffer(input.offerB, comparisonCurrency, resolveRate);

  return {
    comparisonCurrency,
    offerA,
    offerB,
    differences: {
      basePay: difference(comparisonCurrency, offerA.basePay, offerB.basePay),
      guaranteedCashCompensation: difference(
        comparisonCurrency,
        offerA.guaranteedCashCompensation,
        offerB.guaranteedCashCompensation,
      ),
      nonGuaranteedCashCompensation: difference(
        comparisonCurrency,
        offerA.nonGuaranteedCashCompensation,
        offerB.nonGuaranteedCashCompensation,
      ),
      totalCashCompensation: difference(
        comparisonCurrency,
        offerA.totalCashCompensation,
        offerB.totalCashCompensation,
      ),
      estimatedBenefitValue: difference(
        comparisonCurrency,
        offerA.estimatedBenefitValue,
        offerB.estimatedBenefitValue,
      ),
      personalWorkCosts: difference(
        comparisonCurrency,
        offerA.personalWorkCosts,
        offerB.personalWorkCosts,
        true,
      ),
      estimatedDeductions: difference(
        comparisonCurrency,
        offerA.estimatedDeductions,
        offerB.estimatedDeductions,
        true,
      ),
      estimatedCashTakeHome: difference(
        comparisonCurrency,
        offerA.estimatedCashTakeHome,
        offerB.estimatedCashTakeHome,
      ),
      totalCompensation: difference(
        comparisonCurrency,
        offerA.totalCompensation,
        offerB.totalCompensation,
      ),
      effectiveValue: difference(
        comparisonCurrency,
        offerA.effectiveValue,
        offerB.effectiveValue,
      ),
      effectiveTakeHomeValue: difference(
        comparisonCurrency,
        offerA.effectiveTakeHomeValue,
        offerB.effectiveTakeHomeValue,
      ),
    },
    nonFinancialDifferences: buildNonFinancialDifferences(offerA, offerB),
    negotiationTalkingPoints: buildTalkingPoints(
      input.offerA,
      input.offerB,
      offerA,
      offerB,
      comparisonCurrency,
      resolveRate,
    ),
    normalizationNotes: [
      "All exchange rates came from the submitted comparison; no live or market rate was fetched.",
      "Monthly values are annual normalized values divided by 12.",
      "Weekly values use 52 periods per year unless periodsPerYear was explicitly overridden.",
      "One-time values are included in first-year annual totals.",
      "Benefit values and deduction estimates are the user's inputs, not SalaryPadi market or tax estimates.",
    ],
  };
}
