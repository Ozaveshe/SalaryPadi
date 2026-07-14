import type {
  NegotiationTalkingPoint,
  NormalizedAmount,
  NormalizedOffer,
  OfferInput,
  WorkCostInput,
} from "./types";
import {
  addAmounts,
  MONEY_PRECISION,
  normalizeMoney,
  roundMoney,
} from "./money";
import { equipmentLabel } from "./differences";

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

export function buildTalkingPoints(
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
