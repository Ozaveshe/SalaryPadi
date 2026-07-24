import {
  BriefcaseBusiness,
  CalendarClock,
  MapPin,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { CompanyLogo } from "@/components/companies/company-logo";
import { MatchBadge } from "@/components/jobs/match-badge";
import { formatDate } from "@/lib/format";
import { getJobEvidenceLabels } from "@/lib/jobs/evidence";
import type { NairaTakeHomeEstimate } from "@/lib/jobs/naira-take-home";
import type { Job } from "@/lib/jobs/types";
import type { MatchResult } from "@/lib/match/types";
import {
  eligibilityStatementTone,
  publicEligibilityStatement,
  publicEnum,
  publicLocation,
} from "@/lib/presentation/public-field";

export function JobCard({
  job,
  match,
  nairaEstimate,
  selectHref,
  isSelected = false,
}: {
  job: Job;
  /** Present only for a signed-in viewer who has saved a match profile. */
  match?: MatchResult;
  /** Estimated monthly naira take-home for the disclosed salary, if computable. */
  nairaEstimate?: NairaTakeHomeEstimate | null;
  /** URL that selects this job into the desktop quick-view pane. */
  selectHref?: string;
  /** Whether this job is currently shown in the quick-view pane. */
  isSelected?: boolean;
}) {
  const evidence = getJobEvidenceLabels(job).slice(0, 5);
  const eligibilityStatement = publicEligibilityStatement(job);
  const location = publicLocation(job);
  const workMode = publicEnum(job.workMode);
  const employmentType = publicEnum(job.employmentType);
  const seniority = publicEnum(job.experienceLevel);

  return (
    <article
      className={isSelected ? "job-card is-selected" : "job-card"}
      data-job-id={job.id}
    >
      <div className="job-card-main">
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
        <div className="job-badges" aria-label="Role summary">
          {match ? <MatchBadge result={match} /> : null}
          {eligibilityStatement ? (
            <span
              className={`status status-${eligibilityStatementTone(eligibilityStatement)}`}
            >
              {eligibilityStatement}
            </span>
          ) : null}
          {job.salary ? (
            <span className="status status-success">Salary disclosed</span>
          ) : null}
        </div>
        <div className="job-facts" aria-label="Job summary">
          {location ? (
            <span>
              <MapPin aria-hidden="true" size={16} />
              {location}
              {workMode ? ` · ${workMode}` : ""}
            </span>
          ) : workMode ? (
            <span>
              <MapPin aria-hidden="true" size={16} />
              {workMode}
            </span>
          ) : null}
          {employmentType || seniority ? (
            <span>
              <BriefcaseBusiness aria-hidden="true" size={16} />
              {[employmentType, seniority].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          <span>
            <CalendarClock aria-hidden="true" size={16} />
            Posted {formatDate(job.postedAt)}
          </span>
          {job.salary ? (
            <span>
              <WalletCards aria-hidden="true" size={16} />
              {job.salary.originalText}
            </span>
          ) : null}
          {nairaEstimate ? (
            <span className="job-naira-estimate">
              {`≈ ₦${Math.round(
                nairaEstimate.monthlyTakeHomeNgn,
              ).toLocaleString("en-NG")}/month take-home (est.)`}
            </span>
          ) : null}
        </div>
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
        <div className="job-card-footer">
          <div className="job-source-badges" aria-label="Source and freshness">
            <a
              className="status status-neutral"
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Source: {job.source.name}
            </a>
            <span className="status status-neutral">
              Checked {formatDate(job.lastCheckedAt)}
            </span>
          </div>
          <div className="cluster">
            {selectHref ? (
              <Link
                className="text-link job-card-quick-view"
                href={selectHref}
                scroll={false}
              >
                Quick view
              </Link>
            ) : null}
            <Link className="text-link" href={`/jobs/${job.slug}`}>
              View role and apply
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
