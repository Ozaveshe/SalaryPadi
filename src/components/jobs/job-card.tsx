import {
  BriefcaseBusiness,
  CalendarClock,
  MapPin,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { EligibilityStatus } from "@/components/jobs/eligibility-status";
import { formatDate, formatEnum } from "@/lib/format";
import type { Job } from "@/lib/jobs/types";

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="job-card">
      <div className="stack">
        <div className="split">
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
          <EligibilityStatus eligibility={job.eligibility} compact />
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
        {job.skills.length > 0 ? (
          <ul className="tag-list" aria-label="Skills and tags">
            {job.skills.slice(0, 5).map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        ) : null}
        <div className="split job-card-footer">
          <span className="source-note">
            Source: {job.source.name} · checked {formatDate(job.lastCheckedAt)}
          </span>
          <Link className="text-link" href={`/jobs/${job.slug}`}>
            Check the job truth
          </Link>
        </div>
      </div>
    </article>
  );
}
