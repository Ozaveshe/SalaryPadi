import { Suspense } from "react";
import Link from "next/link";

import { AdminJobSearchResults } from "@/components/admin/admin-job-search-results";
import { AdminTransitionNotice } from "@/components/admin/admin-transition-notice";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { requireStaff } from "@/lib/auth/dal";
import {
  jobAdminStatuses,
  parseAdminJobSearch,
  searchAdminJobsResult,
} from "@/lib/admin/jobs";
import { formatEnum } from "@/lib/format";

export default async function JobsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const viewer = await requireStaff(["data_quality", "admin"]);
  const parsed = parseAdminJobSearch(await searchParams);
  const result = parsed.success
    ? await searchAdminJobsResult(parsed.data)
    : null;

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected job operations"
        title="Find and investigate jobs"
        description="Search the complete job inventory by UUID, slug, external source ID, title, employer, domain, source or adapter. Open a job to review its publication blockers and provenance before an administrator changes status."
      />
      <Suspense fallback={null}>
        <AdminTransitionNotice />
      </Suspense>
      <div className="cluster">
        <Link className="button" href="/admin/jobs/intake">
          Submit source-backed job
        </Link>
      </div>
      <form
        className="surface surface-pad stack"
        action="/admin/jobs"
        method="get"
      >
        <div>
          <label htmlFor="job-search">Job, employer or source</label>
          <input
            className="input"
            id="job-search"
            name="q"
            type="search"
            defaultValue={parsed.success ? parsed.data.query : ""}
            minLength={2}
            maxLength={200}
            placeholder="UUID, slug, title, employer, domain or source"
          />
        </div>
        <div>
          <label htmlFor="job-status">Status</label>
          <select
            className="select"
            id="job-status"
            name="status"
            defaultValue={parsed.success ? (parsed.data.status ?? "") : ""}
          >
            <option value="">Any status</option>
            {jobAdminStatuses.map((status) => (
              <option value={status} key={status}>
                {formatEnum(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="cluster">
          <button className="button button-secondary" type="submit">
            Search jobs
          </button>
          <Link className="button button-ghost" href="/admin/jobs">
            Clear
          </Link>
        </div>
        <p className="field-help">
          Blank search shows the 50 most recently updated jobs. Search results
          prioritize exact identifiers and jobs with open reports.
        </p>
      </form>
      {!parsed.success ? (
        <div className="notice notice-warning" role="status">
          <strong>Search was not run.</strong> Enter either no search text or at
          least two characters, and choose a listed status.
        </div>
      ) : result ? (
        <>
          <RepositoryNotice result={result} resource="Job search results" />
          <AdminJobSearchResults
            rows={result.data}
            query={parsed.data.query}
            status={parsed.data.status}
            canTransition={viewer.isAdmin}
          />
        </>
      ) : null}
    </div>
  );
}
