import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { JobCard } from "@/components/jobs/job-card";
import { formatEnum } from "@/lib/format";
import { getCompany } from "@/lib/companies/repository";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const company = await getCompany((await params).slug);
  return company
    ? {
        title: company.name,
        description: `Current jobs and clearly sourced intelligence for ${company.name}.`,
        robots: { index: false, follow: true },
      }
    : { title: "Company unavailable" };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const company = await getCompany((await params).slug);
  if (!company) notFound();
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading company={company} />
      <section className="rule-section" aria-labelledby="company-facts-heading">
        <h2 className="section-title" id="company-facts-heading">
          What is currently known
        </h2>
        <dl className="data-list mt-4">
          <div>
            <dt>Information type</dt>
            <dd>Permitted job-source facts</dd>
          </div>
          <div>
            <dt>Industry signals</dt>
            <dd>{company.categories.join(", ") || "Not stated"}</dd>
          </div>
          <div>
            <dt>Company size</dt>
            <dd>Not provided by the source</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>Not provided by the source</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>
              {formatEnum(company.verification)} — this is not employer identity
              verification
            </dd>
          </div>
          <div>
            <dt>Remote eligibility seen</dt>
            <dd>{company.remoteLocations.join("; ")}</dd>
          </div>
        </dl>
      </section>
      <section
        className="rule-section stack"
        aria-labelledby="company-jobs-heading"
      >
        <div className="split">
          <h2 className="section-title" id="company-jobs-heading">
            Active jobs
          </h2>
          <span className="results-count">
            {company.activeJobs.length} source-listed
          </span>
        </div>
        <div className="job-list">
          {company.activeJobs.map((job) => (
            <JobCard job={job} key={job.id} />
          ))}
        </div>
      </section>
      <section
        className="rule-section stack"
        aria-labelledby="community-evidence-heading"
      >
        <h2 className="section-title" id="community-evidence-heading">
          Community evidence
        </h2>
        <div className="notice">
          No approved salary, review or interview aggregate is available for
          this company yet. A missing aggregate is not a positive or negative
          signal.
        </div>
        <div className="cluster">
          <Link className="button button-secondary" href="/contribute/salary">
            Contribute salary
          </Link>
          <Link className="button button-secondary" href="/contribute/review">
            Share workplace experience
          </Link>
          <Link
            className="button button-secondary"
            href="/contribute/interview"
          >
            Share interview experience
          </Link>
        </div>
      </section>
    </div>
  );
}
