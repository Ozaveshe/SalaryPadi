import { CircleAlert, ShieldCheck, WalletCards } from "lucide-react";

import { EligibilityStatus } from "@/components/jobs/eligibility-status";
import { formatDate, formatEnum } from "@/lib/format";
import type { Job } from "@/lib/jobs/types";

export function JobTruthCard({ job }: { job: Job }) {
  return (
    <section className="truth-card" aria-labelledby="job-truth-heading">
      <div className="truth-card-heading">
        <div>
          <p className="eyebrow">Job Truth Card</p>
          <h2 className="section-title" id="job-truth-heading">
            The useful facts, up front
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
              <dt>Evidence</dt>
              <dd>{job.eligibility.evidenceText}</dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{formatEnum(job.eligibility.provenance)}</dd>
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
              <dt>Arrangement</dt>
              <dd>{formatEnum(job.arrangement)}</dd>
            </div>
            <div>
              <dt>Experience</dt>
              <dd>{formatEnum(job.experienceLevel)}</dd>
            </div>
          </dl>
          {job.eligibility.nigeria === "unclear" ? (
            <p className="truth-caution">
              <CircleAlert aria-hidden="true" size={17} />
              Remote eligibility is unclear. Check the original posting before
              applying.
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
              <dt>Published salary</dt>
              <dd>{job.salary?.originalText ?? "Not disclosed"}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{job.salary?.currency ?? "Not stated"}</dd>
            </div>
            <div>
              <dt>Pay period</dt>
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
              <dt>Bonus</dt>
              <dd>Not separately provided</dd>
            </div>
            <div>
              <dt>Allowances</dt>
              <dd>Not separately provided</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="trust-heading">
          <h3 id="trust-heading">
            <ShieldCheck aria-hidden="true" size={19} />
            Can I trust it?
          </h3>
          <dl className="data-list">
            <div>
              <dt>Verified</dt>
              <dd>Source record and destination only</dd>
            </div>
            <div>
              <dt>Employer</dt>
              <dd>{formatEnum(job.company.verification)}</dd>
            </div>
            <div>
              <dt>Original source</dt>
              <dd>{job.source.name}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatDate(job.postedAt)}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{formatDate(job.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>
                {job.validThrough
                  ? formatDate(job.validThrough)
                  : "Not provided; feed presence checked"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
