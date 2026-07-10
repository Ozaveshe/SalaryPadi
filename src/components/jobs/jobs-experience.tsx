import { JobCard } from "@/components/jobs/job-card";
import { JobSearchForm } from "@/components/jobs/job-search-form";
import { Pagination } from "@/components/jobs/pagination";
import { PageHeading } from "@/components/page-heading";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import {
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
  const result = paginateJobs(filteredJobs, search.page);
  const categories = [
    ...new Set(
      feed.jobs
        .map((job) => job.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ].toSorted();

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Job discovery"
        title={title}
        description={description}
      />
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
          <h2 className="section-title" id="job-results-heading">
            Current results
          </h2>
          <span className="results-count">
            {result.totalItems} {result.totalItems === 1 ? "job" : "jobs"} ·
            bounded to 10 per page
          </span>
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
          searchParams={serializeJobSearch(search)}
        />
      </section>
      <aside className="source-policy-note">
        <strong>Source policy:</strong> Every result keeps its own source,
        eligibility evidence, destination, freshness and indexing permissions.
        Records merge only when normalized facts and the exact application or
        source destination match. Otherwise each source keeps separate
        provenance for review.
      </aside>
    </div>
  );
}
