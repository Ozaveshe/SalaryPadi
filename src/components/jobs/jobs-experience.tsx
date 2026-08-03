import { Suspense } from "react";
import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { JobPreviewPanel } from "@/components/jobs/job-preview-panel";
import { JobSearchForm } from "@/components/jobs/job-search-form";
import { JobsSplit } from "@/components/jobs/jobs-split";
import { Pagination } from "@/components/jobs/pagination";
import { BrandArt } from "@/components/media/brand-art";
import { PageHeading } from "@/components/page-heading";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getFeatureFlags } from "@/lib/env";
import { getViewer } from "@/lib/auth/dal";
import { readCvSkills } from "@/lib/career/cv/draft";
import { getCurrentCandidateCv } from "@/lib/career/cv/repository";
import { getCandidateProfile } from "@/lib/career/repository";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import {
  diversifyJobResults,
  filterAndSortJobs,
  paginateJobs,
  parseJobSearch,
  serializeJobSearch,
} from "@/lib/jobs/search";
import { toCandidateProfile, toJobFacts } from "@/lib/match/adapt";
import { scoreJobMatch } from "@/lib/match/score";
import type { CandidateProfile } from "@/lib/match/types";

/**
 * The viewer's own attested profile, or null for anyone who is signed out, has
 * not saved one, or whose private read failed. A match is an enhancement — the
 * job list must render identically without it.
 */
async function readMatchProfile(): Promise<CandidateProfile | null> {
  const viewer = await getViewer();
  if (viewer.state !== "authenticated") return null;

  // The CV read runs alongside the profile and is allowed to come back empty:
  // the skills dimension then reports itself unknown, which is the honest
  // answer for someone who has not uploaded one.
  const [result, cv] = await Promise.all([
    getCandidateProfile(),
    getCurrentCandidateCv(),
  ]);
  if (result.state !== "ready" || !result.data) return null;
  const cvSkills =
    cv.data?.parse_state === "parsed" && cv.data.extracted_text
      ? readCvSkills(cv.data.extracted_text)
      : [];
  return toCandidateProfile(result.data, cvSkills);
}

/**
 * The part of the page that cannot render until the live feed is assembled.
 *
 * Kept separate so the page identity and its location paths reach the browser
 * immediately. Assembling the feed contacts reviewed providers and a database,
 * and holding the entire page behind that meant a visitor watched a skeleton
 * for as long as the slowest source took.
 */
