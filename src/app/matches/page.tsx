import type { Metadata } from "next";
import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { PrivateDataStatus } from "@/components/private-data-status";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireViewer } from "@/lib/auth/dal";
import { readUnreadNotificationCount } from "@/lib/career/notifications";
import { readCvSkills } from "@/lib/career/cv/draft";
import {
  compareCvToJob,
  overlapRank,
  overlapStatement,
} from "@/lib/career/cv/relevance";
import { getCurrentCandidateCv } from "@/lib/career/cv/repository";
import { getCandidateProfile } from "@/lib/career/repository";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import {
  diversifyJobResults,
  filterAndSortJobs,
  parseJobSearch,
} from "@/lib/jobs/search";
import { toCandidateProfile, toJobFacts } from "@/lib/match/adapt";
import { scoreJobMatch } from "@/lib/match/score";

export const metadata: Metadata = {
  title: "Matched to your CV",
  robots: { index: false, follow: false, nocache: true },
};

/** How many roles the surface ranks. Enough to act on, not a second job board. */
const MAX_MATCHES = 20;

export default async function MatchesPage() {
  await requireViewer("/matches");

  const [cv, profile, feed, currencyRates] = await Promise.all([
    getCurrentCandidateCv(),
    getCandidateProfile(),
    getLiveJobFeed(),
    getReferenceCurrencyRates(),
  ]);

  const cvSkills =
    cv.data?.parse_state === "parsed" && cv.data.extracted_text
      ? readCvSkills(cv.data.extracted_text)
      : [];
  const matchProfile = profile.data
    ? toCandidateProfile(profile.data, cvSkills)
    : null;

  /*
   * Ranked on how much the two documents literally share, then narrowed to
   * roles that actually share something. A posting with no overlap is not shown
   * as a weak match — it is not a match at all, and padding this list would
   * make the ones that do overlap worth less.
   */
  const ranked = diversifyJobResults(
    // The overlap is the whole filter. No eligibility or keyword narrowing is
    // stacked on top, because a second silent filter would hide roles without
    // saying so.
    filterAndSortJobs(feed.jobs, parseJobSearch({})),
  )
    .map((job) => ({
      job,
      overlap: compareCvToJob(cvSkills, {
        title: job.title,
        description: job.description,
      }),
    }))
    .filter((entry) => entry.overlap.sharedSkills.length > 0)
    .toSorted((a, b) => overlapRank(b.overlap) - overlapRank(a.overlap))
    .slice(0, MAX_MATCHES);

  const hasReadableCv = cvSkills.length > 0;

  return (
    <div className="site-shell">
      <WorkspaceShell
        unreadNotifications={await readUnreadNotificationCount()}
        current="/matches"
        title="Matched to your CV"
        description="Roles whose posting names skills your CV also names. This is an overlap between two documents you can both read — it is not an assessment of you, and it does not predict whether you would be hired."
        actions={
          <Link className="button button-secondary" href="/jobs">
            Search all jobs
          </Link>
        }
      >
        {cv.state !== "ready" ? <PrivateDataStatus state={cv.state} /> : null}
        <JobFeedNotice feed={feed} />

        {!hasReadableCv ? (
          <div className="empty-state">
            <h2 className="section-title">No readable CV yet</h2>
            <p className="text-muted mt-2 mb-0 max-w-2xl">
              {cv.data === null
                ? "Upload a CV on your career profile and SalaryPadi will show which published roles name the same skills it names."
                : "Your stored CV could not be read, so there is nothing to compare against a posting. A scanned CV has no text layer — a PDF exported from a word processor usually does."}
            </p>
            <Link
              className="button mt-4 w-fit"
              href="/account/candidate-profile"
            >
              Go to your career profile
            </Link>
          </div>
        ) : ranked.length === 0 ? (
          <div className="empty-state">
            <h2 className="section-title">
              Nothing currently published overlaps with your CV
            </h2>
            <p className="text-muted mt-2 mb-0 max-w-2xl">
              SalaryPadi will not widen the comparison to fill this page. The
              feed changes as sources refresh, and your saved alerts will still
              catch new roles as they are published.
            </p>
            <Link className="button button-secondary mt-4 w-fit" href="/jobs">
              Browse everything instead
            </Link>
          </div>
        ) : (
          <>
            <p className="results-count">
              {ranked.length} of {feed.jobs.length} currently published roles
              name at least one skill your CV names.
            </p>
            <ul className="job-list">
              {ranked.map(({ job, overlap }) => (
                <li className="job-list-item" key={job.id}>
                  <JobCard
                    job={job}
                    match={
                      matchProfile
                        ? scoreJobMatch(matchProfile, toJobFacts(job))
                        : undefined
                    }
                    nairaEstimate={estimateNairaTakeHome(
                      job.salary,
                      currencyRates,
                    )}
                  />
                  <p className="cv-overlap-note">
                    {overlapStatement(overlap)}
                    {overlap.missingSkills.length > 0
                      ? ` It also names ${overlap.missingSkills.slice(0, 4).join(", ")}, which your CV does not.`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
            <p className="field-help">
              Only skills from a fixed list SalaryPadi can recognise are
              compared, and only where both documents literally contain the
              term. A role missing from this list may still suit you.
            </p>
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
