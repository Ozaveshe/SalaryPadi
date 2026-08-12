import { CircleAlert, ExternalLink } from "lucide-react";
import Link from "next/link";

import { CompanyLogo } from "@/components/companies/company-logo";
import { JobQuickFacts } from "@/components/jobs/job-trust-summary";
import { formatDate } from "@/lib/format";
import {
  jobDescriptionExcerpt,
  publicJobDescriptionView,
} from "@/lib/jobs/description-excerpt";
import { getJobEvidenceLabels } from "@/lib/jobs/evidence";
import type { NairaTakeHomeEstimate } from "@/lib/jobs/naira-take-home";
import { jobPostingAge } from "@/lib/jobs/posting-age";
import type { Job } from "@/lib/jobs/types";
import {
  eligibilityStatementTone,
  publicEligibilityStatement,
  remoteEligibilityUnconfirmed,
} from "@/lib/presentation/public-field";

/**
 * Desktop quick-view pane for the two-column jobs route. Everything shown
 * here goes through the same public presentation boundary as the detail
 * page; the full page stays one click away.
 *
 * The panel is a scrolling column with the identity pinned to the top and the
 * apply actions pinned to the bottom, so a candidate can read a long excerpt
 * without losing either. The freshness and eligibility cautions the detail page
 * carries are repeated here — a role summarised without them would read as
 * more confirmed than it is.
 */
export function JobPreviewPanel({
  job,
  nairaEstimate = null,
}: {
  job: Job;
  nairaEstimate?: NairaTakeHomeEstimate | null;
}) {
  const statement = publicEligibilityStatement(job);
  const postingAge = jobPostingAge(job);
  const evidence = getJobEvidenceLabels(job).slice(0, 6);
  const description = publicJobDescriptionView(job);
  const excerpt = jobDescriptionExcerpt(description.text, 700);

  return (
    <section
      className="job-preview"
      aria-label={`Quick view: ${job.title}`}
      id="job-quick-view"
    >
      <header className="job-preview-header">
        <div className="job-card-title">
          <CompanyLogo
            name={job.company.name}
            size={40}
            slug={job.company.slug}
          />
          <div>
            <p className="job-company">
              <Link href={`/companies/${job.company.slug}`}>
                {job.company.name}
              </Link>
            </p>
            <h2 className="job-title">
              <Link href={`/jobs/${job.slug}`}>{job.title}</Link>
            </h2>
          </div>
        </div>
        {statement || job.salary || postingAge.label ? (
          <div className="job-badges" aria-label="Role summary">
            {statement ? (
              <span
                className={`status status-${eligibilityStatementTone(statement)}`}
              >
                {statement}
              </span>
            ) : null}
            {job.salary ? (
              <span className="status status-success">Salary disclosed</span>
            ) : null}
            {postingAge.label ? (
              <span className="status status-warning">{postingAge.label}</span>
            ) : null}
            {description.kind === "source_only" ? (
              <span className="status">Description on source</span>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="job-preview-body">
        {postingAge.note ? (
          <p className="truth-caution m-0">
            <CircleAlert aria-hidden="true" size={17} />
            {postingAge.note}
          </p>
        ) : null}
        {remoteEligibilityUnconfirmed(job) ? (
          <p className="truth-caution m-0">
            <CircleAlert aria-hidden="true" size={17} />
            Generic remote wording is not proof that applicants in Nigeria can
            apply. Check the original posting before investing time.
          </p>
        ) : null}
        <JobQuickFacts job={job} nairaEstimate={nairaEstimate} />
        {evidence.length > 0 ? (
          <ul
            className="tag-list evidence-tag-list"
            aria-label="Source evidence"
          >
            {evidence.map(({ key, label }) => (
              <li key={key}>{label}</li>
            ))}
          </ul>
        ) : null}
        {excerpt ? <p className="job-preview-excerpt">{excerpt}</p> : null}
      </div>

      <footer className="job-preview-footer">
        <div className="job-actions">
          <a
            className="button"
            href={job.applicationUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            data-event="outbound_apply_click"
          >
            Apply on {job.source.name}
            <ExternalLink aria-hidden="true" size={17} />
          </a>
          <Link className="button button-secondary" href={`/jobs/${job.slug}`}>
            Full details
          </Link>
        </div>
        <p className="source-note m-0">
          Listed on{" "}
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {job.source.name}
          </a>{" "}
          · checked {formatDate(job.lastCheckedAt)}
        </p>
      </footer>
    </section>
  );
}
