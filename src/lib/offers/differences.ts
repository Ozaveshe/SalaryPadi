import type {
  AmountDifference,
  DifferenceLeader,
  NonFinancialDifference,
  NormalizedAmount,
  NormalizedOffer,
} from "./types";
import { roundMoney } from "./money";

function leaderForDelta(
  delta: number,
  lowerIsBetter: boolean,
): DifferenceLeader {
  if (delta === 0) return "tie";
  if (lowerIsBetter) return delta < 0 ? "offer_a" : "offer_b";
  return delta > 0 ? "offer_a" : "offer_b";
}

export function difference(
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

export function equipmentLabel(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "None entered";
}

export function buildNonFinancialDifferences(
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
