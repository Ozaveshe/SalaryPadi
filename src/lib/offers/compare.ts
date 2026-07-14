import type { CompareOffersInput, OfferComparisonResult } from "./types";
import { OfferComparisonError } from "./types";
import { isValidCurrency, normalizeCurrency } from "./money";
import { buildRateResolver, validateOffer, validateRates } from "./validation";
import { normalizeOffer } from "./normalize";
import { buildNonFinancialDifferences, difference } from "./differences";
import { buildTalkingPoints } from "./negotiation";

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
