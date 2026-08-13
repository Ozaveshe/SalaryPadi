import {
  formatDateTime,
  formatEnum,
  formatExchangeRate,
  formatSalaryAmount,
} from "@/lib/format";
import type { NormalizedAmount, OfferComparisonResult } from "@/lib/offers";
import {
  calculated,
  collectAssumptions,
  displaySuffix,
  estimated,
  ORIGIN_LABELS,
  unknown,
  type ProvenancedValue,
} from "@/lib/workspace/value-provenance";

import { ToolResultRegion } from "./tool-result-region";

export type FxEvidence = {
  from: string;
  to: string;
  rate: number;
  source: string;
  updatedAt: string;
  freshness: "fresh" | "stale";
};

type ComparisonRow = {
  label: string;
  offerA: ProvenancedValue<NormalizedAmount>;
  offerB: ProvenancedValue<NormalizedAmount>;
};

function resultMoney(value: number | null, currency: string) {
  // "Unknown" is a prohibited public label: it reads as missing knowledge when
  // the real meaning is that this offer simply had no such component entered.
  return value === null ? "Not entered" : formatSalaryAmount(value, currency);
}

function calculatedAmount(value: NormalizedAmount, note: string) {
  return calculated(value, note);
}

function takeHomeAmount(
  value: NormalizedAmount | null,
  payBasis: "gross" | "net",
) {
  if (value === null) {
    return unknown<NormalizedAmount>(
      "Not calculated because no monthly deduction estimate was entered.",
    );
  }

  if (payBasis === "net") {
    return calculated(
      value,
      "Calculated from the net pay values entered; SalaryPadi did not estimate tax or statutory deductions.",
    );
  }

  return estimated(
    value,
    "Calculated only from the monthly deduction estimate entered; SalaryPadi did not estimate tax or statutory deductions.",
  );
}

function ComparisonAmount({
  amount,
  currency,
}: {
  amount: ProvenancedValue<NormalizedAmount>;
  currency: string;
}) {
  if (amount.value === null) {
    return (
      <>
        Not calculated
        <br />
        <span className="source-note">{ORIGIN_LABELS[amount.origin]}</span>
      </>
    );
  }

  const suffix = displaySuffix(amount);

  return (
    <>
      {resultMoney(amount.value.monthly, currency)}
      {suffix} / month
      <br />
      <small>
        {resultMoney(amount.value.annual, currency)}
        {suffix} / year
      </small>
      <br />
      <span className="source-note">{ORIGIN_LABELS[amount.origin]}</span>
    </>
  );
}

function uniqueRecords<T extends { label: string; detail: string }>(
  records: readonly T[],
) {
  return Array.from(
    new Map(
      records.map((record) => [`${record.label}:${record.detail}`, record]),
    ).values(),
  );
}

function FxEvidenceNotice({ evidence }: { evidence: readonly FxEvidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <div
      className={
        evidence.some((item) => item.freshness === "stale")
          ? "notice notice-warning"
          : "notice"
      }
      role="status"
    >
      <strong>AfroTools FX evidence</strong>
      {evidence.map((item) => (
        <p key={`${item.from}-${item.to}`}>
          1 {item.from} = {formatExchangeRate(item.rate) ?? "rate unavailable"}{" "}
          {item.to} · {item.source}
          {formatDateTime(item.updatedAt)
            ? ` · updated ${formatDateTime(item.updatedAt)}`
            : ""}{" "}
          {item.freshness === "stale" ? "(stale)" : ""}
        </p>
      ))}
    </div>
  );
}

