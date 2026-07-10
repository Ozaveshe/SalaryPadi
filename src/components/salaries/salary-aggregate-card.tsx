import Link from "next/link";

import { formatEnum, formatSalaryAmount } from "@/lib/format";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

export function SalaryAggregateCard({
  aggregate,
}: {
  aggregate: PublicSalaryAggregate;
}) {
  return (
    <article className="surface surface-pad stack">
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
          Median annual {aggregate.grossNet}
        </span>
        <strong className="text-2xl">
          {formatSalaryAmount(aggregate.medianAnnual, aggregate.currency)}
        </strong>
      </div>
      {aggregate.percentile25Annual !== null &&
      aggregate.percentile75Annual !== null ? (
        <p className="text-muted m-0 text-sm">
          Middle range:{" "}
          {formatSalaryAmount(aggregate.percentile25Annual, aggregate.currency)}
          –
          {formatSalaryAmount(aggregate.percentile75Annual, aggregate.currency)}
        </p>
      ) : (
        <p className="text-muted m-0 text-sm">
          Range withheld until at least five distinct approved contributors are
          available.
        </p>
      )}
      <dl className="data-list">
        <div>
          <dt>Sample</dt>
          <dd>{aggregate.sampleSize} approved distinct contributors</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>
            {aggregate.submissionMonthStart} to {aggregate.submissionMonthEnd}
          </dd>
        </div>
        <div>
          <dt>Arrangement</dt>
          <dd>{formatEnum(aggregate.arrangement)}</dd>
        </div>
      </dl>
      <Link className="text-link" href="/methodology">
        How this aggregate is protected
      </Link>
    </article>
  );
}
