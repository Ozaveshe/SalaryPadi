import type { Metadata } from "next";
import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { PrivateDataStatus } from "@/components/private-data-status";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { requireViewer } from "@/lib/auth/dal";
import { getSavedJobs } from "@/lib/career/repository";
import { formatDate } from "@/lib/format";
import { sliceSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Saved jobs",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SavedJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireViewer("/saved");
  const input = await searchParams;
  const removed = sliceSearchParam(input.removed, 10);
  const saved = sliceSearchParam(input.saved, 10);
  const salaryCompany = sliceSearchParam(input.salary_company, 180);
  const salaryRole = sliceSearchParam(input.salary_role, 160);
  const result = await getSavedJobs();
  const jobs = result.data;
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="Saved jobs"
        description="A short list for roles worth a closer look. Saved records and notes are visible only to your account."
      />
      {removed === "true" ? (
        <div className="notice" role="status">
          Saved job removed.
        </div>
      ) : removed === "error" ? (
        <div className="notice notice-danger" role="alert">
          The saved job could not be removed. Reload and try again.
        </div>
      ) : null}
      {saved === "true" ? (
        <div className="notice" role="status">
          Job saved to your private workspace.
        </div>
      ) : saved === "error" ? (
        <div className="notice notice-danger" role="alert">
          The job could not be saved. Try again.
        </div>
      ) : null}
      {saved === "true" ? (
        <SalaryContributionCta
          company={salaryCompany}
          role={salaryRole}
          heading="Job saved. Know what this work pays?"
        />
      ) : null}
      {result.state !== "ready" ? (
        <PrivateDataStatus state={result.state} />
      ) : jobs.length > 0 ? (
        <div className="private-list">
          {jobs.map((job) => (
            <article className="private-row" key={job.id}>
              <div>
                <h2>
                  <Link href={`/jobs/${job.job_slug}`}>{job.title}</Link>
                </h2>
                <p>
                  {job.company_name} · Source: {job.source_name} · Saved{" "}
                  {formatDate(job.saved_at)}
                </p>
              </div>
              <div className="cluster">
                <form action="/api/applications" method="post">
                  <input type="hidden" name="job_slug" value={job.job_slug} />
                  <input type="hidden" name="status" value="applied" />
                  <button className="button button-secondary" type="submit">
                    Mark applied
                  </button>
                </form>
                <form action="/api/saved/remove" method="post">
                  <input type="hidden" name="id" value={job.id} />
                  <button className="button button-quiet" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">Nothing saved yet</h2>
          <p>Save a role after checking its eligibility and source evidence.</p>
          <Link className="button w-fit" href="/jobs">
            Find jobs
          </Link>
        </div>
      )}
    </div>
  );
}