export function OfferComparisonResults({
  result,
  fxEvidence,
}: {
  result: OfferComparisonResult | null;
  fxEvidence: readonly FxEvidence[];
}) {
  const baseNote =
    "Normalized from the pay amount, currency and period entered, using supplied FX evidence when conversion is needed.";
  const cashNote =
    "Calculated from the base and variable pay values entered for this offer.";
  const benefitNote =
    "Calculated from the monthly benefit values entered. Omitted benefit fields contribute zero to this comparison.";
  const costNote =
    "Calculated from the monthly personal work costs entered. Omitted cost fields contribute zero to this comparison.";
  const effectiveValueNote =
    "Calculated as total cash plus entered benefit values, minus entered personal work costs.";
  const rows: ComparisonRow[] = result
    ? [
        {
          label: "Base pay",
          offerA: calculatedAmount(result.offerA.basePay, baseNote),
          offerB: calculatedAmount(result.offerB.basePay, baseNote),
        },
        {
          label: "Guaranteed cash",
          offerA: calculatedAmount(
            result.offerA.guaranteedCashCompensation,
            cashNote,
          ),
          offerB: calculatedAmount(
            result.offerB.guaranteedCashCompensation,
            cashNote,
          ),
        },
        {
          label: "Total cash",
          offerA: calculatedAmount(
            result.offerA.totalCashCompensation,
            cashNote,
          ),
          offerB: calculatedAmount(
            result.offerB.totalCashCompensation,
            cashNote,
          ),
        },
        {
          label: "Benefit value",
          offerA: calculatedAmount(
            result.offerA.estimatedBenefitValue,
            benefitNote,
          ),
          offerB: calculatedAmount(
            result.offerB.estimatedBenefitValue,
            benefitNote,
          ),
        },
        {
          label: "Personal work costs",
          offerA: calculatedAmount(result.offerA.personalWorkCosts, costNote),
          offerB: calculatedAmount(result.offerB.personalWorkCosts, costNote),
        },
        {
          label: "Estimated cash take-home",
          offerA: takeHomeAmount(
            result.offerA.estimatedCashTakeHome,
            result.offerA.payBasis,
          ),
          offerB: takeHomeAmount(
            result.offerB.estimatedCashTakeHome,
            result.offerB.payBasis,
          ),
        },
        {
          label: "Effective value",
          offerA: calculatedAmount(
            result.offerA.effectiveValue,
            effectiveValueNote,
          ),
          offerB: calculatedAmount(
            result.offerB.effectiveValue,
            effectiveValueNote,
          ),
        },
      ]
    : [];
  const rowValues = rows.flatMap((row) => [row.offerA, row.offerB]);
  const assumptions = uniqueRecords(collectAssumptions(rowValues));
  const calculationExplanations = uniqueRecords(
    rowValues.flatMap((value) =>
      value.note &&
      value.origin !== "estimated" &&
      value.origin !== "assumption"
        ? [{ label: ORIGIN_LABELS[value.origin], detail: value.note }]
        : [],
    ),
  );

  return (
    <>
      <FxEvidenceNotice evidence={fxEvidence} />
      <ToolResultRegion>
        {result ? (
          <section className="tool-result stack-lg">
            <div>
              <p className="eyebrow">Normalized comparison</p>
              <h2 className="section-title">
                Monthly and annual value in {result.comparisonCurrency}
              </h2>
            </div>
            <div className="admin-table-wrap">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">{result.offerA.label}</th>
                    <th scope="col">{result.offerB.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td data-label={result.offerA.label}>
                        <ComparisonAmount
                          amount={row.offerA}
                          currency={result.comparisonCurrency}
                        />
                      </td>
                      <td data-label={result.offerB.label}>
                        <ComparisonAmount
                          amount={row.offerB}
                          currency={result.comparisonCurrency}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.nonFinancialDifferences.length > 0 ? (
              <div>
                <h3>Important non-financial differences</h3>
                <ul>
                  {result.nonFinancialDifferences.map((difference) => (
                    <li key={difference.kind}>
                      <strong>{formatEnum(difference.kind)}:</strong>{" "}
                      {difference.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <h3>Practical negotiation points</h3>
              <div className="stack">
                {result.negotiationTalkingPoints.map((point, index) => (
                  <article className="notice" key={`${point.kind}-${index}`}>
                    <strong>{point.title}</strong>
                    <p>{point.evidence}</p>
                    <p>{point.suggestion}</p>
                  </article>
                ))}
              </div>
            </div>
            <details>
              <summary>How these figures were calculated</summary>
              <p>
                <strong>Value origins</strong>
              </p>
              <ul>
                {calculationExplanations.map((record) => (
                  <li key={`${record.label}-${record.detail}`}>
                    <strong>{record.label}:</strong> {record.detail}
                  </li>
                ))}
              </ul>
              {assumptions.length > 0 ? (
                <>
                  <p>
                    <strong>Estimates and assumptions</strong>
                  </p>
                  <ul>
                    {assumptions.map((record) => (
                      <li key={`${record.label}-${record.detail}`}>
                        <strong>{record.label}:</strong> {record.detail}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                <strong>Normalization rules and warnings</strong>
              </p>
              <ul>
                {[
                  ...result.normalizationNotes,
                  ...result.offerA.warnings,
                  ...result.offerB.warnings,
                ].map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </details>
            <p className="source-policy-note">
              All talking points are derived only from the values and terms you
              entered. No market salary claim is generated.
            </p>
          </section>
        ) : null}
      </ToolResultRegion>
    </>
  );
}
