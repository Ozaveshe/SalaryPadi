import { CircleAlert, ExternalLink, Flag, ShieldCheck } from "lucide-react";

import { formatDate, formatEnum, formatSalaryAmount } from "@/lib/format";
import type { NairaTakeHomeEstimate } from "@/lib/jobs/naira-take-home";
import { normalizeSalaryEvidence } from "@/lib/jobs/supply/salary";
import type { Job } from "@/lib/jobs/types";
import { publicEnum, publicLocation } from "@/lib/presentation/public-field";

function provenanceStatement(job: Job): string {
  if (job.eligibility.provenance === "manually_verified") {
    return "The eligibility wording was manually checked against the cited source.";
  }
  if (job.eligibility.provenance === "source_provided") {
    return "The eligibility wording comes directly from the source posting.";
  }
  return "The eligibility reading is inferred from the source wording — confirm on the original posting before applying.";
}

function salaryRange(
  minimum: number | null,
  maximum: number | null,
  currency: string | null,
) {
  if (minimum === null && maximum === null) return null;
  if (minimum === maximum || maximum === null)
    return formatSalaryAmount(minimum ?? maximum ?? 0, currency);
  if (minimum === null) return `Up to ${formatSalaryAmount(maximum, currency)}`;
  return `${formatSalaryAmount(minimum, currency)}–${formatSalaryAmount(maximum, currency)}`;
}

function nairaEstimateAssumptions(estimate: NairaTakeHomeEstimate) {
  const parts = [
    `Based on the stated ${estimate.basis}`,
    "statutory pension and private-sector NHF assumed",
  ];
  if (estimate.grossAssumed) {
    parts.push("source did not state gross or net; gross assumed");
  }
  if (estimate.effectiveRate !== null) {
    parts.push(
      `converted at ≈${formatSalaryAmount(Math.round(estimate.effectiveRate), "NGN")} per ${estimate.sourceCurrency}` +
        (estimate.rateProviderName ? ` (${estimate.rateProviderName})` : ""),
    );
  }
  return `${parts.join("; ")}. An estimate, not tax advice.`;
}

/** A definition row rendered only when the value is known. */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Quick-facts grid for the job detail header: renders only facts the
 * source actually states. Uncertain fields are omitted, never labelled.
 */
