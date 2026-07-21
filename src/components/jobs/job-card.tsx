import {
  BriefcaseBusiness,
  CalendarClock,
  MapPin,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { EligibilityStatus } from "@/components/jobs/eligibility-status";
import { MatchBadge } from "@/components/jobs/match-badge";
import { formatDate, formatEnum } from "@/lib/format";
import { getJobEvidenceLabels } from "@/lib/jobs/evidence";
import type { Job } from "@/lib/jobs/types";
import type { MatchResult } from "@/lib/match/types";

function jobPathLabel(job: Job) {
  if (job.workMode !== "remote" && /\bnigeria\b/i.test(job.locationDisplay)) {
    return "Nigeria local";
  }
  if (job.workMode === "remote" && job.eligibility.nigeria === "eligible") {
    return "Remote · Nigeria eligible";
  }
  if (job.workMode === "remote" && job.eligibility.africa === "eligible") {
    return "Remote · Africa eligible";
  }
  return job.workMode === "remote"
    ? "Remote · eligibility unclear"
    : formatEnum(job.workMode);
}

export function JobCard({
  job,
  match,
}: {
  job: Job;
  /** Present only for a signed-in viewer who has saved a match profile. */
  match?: MatchResult;
}) {
  const evidence = getJobEvidenceLabels(job).slice(0, 5);

  return (
    <article className="job-card" data-job-id={job.id}>
      <div className="job-card-main">
        <div className="job-card-title">
          <p className="job-company">
            <Link href={`/companies/${job.company.slug}`}>
              {job.company.name}
            </Link>
          </p>
          <h2 className="job-title">
            <Link href={`/jobs/${job.slug}`}>{job.title}</Link>
          </h2>
        </div>
        <div className="job-badges" aria-label="Eligibility and arrangement">
          {match ? <MatchBadge result={match} /> : null}
          <EligibilityStatus eligibility={job.eligibility} compact />
          <span className="status status-neutral">{jobPathLabel(job)}</span>
          <span className="status status-neutral">
            {formatEnum(job.arrangement)}
          </span>
          <span className="status status-neutral">
            {formatEnum(job.experienceLevel)}
          </span>
          <span
            className={`status ${job.salary ? "status-success" : "status-neutral"}`}
          >
            {job.salary ? "Salary disclosed" : "Salary not stated"}
          </span>
        </div>
        <div className="job-facts" aria-label="Job summary">
          <span>
            <MapPin aria-hidden="true" size={16} />
            {job.locationDisplay}
          </span>
          <span>
            <BriefcaseBusiness aria-hidden="true" size={16} />
            {formatEnum(job.employmentType)}
          </span>
          <span>
            <CalendarClock aria-hidden="true" size={16} />
            Posted {formatDate(job.postedAt)}
          </span>
          <span>
            <WalletCards aria-hidden="true" size={16} />
            {job.salary?.originalText ?? "Salary not disclosed"}
          </span>
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
          <Link className="text-link" href={`/jobs/${job.slug}`}>
            Check eligibility, pay and source
          </Link>
        </div>
      </div>
    </article>
  );
}
