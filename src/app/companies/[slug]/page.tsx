import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { JobCard } from "@/components/jobs/job-card";
import { formatEnum } from "@/lib/format";
import {
  getCompany,
  getCompanyBenefits,
  getCompanyRating,
  getCompanyReviews,
  getInterviewExperiences,
} from "@/lib/companies/repository";

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
  const { slug } = await params;
  const [company, rating, reviews, interviews, benefits] = await Promise.all([
    getCompany(slug),
    getCompanyRating(slug),
    getCompanyReviews(slug),
    getInterviewExperiences(slug),
    getCompanyBenefits(slug),
  ]);
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
            <dd>
              {company.databaseId
                ? "Reviewed company record plus labelled source evidence"
                : "Permitted job-source facts"}
            </dd>
          </div>
          <div>
            <dt>Industry signals</dt>
            <dd>
              {company.industry ||
                company.categories.join(", ") ||
                "Not stated"}
            </dd>
          </div>
          <div>
            <dt>Company size</dt>
            <dd>{company.sizeBand ?? "Not provided by the source"}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              {company.websiteUrl ? (
                <a
                  className="text-link"
                  href={company.websiteUrl}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  Visit the published website
                </a>
              ) : (
                "Not provided by the source"
              )}
            </dd>
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
        {company.description ? (
          <p className="text-muted mt-4 mb-0">{company.description}</p>
        ) : null}
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
        {rating || reviews.length > 0 || interviews.length > 0 ? (
          <dl className="data-list">
            <div>
              <dt>Approved reviews</dt>
              <dd>{reviews.length}</dd>
            </div>
            <div>
              <dt>Published interviews</dt>
              <dd>{interviews.length}</dd>
            </div>
            <div>
              <dt>Overall rating</dt>
              <dd>
                {rating
                  ? `${rating.overall_rating.toFixed(1)} / 5 from ${rating.sample_size} contributors (${rating.confidence_label} confidence)`
                  : "Suppressed until the minimum sample is reached"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="notice">
            No approved salary, review or interview aggregate is available for
            this company yet. A missing aggregate is not a positive or negative
            signal.
          </div>
        )}
        {benefits.length > 0 ? (
          <div className="stack">
            <h3 className="text-lg font-bold">Published benefits evidence</h3>
            <ul>
              {benefits.map((benefit) => (
                <li key={benefit.id}>
                  <strong>{benefit.label}</strong>
                  {benefit.description ? ` — ${benefit.description}` : ""}
                  {` (${formatEnum(benefit.source_kind)})`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
