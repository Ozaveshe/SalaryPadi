import type { MoneyInput, NormalizedOffer, OfferInput } from "./types";
import { addAmounts, normalizeMoney, subtractAmounts } from "./money";

export function normalizeOffer(
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
