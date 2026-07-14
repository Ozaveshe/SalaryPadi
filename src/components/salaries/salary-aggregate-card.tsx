import Link from "next/link";

import { formatDate, formatEnum, formatSalaryAmount } from "@/lib/format";
import { roundSalaryEstimate } from "@/lib/salaries/presentation";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

function approximateAmount(amount: number, currency: string) {
  return `≈ ${formatSalaryAmount(roundSalaryEstimate(amount), currency)}`;
}

export function SalaryAggregateCard({
  aggregate,
}: {
  aggregate: PublicSalaryAggregate;
}) {
  return (
    <article className="surface surface-pad stack salary-evidence-card">
      <div className="split">
        <div>
          <p className="eyebrow">
            {aggregate.countryCode} · {formatEnum(aggregate.seniority)}
          </p>
          <h2 className="m-0 text-xl font-bold">{aggregate.roleFamily}</h2>
        </div>
        <span
          className={`status ${aggregate.confidence === "low" ? "status-warning" : "status-success"}`}
        >
          {aggregate.confidence} confidence
        </span>
      </div>
      <div>
        <span className="text-faint block text-sm">
          Approximate median · annualised · {aggregate.grossNet}
        </span>
        <strong className="text-2xl">
          {approximateAmount(aggregate.medianAnnual, aggregate.currency)}
        </strong>
      </div>
      {aggregate.percentile25Annual !== null &&
      aggregate.percentile75Annual !== null ? (
        <p className="text-muted m-0 text-sm">
          Approximate middle range:{" "}
          {approximateAmount(aggregate.percentile25Annual, aggregate.currency)}–
          {approximateAmount(aggregate.percentile75Annual, aggregate.currency)}
        </p>
      ) : (
        <p className="text-muted m-0 text-sm">
          Range withheld until at least five distinct approved contributors are
          available.
        </p>
      )}
      <dl className="data-list">
        <div>
          <dt>Role</dt>
          <dd>{aggregate.roleFamily}</dd>
        </div>
        <div>
          <dt>Seniority</dt>
          <dd>{formatEnum(aggregate.seniority)}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{aggregate.countryCode}</dd>
        </div>
        <div>
          <dt>Original currency</dt>
          <dd>{aggregate.currency}</dd>
        </div>
        <div>
          <dt>Display period</dt>
          <dd>Annualised aggregate</dd>
        </div>
        <div>
          <dt>Original periods</dt>
          <dd>Retained per contribution; not exposed in this aggregate</dd>
        </div>
        <div>
          <dt>Gross or net</dt>
          <dd>{formatEnum(aggregate.grossNet)}</dd>
        </div>
        <div>
          <dt>Arrangement</dt>
          <dd>{formatEnum(aggregate.arrangement)}</dd>
        </div>
        <div>
          <dt>Sample size</dt>
          <dd>{aggregate.sampleSize} approved distinct contributors</dd>
        </div>
        <div>
          <dt>Evidence date range</dt>
          <dd>
            {aggregate.submissionMonthStart} to {aggregate.submissionMonthEnd}
          </dd>
        </div>
        <div>
          <dt>Calculated</dt>
          <dd>{formatDate(aggregate.calculatedAt)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{formatEnum(aggregate.confidence)}</dd>
        </div>
      </dl>
      <p className="field-help m-0">
        Rounded for display so a small sample does not imply false precision.
        This is contributor evidence, not a guaranteed market rate.
      </p>
      <Link className="text-link" href="/methodology">
        How this aggregate is protected
      </Link>
    </article>
  );
}
