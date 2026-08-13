import {
  BriefcaseBusiness,
  CalendarClock,
  Heart,
  MapPin,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { CompanyLogo } from "@/components/companies/company-logo";
import { MatchBadge } from "@/components/jobs/match-badge";
import { formatDate } from "@/lib/format";
import {
  jobDescriptionExcerpt,
  publicJobDescriptionView,
} from "@/lib/jobs/description-excerpt";
import { buildJobDecisionPlan } from "@/lib/jobs/decision-plan";
import { getJobEvidenceLabels } from "@/lib/jobs/evidence";
import type { NairaTakeHomeEstimate } from "@/lib/jobs/naira-take-home";
import { jobPostingAge } from "@/lib/jobs/posting-age";
import type { Job } from "@/lib/jobs/types";
import type { RepositoryReadState } from "@/lib/data/repository-result";
import type { MatchResult } from "@/lib/match/types";
import {
  eligibilityStatementTone,
  publicEligibilityStatement,
  publicEnum,
  publicLocation,
} from "@/lib/presentation/public-field";

const SOURCE_TYPE_LABELS: Record<Job["source"]["type"], string> = {
  employer: "Direct employer source",
  partner: "Reviewed partner source",
  permitted_api: "Reviewed job source",
  manual: "SalaryPadi-reviewed source",
};

function eligibilityBasis(job: Job): string | null {
  const evidence = job.eligibility.evidenceText.replace(/\s+/g, " ").trim();
  if (!evidence) return null;
  if (evidence.length <= 220) return evidence;
  const candidate = evidence.slice(0, 217);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > 160 ? boundary : 217)}…`;
}

export function JobCard({
  job,
  match,
  nairaEstimate,
  quickViewable = false,
  signedIn = false,
  saved = false,
  savedState = "ready",
  applicationStatus,
  applicationState = "ready",
  returnTo = "/jobs",
}: {
  job: Job;
  /** Present only for a signed-in viewer who has saved a match profile. */
  match?: MatchResult;
  /** Estimated monthly naira take-home for the disclosed salary, if computable. */
  nairaEstimate?: NairaTakeHomeEstimate | null;
  /**
   * Whether this card sits in the two-column results list. The quick-view
   * control carries no handler of its own: the client list wrapper owns
   * selection and reads the click off this button, which keeps the card free
   * of client JavaScript.
   */
  quickViewable?: boolean;
  /** Private interaction controls are exposed only for an authenticated viewer. */
  signedIn?: boolean;
  /** Whether this role is already in the viewer's private shortlist. */
  saved?: boolean;
  /** Whether absence from the private shortlist is a conclusive result. */
  savedState?: RepositoryReadState;
  /** The viewer's latest tracked application stage for this role. */
  applicationStatus?:
    | "saved"
    | "applied"
    | "assessment"
    | "interview"
    | "offer"
    | "rejected"
    | "withdrawn";
  /** Whether absence from the application tracker is a conclusive result. */
  applicationState?: RepositoryReadState;
  /** Safe local route returned to after saving from a result list. */
  returnTo?: string;
}) {
  const evidence = getJobEvidenceLabels(job).slice(0, quickViewable ? 2 : 5);
  const eligibilityStatement = publicEligibilityStatement(job);
  const eligibilityEvidence = eligibilityBasis(job);
  const location = publicLocation(job);
  const workMode = publicEnum(job.workMode);
  const employmentType = publicEnum(job.employmentType);
  const seniority = publicEnum(job.experienceLevel);
  const postingAge = jobPostingAge(job);
  const decisionPlan = buildJobDecisionPlan(job);
  const description = jobDescriptionExcerpt(publicJobDescriptionView(job).text);
  const privateStateUnavailable =
    signedIn &&
    ((!saved && savedState !== "ready") ||
      (!applicationStatus && applicationState !== "ready"));

  return (
    <article
      className="job-card"
      data-density={quickViewable ? "compact" : undefined}
      data-job-id={job.id}
      data-posting-age={postingAge.stage}
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
        {/*
          Rendered only when there is a badge to put in it. A role with no
          match, no eligibility statement and no disclosed salary used to leave
          an empty container carrying "Role summary" as its label, which is a
          label for nothing — axe reports it as a prohibited aria-label on a
          div with no role, and a screen reader announces a summary that has
          nothing to summarise.
        */}
        {match ||
        eligibilityStatement ||
        job.salary ||
        decisionPlan.unresolvedCount > 0 ? (
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
            {decisionPlan.unresolvedCount > 0 ? (
              <span className="status status-warning">
                {decisionPlan.unresolvedCount}{" "}
                {decisionPlan.unresolvedCount === 1 ? "check" : "checks"} before
                applying
              </span>
            ) : null}
          </div>
        ) : null}
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
        {!quickViewable ? (
          <p className="job-card-description">{description}</p>
        ) : null}
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
        {!quickViewable && eligibilityStatement && eligibilityEvidence ? (
          <p className="job-eligibility-basis">
            <strong>Why this eligibility label:</strong> {eligibilityEvidence}
          </p>
        ) : null}
        <div className="job-card-footer">
          <div className="job-source-badges" aria-label="Source and freshness">
            {!quickViewable ? (
              <span className="status status-neutral">
                {SOURCE_TYPE_LABELS[job.source.type]}
              </span>
            ) : null}
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
            {postingAge.label ? (
              <span className="status status-warning">{postingAge.label}</span>
            ) : null}
          </div>
          <div className="cluster job-card-actions">
            {quickViewable && saved ? (
              <Link className="text-link job-card-state" href="/saved">
                <Heart aria-hidden="true" size={15} />
                Saved
              </Link>
            ) : quickViewable && signedIn && savedState === "ready" ? (
              <form action="/api/saved" method="post">
                <input type="hidden" name="job_slug" value={job.slug} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  className="text-link job-card-save"
                  data-event="job_saved"
                  type="submit"
                >
                  <Heart aria-hidden="true" size={15} />
                  Save
                </button>
              </form>
            ) : quickViewable ? (
              <Link
                className="text-link job-card-state"
                href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}
              >
                <Heart aria-hidden="true" size={15} />
                Sign in to save
              </Link>
            ) : null}
            {quickViewable && applicationStatus ? (
              <Link className="text-link job-card-state" href="/applications">
                {applicationStatus === "applied"
                  ? "Applied"
                  : `Application: ${applicationStatus}`}
              </Link>
            ) : null}
            {quickViewable && privateStateUnavailable ? (
              <span className="status status-neutral">
                Private job state unavailable
              </span>
            ) : null}
            {quickViewable ? (
              <button
                aria-controls="job-quick-view"
                className="text-link job-card-quick-view"
                data-quick-view=""
                type="button"
              >
                Quick view
              </button>
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
