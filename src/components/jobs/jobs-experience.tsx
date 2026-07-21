import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { JobSearchForm } from "@/components/jobs/job-search-form";
import { Pagination } from "@/components/jobs/pagination";
import { PageHeading } from "@/components/page-heading";
import { getViewer } from "@/lib/auth/dal";
import { getCandidateProfile } from "@/lib/career/repository";
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

  const result = await getCandidateProfile();
  if (result.state !== "ready" || !result.data) return null;
  return toCandidateProfile(result.data);
}

export async function JobsExperience({
  input,
  title = "Find a job you can actually apply for",
  description = "Search source-attributed roles, then check country eligibility, compensation evidence and freshness before you leave to apply.",
  forcedFilters,
}: {
  input: Record<string, string | string[] | undefined>;
  title?: string;
  description?: string;
  forcedFilters?: Record<string, string>;
}) {
  const search = parseJobSearch({ ...input, ...forcedFilters });
  const [feed, matchProfile] = await Promise.all([
    getLiveJobFeed(),
    readMatchProfile(),
  ]);
  const filteredJobs = filterAndSortJobs(feed.jobs, search);
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
  const feedIsConclusive = feed.state === "live";
  const resultCountLabel = feedIsConclusive
    ? `${result.totalItems} ${result.totalItems === 1 ? "job" : "jobs"}`
    : feed.state === "degraded"
      ? `${result.totalItems} available (partial)`
      : "Unavailable";

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Job discovery"
        title={title}
        description={description}
      />
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
            "Eligibility unclear",
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
            <span className="results-count">
              {resultCountLabel} · bounded to 10 per page
            </span>
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
          <div className="job-list">
            {result.items.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                match={
                  matchProfile
                    ? scoreJobMatch(matchProfile, toJobFacts(job))
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
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
      <aside className="source-policy-note">
        <strong>Result balance:</strong> Repeated employer and location variants
        are interleaved before pagination so one cluster does not hide other
        choices. Every result still keeps its own source, eligibility evidence,
        destination, freshness and indexing permissions.
      </aside>
    </div>
  );
}