async function JobResultsSection({
  input,
  search,
}: {
  input: Record<string, string | string[] | undefined>;
  search: ReturnType<typeof parseJobSearch>;
}) {
  const [feed, matchProfile, currencyRates] = await Promise.all([
    getLiveJobFeed(),
    readMatchProfile(),
    getReferenceCurrencyRates(),
  ]);
  const filteredJobs = filterAndSortJobs(feed.jobs, search, new Date(), {
    evidenceRanking: getFeatureFlags().evidenceRanking,
  });
  const diversifiedJobs = diversifyJobResults(filteredJobs);
  const result = paginateJobs(diversifiedJobs, search.page);
  const categories = [
    ...new Set(
      feed.jobs
        .map((job) => job.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ].toSorted();
  const serializedSearch = serializeJobSearch(search);
  const selectedInput = Array.isArray(input.selected)
    ? input.selected[0]
    : input.selected;
  const initialSlug =
    result.items.find((job) => job.slug === selectedInput)?.slug ?? null;
  /*
   * Every card and its quick-view panel are rendered together, once, with the
   * page they belong to. Switching the quick view is then local state in
   * `JobsSplit` rather than a new request — selecting a job used to re-run this
   * component, which reassembles the live feed from every reviewed source.
   */
  const splitEntries = result.items.map((job) => {
    const nairaEstimate = estimateNairaTakeHome(job.salary, currencyRates);
    return {
      slug: job.slug,
      card: (
        <JobCard
          job={job}
          match={
            matchProfile
              ? scoreJobMatch(matchProfile, toJobFacts(job))
              : undefined
          }
          nairaEstimate={nairaEstimate}
          quickViewable
        />
      ),
      preview: <JobPreviewPanel job={job} nairaEstimate={nairaEstimate} />,
    };
  });
  const feedIsConclusive = feed.state === "live";
  const resultCountLabel = feedIsConclusive
    ? `${result.totalItems} ${result.totalItems === 1 ? "job" : "jobs"}`
    : feed.state === "degraded"
      ? `${result.totalItems} available (partial)`
      : "Unavailable";

  return (
    <>
      <JobSearchForm search={search} categories={categories} />
      <JobFeedNotice feed={feed} />
      <section
        className="stack"
        aria-labelledby="job-results-heading"
        aria-live="polite"
      >
        <div className="results-heading">
          <div>
            <h2 className="section-title" id="job-results-heading">
              Current results
            </h2>
            <span className="results-count">{resultCountLabel}</span>
          </div>
          <div className="cluster result-actions">
            <form action="/jobs" method="get">
              {[...serializedSearch.entries()]
                .filter(([key]) => key !== "sort")
                .map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}
              <label className="visually-hidden" htmlFor="result-sort">
                Sort results
              </label>
              <select
                className="select select-compact"
                id="result-sort"
                name="sort"
                defaultValue={search.sort}
              >
                <option value="relevance">Most relevant</option>
                <option value="newest">Newest posted</option>
                <option value="salary">Highest disclosed salary</option>
              </select>
              <button className="button button-quiet" type="submit">
                Sort
              </button>
            </form>
            <Link
              className="button button-secondary"
              href={`/alerts?${serializedSearch.toString()}`}
            >
              Save this search
            </Link>
          </div>
        </div>
        {result.items.length > 0 ? (
          <JobsSplit entries={splitEntries} initialSlug={initialSlug} />
        ) : (
          <div className="empty-state">
            {/* Art only where the empty list is a real answer. A degraded
                feed is a warning, and decorating it would soften it. */}
            {feedIsConclusive ? <BrandArt id="empty-jobs" /> : null}
            <h3 className="m-0 text-xl font-bold">
              {!feedIsConclusive && feed.jobs.length === 0
                ? "Current job results could not be confirmed"
                : feed.jobs.length === 0
                  ? "No current jobs have passed the publication checks"
                  : "No jobs match these filters"}
            </h3>
            <p className="text-muted mt-2 mb-0 max-w-2xl">
              {!feedIsConclusive && feed.jobs.length === 0
                ? "One or more reviewed sources are unavailable or disabled. This is not evidence that no suitable jobs exist."
                : feed.jobs.length === 0
                  ? "The source status above is the current state of the feed, not confirmation that suitable jobs do not exist elsewhere. SalaryPadi will not publish placeholder vacancies."
                  : "Try fewer filters or include unclear eligibility. SalaryPadi will not relabel a generic remote vacancy as Nigeria-eligible just to fill this list."}
            </p>
            <div className="cluster mt-4">
              <Link
                className="button button-secondary"
                href={feed.jobs.length === 0 ? "/methodology" : "/jobs"}
              >
                {feed.jobs.length === 0
                  ? "How jobs are verified"
                  : "Clear all filters"}
              </Link>
              <Link className="button button-quiet" href="/post-a-job">
                Post a verified job
              </Link>
            </div>
          </div>
        )}
        <Pagination
          currentPage={result.page}
          totalPages={result.totalPages}
          searchParams={serializedSearch}
        />
      </section>
    </>
  );
}

/** Placeholder shown while the live feed is still being assembled. */
function JobResultsFallback() {
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <p className="results-count">Checking every reviewed source…</p>
    </section>
  );
}

export function JobsExperience({
  input,
  title = "Find a job you can actually apply for",
  description = "Search source-attributed roles, then check country eligibility, compensation evidence and freshness before you leave to apply.",
  forcedFilters,
  chrome = "public",
  unreadNotifications = null,
}: {
  input: Record<string, string | string[] | undefined>;
  title?: string;
  description?: string;
  forcedFilters?: Record<string, string>;
  /**
   * Which frame the search sits in. A signed-in viewer keeps the workspace
   * navigation beside the results rather than being dropped onto a marketing
   * page with no way back to their own records.
   */
  chrome?: "public" | "workspace";
  /** Badge count for the workspace frame; ignored on the public one. */
  unreadNotifications?: number | null;
}) {
  const search = parseJobSearch({ ...input, ...forcedFilters });

  const body = (
    <>
      <nav className="job-paths" aria-label="Job location paths">
        {[
          ["All jobs", "/jobs", search.path === "all"],
          ["Nigeria local", "/jobs/nigeria", search.path === "local_nigeria"],
          [
            "Remote: Nigeria eligible",
            "/jobs?path=remote_nigeria",
            search.path === "remote_nigeria",
          ],
          [
            "Remote: Africa eligible",
            "/jobs?path=remote_africa",
            search.path === "remote_africa",
          ],
          [
            "Needs eligibility check",
            "/jobs?eligibility=unclear",
            search.eligibility === "unclear",
          ],
        ].map(([label, href, active]) => (
          <Link
            className={active ? "job-path is-active" : "job-path"}
            href={String(href)}
            key={String(href)}
            aria-current={active ? "page" : undefined}
          >
            {String(label)}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<JobResultsFallback />}>
        <JobResultsSection input={input} search={search} />
      </Suspense>
    </>
  );

  if (chrome === "workspace") {
    return (
      <div className="site-shell">
        <WorkspaceShell
          current="/jobs"
          title={title}
          description={description}
          unreadNotifications={unreadNotifications}
        >
          {body}
        </WorkspaceShell>
      </div>
    );
  }

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Job discovery"
        title={title}
        description={description}
      />
      {body}
    </div>
  );
}
