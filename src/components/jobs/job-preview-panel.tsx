import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { CompanyLogo } from "@/components/companies/company-logo";
import { JobQuickFacts } from "@/components/jobs/job-trust-summary";
import { formatDate } from "@/lib/format";
import type { NairaTakeHomeEstimate } from "@/lib/jobs/naira-take-home";
import type { Job } from "@/lib/jobs/types";
import {
  eligibilityStatementTone,
  publicEligibilityStatement,
} from "@/lib/presentation/public-field";

const EXCERPT_LENGTH = 700;

function descriptionExcerpt(description: string): string {
  const text = description.trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), EXCERPT_LENGTH - 40))}…`;
}

/**
 * Desktop quick-view pane for the two-column jobs route. Everything shown
 * here goes through the same public presentation boundary as the detail
 * page; the full page stays one click away.
 */
export function JobPreviewPanel({
  job,
  nairaEstimate = null,
}: {
  job: Job;
  nairaEstimate?: NairaTakeHomeEstimate | null;
}) {
  const statement = publicEligibilityStatement(job);
  return (
    <section className="job-preview" aria-label={`Preview: ${job.title}`}>
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
      {statement ? (
        <p className="m-0">
          <span
            className={`status status-${eligibilityStatementTone(statement)}`}
          >
            {statement}
          </span>
        </p>
      ) : null}
      <JobQuickFacts job={job} nairaEstimate={nairaEstimate} />
      <p className="job-preview-excerpt">
        {descriptionExcerpt(job.description)}
      </p>
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
      <p className="text-muted m-0 text-xs">
        Listed on {job.source.name} · checked {formatDate(job.lastCheckedAt)}
      </p>
    </section>
  );
}