export function JobQuickFacts({
  job,
  nairaEstimate = null,
}: {
  job: Job;
  nairaEstimate?: NairaTakeHomeEstimate | null;
}) {
  const facts: Array<{ label: string; value: string }> = [];
  const location = publicLocation(job);
  const workMode = publicEnum(job.workMode);
  const employmentType = publicEnum(job.employmentType);
  const seniority = publicEnum(job.experienceLevel);
  if (location) facts.push({ label: "Location", value: location });
  if (workMode) facts.push({ label: "Work mode", value: workMode });
  if (employmentType)
    facts.push({ label: "Employment type", value: employmentType });
  if (seniority) facts.push({ label: "Seniority", value: seniority });
  if (job.salary)
    facts.push({ label: "Salary", value: job.salary.originalText });
  if (nairaEstimate) {
    facts.push({
      label: "Naira take-home (est.)",
      value: `≈${formatSalaryAmount(Math.round(nairaEstimate.monthlyTakeHomeNgn), "NGN")}/month`,
    });
  }
  facts.push({ label: "Posted", value: formatDate(job.postedAt) });
  if (job.validThrough) {
    facts.push({ label: "Apply by", value: formatDate(job.validThrough) });
  }
  return (
    <dl className="quick-facts" aria-label="Quick facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Compact trust line plus the collapsed "How SalaryPadi verified this
 * information" drawer. Replaces the full Job Truth Card dump: the public
 * surface leads with what a candidate can act on, and the verification
 * evidence sits one click away — rendered only where the source actually
 * states it.
 */
export function JobTrustSummary({
  job,
  nairaEstimate = null,
}: {
  job: Job;
  nairaEstimate?: NairaTakeHomeEstimate | null;
}) {
  const normalizedSalary = job.salary
    ? normalizeSalaryEvidence({
        sourceText: job.salary.originalText,
        currency: job.salary.currency,
        minimum: job.salary.minimum,
        maximum: job.salary.maximum,
        period: job.salary.payPeriod,
        locationScope: job.locationDisplay,
        grossNet: job.salary.grossNet,
      })
    : null;
  const derivedAnnual =
    normalizedSalary?.annual && job.salary?.payPeriod !== "annual"
      ? salaryRange(
          normalizedSalary.annual.minimum,
          normalizedSalary.annual.maximum,
          job.salary?.currency ?? null,
        )
      : null;
  const includedCountries =
    job.eligibility.includedCountries.length > 0
      ? job.eligibility.includedCountries.join(", ")
      : null;
  const excludedCountries =
    job.eligibility.excludedCountries.length > 0
      ? job.eligibility.excludedCountries.join(", ")
      : null;
  const visaSponsorship =
    job.eligibility.visaSponsorship === "yes"
      ? "Stated by the source"
      : job.eligibility.visaSponsorship === "no"
        ? "Not offered per the source"
        : null;
  const relocation =
    job.eligibility.relocationSupport === "yes"
      ? "Stated by the source"
      : job.eligibility.relocationSupport === "no"
        ? "Not offered per the source"
        : null;
  const evidenceText = job.eligibility.evidenceText.trim() || null;
  const remoteEligibilityUncertain =
    job.workMode === "remote" &&
    job.eligibility.nigeria === "unclear" &&
    job.eligibility.africa === "unclear";

  return (
    <section className="trust-summary" aria-labelledby="trust-summary-heading">
      <p className="trust-summary-line" id="trust-summary-heading">
        <ShieldCheck aria-hidden="true" size={17} />
        Listed on{" "}
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {job.source.name}
        </a>{" "}
        · checked {formatDate(job.lastCheckedAt)} ·{" "}
        <a href="#report-job">
          <Flag aria-hidden="true" size={14} />
          report a problem
        </a>
      </p>
      {remoteEligibilityUncertain ? (
        <p className="truth-caution">
          <CircleAlert aria-hidden="true" size={17} />
          Generic remote wording is not proof that applicants in Nigeria can
          apply. Check the original posting before investing time.
        </p>
      ) : null}
      <details className="trust-drawer">
        <summary>How SalaryPadi verified this information</summary>
        <div className="stack">
          <p className="text-muted m-0 text-sm">
            SalaryPadi verifies the source record and the outbound application
            destination — not the employer&apos;s identity. Apply on the
            employer&apos;s own site and never pay an application fee.{" "}
            {provenanceStatement(job)}
          </p>
          <dl className="data-list">
            <Fact
              label="Countries the source names"
              value={includedCountries}
            />
            <Fact
              label="Countries the source excludes"
              value={excludedCountries}
            />
            <Fact
              label="Eligibility wording from the source"
              value={evidenceText}
            />
            <Fact
              label="Work authorisation"
              value={job.eligibility.workAuthorization}
            />
            <Fact
              label="Required timezone"
              value={job.eligibility.requiredTimezone}
            />
            <Fact label="Visa sponsorship" value={visaSponsorship} />
            <Fact label="Relocation support" value={relocation} />
            <Fact
              label="Eligibility last checked"
              value={formatDate(job.eligibility.lastVerifiedAt)}
            />
            <Fact
              label="Gross or net"
              value={
                job.salary && job.salary.grossNet !== "unknown"
                  ? formatEnum(job.salary.grossNet)
                  : null
              }
            />
            <Fact
              label="Derived annual comparison"
              value={derivedAnnual ? `${derivedAnnual} (derived)` : null}
            />
            <Fact
              label="Derivation assumptions"
              value={
                derivedAnnual && normalizedSalary?.annual
                  ? normalizedSalary.annual.assumptions.join("; ")
                  : null
              }
            />
            <Fact
              label="Take-home assumptions"
              value={
                nairaEstimate ? nairaEstimateAssumptions(nairaEstimate) : null
              }
            />
            <Fact
              label="Published by the source"
              value={formatDate(job.postedAt)}
            />
            <Fact
              label="Last source check"
              value={formatDate(job.lastCheckedAt)}
            />
            <Fact
              label="Application deadline"
              value={job.validThrough ? formatDate(job.validThrough) : null}
            />
          </dl>
          <a
            className="text-link"
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Open original source <ExternalLink aria-hidden="true" size={15} />
          </a>
        </div>
      </details>
    </section>
  );
}
