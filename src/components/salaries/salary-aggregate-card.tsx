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
  const isOnline = aggregate.evidenceLane === "verified_online_benchmark";
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
      <p className="m-0">
        <span className={`status ${isOnline ? "" : "status-success"}`}>
          {isOnline ? "Verified online benchmark" : "Community evidence"}
        </span>
      </p>
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
          {isOnline
            ? "The source does not publish a comparable percentile range."
            : "Range withheld until at least five distinct approved contributors are available."}
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
          <dd>
            {isOnline
              ? aggregate.sourcePayPeriod
                ? formatEnum(aggregate.sourcePayPeriod)
                : "Not specified by the source"
              : "Retained per contribution; not exposed in this aggregate"}
          </dd>
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
          <dd>
            {aggregate.sampleSize === null
              ? "Not published by the source"
              : isOnline
                ? `${aggregate.sampleSize} source-reported observations`
                : `${aggregate.sampleSize} approved distinct contributors`}
          </dd>
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
        <div>
          <dt>Evidence lane</dt>
          <dd>
            {isOnline
              ? "Reviewed online benchmark"
              : "First-party contributions"}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{aggregate.sourceName}</dd>
        </div>
        {isOnline && aggregate.sourceRoleLabel ? (
          <div>
            <dt>Source occupation</dt>
            <dd>{aggregate.sourceRoleLabel}</dd>
          </div>
        ) : null}
        {isOnline && aggregate.sourceMedianAmount !== null ? (
          <div>
            <dt>Original source median</dt>
            <dd>
              {formatSalaryAmount(
                aggregate.sourceMedianAmount,
                aggregate.currency,
              )}
              {aggregate.sourcePayPeriod
                ? ` / ${formatEnum(aggregate.sourcePayPeriod)}`
                : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="field-help m-0">
        {aggregate.provenanceLabel}. Values are rounded for display and are not
        a guaranteed offer or individual salary.
      </p>
      <div className="cluster">
        {aggregate.sourceUrl ? (
          <a
            className="text-link"
            href={aggregate.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open source data
          </a>
        ) : null}
        {aggregate.methodologyUrl ? (
          <a
            className="text-link"
            href={aggregate.methodologyUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Source methodology
          </a>
        ) : null}
        <Link className="text-link" href="/methodology">
          SalaryPadi methodology
        </Link>
      </div>
    </article>
  );
}
