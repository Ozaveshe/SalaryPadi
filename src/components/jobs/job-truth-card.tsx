import {
  CircleAlert,
  ExternalLink,
  Flag,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { EligibilityStatus } from "@/components/jobs/eligibility-status";
import { formatDate, formatEnum, formatSalaryAmount } from "@/lib/format";
import { normalizeSalaryEvidence } from "@/lib/jobs/supply/salary";
import type { Job } from "@/lib/jobs/types";

function displayList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "Not stated";
}

function eligibilityConfidence(job: Job) {
  if (
    job.eligibility.nigeria === "unclear" &&
    job.eligibility.africa === "unclear"
  ) {
    return "Unclear — the source does not name enough applicant locations";
  }
  if (job.eligibility.provenance === "manually_verified") {
    return "Manually checked against the cited source wording";
  }
  if (job.eligibility.provenance === "source_provided") {
    return "Source-stated — confirm again before applying";
  }
  return "Inferred from source wording — confirm before applying";
}

function salaryRange(
  minimum: number | null,
  maximum: number | null,
  currency: string | null,
) {
  if (minimum === null && maximum === null) return "Not available";
  if (minimum === maximum || maximum === null)
    return formatSalaryAmount(minimum ?? maximum ?? 0, currency);
  if (minimum === null) return `Up to ${formatSalaryAmount(maximum, currency)}`;
  return `${formatSalaryAmount(minimum, currency)}–${formatSalaryAmount(maximum, currency)}`;
}

export function JobTruthCard({ job }: { job: Job }) {
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
  const showDerivedSalary =
    normalizedSalary?.annual && job.salary?.payPeriod !== "annual";

  return (
    <section className="truth-card" aria-labelledby="job-truth-heading">
      <div className="truth-card-heading">
        <div>
          <p className="eyebrow">Job Truth Card</p>
          <h2 className="section-title" id="job-truth-heading">
            Eligibility, pay and provenance
          </h2>
        </div>
        <EligibilityStatus eligibility={job.eligibility} />
      </div>
      <div className="truth-grid">
        <section aria-labelledby="can-apply-heading">
          <h3 id="can-apply-heading">
            <ShieldCheck aria-hidden="true" size={19} />
            Can I apply?
          </h3>
          <dl className="data-list">
            <div>
              <dt>Included countries</dt>
              <dd>{displayList(job.eligibility.includedCountries)}</dd>
            </div>
            <div>
              <dt>Excluded countries</dt>
              <dd>{displayList(job.eligibility.excludedCountries)}</dd>
            </div>
            <div>
              <dt>Region wording</dt>
              <dd>{formatEnum(job.eligibility.scope)}</dd>
            </div>
            <div>
              <dt>Exact eligibility evidence</dt>
              <dd>{job.eligibility.evidenceText}</dd>
            </div>
            <div>
              <dt>Physical location</dt>
              <dd>{job.locationDisplay}</dd>
            </div>
            <div>
              <dt>Work authorisation</dt>
              <dd>{job.eligibility.workAuthorization ?? "Not stated"}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{job.eligibility.requiredTimezone ?? "Not stated"}</dd>
            </div>
            <div>
              <dt>Visa sponsorship</dt>
              <dd>{formatEnum(job.eligibility.visaSponsorship)}</dd>
            </div>
            <div>
              <dt>Relocation support</dt>
              <dd>{formatEnum(job.eligibility.relocationSupport)}</dd>
            </div>
            <div>
              <dt>Arrangement</dt>
              <dd>{formatEnum(job.arrangement)}</dd>
            </div>
            <div>
              <dt>Eligibility confidence</dt>
              <dd>{eligibilityConfidence(job)}</dd>
            </div>
            <div>
              <dt>Eligibility checked</dt>
              <dd>{formatDate(job.eligibility.lastVerifiedAt)}</dd>
            </div>
          </dl>
          {job.eligibility.nigeria === "unclear" ? (
            <p className="truth-caution">
              <CircleAlert aria-hidden="true" size={17} />
              Generic remote wording is not proof that applicants in Nigeria can
              apply. Check the original posting.
            </p>
          ) : null}
        </section>
        <section aria-labelledby="worth-heading">
          <h3 id="worth-heading">
            <WalletCards aria-hidden="true" size={19} />
            What is it worth?
          </h3>
          <dl className="data-list">
            <div>
              <dt>Source salary text</dt>
              <dd>{job.salary?.originalText ?? "Not disclosed"}</dd>
            </div>
            <div>
              <dt>Original currency</dt>
              <dd>{job.salary?.currency ?? "Not stated"}</dd>
            </div>
            <div>
              <dt>Original pay period</dt>
              <dd>
                {job.salary ? formatEnum(job.salary.payPeriod) : "Not stated"}
              </dd>
            </div>
            <div>
              <dt>Gross or net</dt>
              <dd>
                {job.salary ? formatEnum(job.salary.grossNet) : "Not stated"}
              </dd>
            </div>
            <div>
              <dt>Salary location scope</dt>
              <dd>{job.salary ? job.locationDisplay : "Not stated"}</dd>
            </div>
            <div>
              <dt>Derived annual comparison</dt>
              <dd>
                {showDerivedSalary && normalizedSalary?.annual
                  ? `${salaryRange(normalizedSalary.annual.minimum, normalizedSalary.annual.maximum, job.salary?.currency ?? null)} (derived)`
                  : job.salary?.payPeriod === "annual"
                    ? "No conversion; source already states annual pay"
                    : "Not calculated"}
              </dd>
            </div>
            <div>
              <dt>Derivation assumptions</dt>
              <dd>
                {showDerivedSalary && normalizedSalary?.annual
                  ? normalizedSalary.annual.assumptions.join("; ")
                  : "None applied"}
              </dd>
            </div>
            <div>
              <dt>Bonus and allowances</dt>
              <dd>Shown below only when the source provides evidence</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="trust-heading">
          <h3 id="trust-heading">
            <ShieldCheck aria-hidden="true" size={19} />
            Where did it come from?
          </h3>
          <dl className="data-list">
            <div>
              <dt>Source</dt>
              <dd>{job.source.name}</dd>
            </div>
            <div>
              <dt>Verification boundary</dt>
              <dd>
                Source record and outbound destination; not employer identity
              </dd>
            </div>
            <div>
              <dt>Employer evidence</dt>
              <dd>{formatEnum(job.company.verification)}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatDate(job.postedAt)}</dd>
            </div>
            <div>
              <dt>Last source check</dt>
              <dd>{formatDate(job.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                {job.validThrough
                  ? formatDate(job.validThrough)
                  : "Not provided; continued source presence is checked"}
              </dd>
            </div>
          </dl>
          <div className="truth-links">
            <a
              className="text-link"
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open original source <ExternalLink aria-hidden="true" size={15} />
            </a>
            <a className="text-link" href="#report-job">
              <Flag aria-hidden="true" size={15} />
              Report incorrect or unsafe information
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}
