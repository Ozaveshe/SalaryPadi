import Link from "next/link";

import { JobCard } from "@/components/jobs/job-card";
import { JobSearchForm } from "@/components/jobs/job-search-form";
import { Pagination } from "@/components/jobs/pagination";
import { PageHeading } from "@/components/page-heading";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import {
  diversifyJobResults,
  filterAndSortJobs,
  paginateJobs,
  parseJobSearch,
  serializeJobSearch,
} from "@/lib/jobs/search";

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
  const feed = await getLiveJobFeed();
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
      {feed.state === "unavailable" ? (
        <div className="notice notice-warning" role="alert">
          <strong>Live jobs are temporarily unavailable.</strong> {feed.message}
          <a className="ml-2 font-bold" href="">
            Try again
          </a>
          .
        </div>
      ) : null}
      {feed.state === "degraded" ? (
        <div className="notice notice-warning" role="status">
          <strong>Some job sources are temporarily degraded.</strong>{" "}
          {feed.message}
        </div>
      ) : null}
      {feed.state === "disabled" ? (
        <div className="notice" role="status">
          {feed.message}
        </div>
      ) : null}
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
              {result.totalItems} {result.totalItems === 1 ? "job" : "jobs"} ·
              bounded to 10 per page
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
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No matching jobs right now
            </h3>
            <p className="text-muted mt-2 mb-0 max-w-2xl">
              Try fewer filters or include unclear eligibility. SalaryPadi will
              not relabel a generic remote vacancy as Nigeria-eligible just to
              fill this list.
            </p>
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
