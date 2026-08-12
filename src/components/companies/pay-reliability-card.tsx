import type { PayReliabilityAggregate } from "@/lib/companies/contracts";
import { formatEnum } from "@/lib/format";

const PATTERN_COPY: Record<
  PayReliabilityAggregate["dominant_pattern"],
  string
> = {
  always_on_time: "Always on time was the most common report",
  usually_on_time: "Usually on time was the most common report",
  sometimes_late: "Sometimes late was the most common report",
  often_late: "Often late was the most common report",
};

export function PayReliabilityCard({
  aggregate,
}: {
  aggregate: PayReliabilityAggregate;
}) {
  return (
    <article className="surface surface-pad stack">
      <div className="split">
        <h3 className="section-title">{aggregate.country_code}</h3>
        <span className="status status-neutral">
          {formatEnum(aggregate.confidence_label)} confidence
        </span>
      </div>
      <p className="m-0">
        <strong>{PATTERN_COPY[aggregate.dominant_pattern]}.</strong>
      </p>
      <p className="field-help m-0">
        Coarse pattern from {aggregate.sample_size} independently approved
        reports covering {aggregate.source_month_from} to{" "}
        {aggregate.source_month_to}. Individual reports, identities and exact
        pay dates are never published.
      </p>
    </article>
  );
}
