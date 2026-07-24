import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { JobCard } from "@/components/jobs/job-card";
import { RepositoryNotice } from "@/components/repository-notice";
import { getCompanyResult } from "@/lib/companies/repository";

export const metadata: Metadata = {
  title: "Company jobs",
  robots: { index: false, follow: true },
};

export default async function CompanyJobsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const companyResult = await getCompanyResult(slug);
  const company = companyResult.data;
  if (companyResult.state === "ready" && !company) notFound();
  if (!company) {
    return (
      <div className="site-shell stack-lg">
        <RepositoryNotice result={companyResult} resource="Company profile" />
      </div>
    );
  }

  return (
    <div className="site-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{ label: "Jobs", path: `/companies/${company.slug}/jobs` }}
      />
      <section className="rule-section stack" aria-labelledby="company-jobs">
        <div className="split">
          <h2 className="section-title" id="company-jobs">
            Open jobs at {company.name}
          </h2>
          <span className="results-count">
            {companyResult.state === "ready"
              ? `${company.activeJobs.length} source-listed`
              : `${company.activeJobs.length} available (partial)`}
          </span>
        </div>
        <RepositoryNotice result={companyResult} resource="Company jobs" />
        {company.activeJobs.length > 0 ? (
          <div className="job-list">
            {company.activeJobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : companyResult.state === "ready" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No open roles from this employer right now
            </h3>
            <p>
              SalaryPadi lists roles only while they are live on a permitted
              source. It does not create openings to fill this page.
            </p>
            <div className="cluster">
              <Link className="button button-secondary" href="/jobs">
                Browse all open jobs
              </Link>
              <Link className="button button-quiet" href="/alerts">
                Get alerted when they post
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
