import { formatEnum, formatSalaryAmount } from "@/lib/format";
import type { NormalizedAmount, OfferComparisonResult } from "@/lib/offers";

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
  offerA: NormalizedAmount | null;
  offerB: NormalizedAmount | null;
};

function resultMoney(value: number | null, currency: string) {
  return value === null ? "Unknown" : formatSalaryAmount(value, currency);
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
          1 {item.from} = {item.rate} {item.to} · {item.source} · updated{" "}
          {new Date(item.updatedAt).toLocaleString()}{" "}
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
  const rows: ComparisonRow[] = result
    ? [
        {
          label: "Base pay",
          offerA: result.offerA.basePay,
          offerB: result.offerB.basePay,
        },
        {
          label: "Guaranteed cash",
          offerA: result.offerA.guaranteedCashCompensation,
          offerB: result.offerB.guaranteedCashCompensation,
        },
        {
          label: "Total cash",
          offerA: result.offerA.totalCashCompensation,
          offerB: result.offerB.totalCashCompensation,
        },
        {
          label: "Benefit value",
          offerA: result.offerA.estimatedBenefitValue,
          offerB: result.offerB.estimatedBenefitValue,
        },
        {
          label: "Personal work costs",
          offerA: result.offerA.personalWorkCosts,
          offerB: result.offerB.personalWorkCosts,
        },
        {
          label: "Estimated cash take-home",
          offerA: result.offerA.estimatedCashTakeHome,
          offerB: result.offerB.estimatedCashTakeHome,
        },
        {
          label: "Effective value",
          offerA: result.offerA.effectiveValue,
          offerB: result.offerB.effectiveValue,
        },
      ]
    : [];

  return (
    <>
      <FxEvidenceNotice evidence={fxEvidence} />
      {result ? (
        <section className="tool-result stack-lg">
          <div role="status" aria-live="polite">
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
                      {resultMoney(
                        row.offerA?.monthly ?? null,
                        result.comparisonCurrency,
                      )}{" "}
                      / month
                      <br />
                      <small>
                        {resultMoney(
                          row.offerA?.annual ?? null,
                          result.comparisonCurrency,
                        )}{" "}
                        / year
                      </small>
                    </td>
                    <td data-label={result.offerB.label}>
                      {resultMoney(
                        row.offerB?.monthly ?? null,
                        result.comparisonCurrency,
                      )}{" "}
                      / month
                      <br />
                      <small>
                        {resultMoney(
                          row.offerB?.annual ?? null,
                          result.comparisonCurrency,
                        )}{" "}
                        / year
                      </small>
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
            <summary>Normalization notes and warnings</summary>
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
    </>
  );
}
