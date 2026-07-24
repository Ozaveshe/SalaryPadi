import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { CompanyEvidenceDetails } from "@/components/companies/company-evidence-details";
import { CompanyHeading } from "@/components/companies/company-heading";
import { CompanyOverview } from "@/components/companies/company-overview";
import { InterviewExperienceCard } from "@/components/companies/interview-experience-card";
import { JobCard } from "@/components/jobs/job-card";
import { JsonLd } from "@/components/json-ld";
import {
  CombinedRepositoryNotice,
  RepositoryNotice,
} from "@/components/repository-notice";
import {
  getCompanyBenefitsResult,
  getCompanyRatingMinimumSampleResult,
  getCompanyRatingResult,
  getCompanyResult,
  getCompanyReviewsResult,
  getEmployerResponsesResult,
  getInterviewExperiencesResult,
} from "@/lib/companies/repository";
import { countryAlternates } from "@/lib/country-packs/routing";
import { getAppOrigin } from "@/lib/env";
import { formatDate, formatEnum } from "@/lib/format";
import { searchSalaryAggregatesResult } from "@/lib/salaries/repository";
import { canIndexCompanyDetail } from "@/lib/seo/indexability";
import { buildSocialImageMetadata } from "@/lib/seo/open-graph";
import { buildCompanyAggregateRatingStructuredData } from "@/lib/seo/structured-data";

const getCompanyPageData = cache(async (slug: string) => {
  const [
    companyResult,
    ratingResult,
    ratingMinimumResult,
    reviewsResult,
    interviewsResult,
    benefitsResult,
    employerResponsesResult,
    salaryAggregatesResult,
  ] = await Promise.all([
    getCompanyResult(slug),
    getCompanyRatingResult(slug),
    getCompanyRatingMinimumSampleResult(),
    getCompanyReviewsResult(slug),
    getInterviewExperiencesResult(slug),
    getCompanyBenefitsResult(slug),
    getEmployerResponsesResult(slug),
    searchSalaryAggregatesResult({ company: slug }),
  ]);
  return {
    companyResult,
    ratingResult,
    ratingMinimumResult,
    reviewsResult,
    interviewsResult,
    benefitsResult,
    employerResponsesResult,
    salaryAggregatesResult,
  };
});

function hasPublishedCommunityEvidence(
  data: Awaited<ReturnType<typeof getCompanyPageData>>,
) {
  return (
    data.ratingResult.data !== null ||
    data.reviewsResult.data.length > 0 ||
    data.interviewsResult.data.length > 0 ||
    data.salaryAggregatesResult.data.length > 0 ||
    data.benefitsResult.data.some(
      (benefit) => benefit.source_kind === "community_reported",
    ) ||
    data.employerResponsesResult.data.length > 0
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCompanyPageData(slug);
  const company = data.companyResult.data;
  const description = company
    ? `Current jobs and clearly sourced intelligence for ${company.name}.`
    : "Company profile unavailable.";
  const socialImage = company
    ? buildSocialImageMetadata(
        `/companies/${company.slug}/opengraph-image`,
        `${company.name} company profile on SalaryPadi`,
      )
    : null;
  return company
    ? {
        title: company.name,
        description,
        alternates: {
          canonical: `/companies/${company.slug}`,
          languages: countryAlternates(
            getAppOrigin(),
            `/companies/${company.slug}`,
          ).languages,
        },
        robots: {
          index: canIndexCompanyDetail(
            company,
            hasPublishedCommunityEvidence(data) || company.citations.length > 0,
          ),
          follow: true,
        },
        openGraph: {
          title: company.name,
          description,
          type: "website",
          images: socialImage?.openGraphImages,
        },
        twitter: {
          card: "summary_large_image",
          title: company.name,
          description,
          images: socialImage?.twitterImages,
        },
      }
    : {
        title: "Company unavailable",
        robots: { index: false, follow: true },
      };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const {
    companyResult,
    ratingResult,
    ratingMinimumResult,
    reviewsResult,
    interviewsResult,
    benefitsResult,
    employerResponsesResult,
    salaryAggregatesResult,
  } = await getCompanyPageData(slug);
  const company = companyResult.data;
  if (companyResult.state === "ready" && !company) notFound();
  if (!company) {
    return (
      <div className="site-shell stack-lg">
        <RepositoryNotice result={companyResult} resource="Company profile" />
      </div>
    );
  }
  const rating = ratingResult.data;
  const reviews = reviewsResult.data;
  const interviews = interviewsResult.data;
  const benefits = benefitsResult.data;
  const employerResponses = employerResponsesResult.data;
  const salaryAggregates = salaryAggregatesResult.data;
  const citedJobSources = [
    ...new Map(
      company.activeJobs.map((job) => [
        job.sourceUrl,
        { name: `${job.source.name}: ${job.title}`, url: job.sourceUrl },
      ]),
    ).values(),
  ];
  const regulatoryLicenses = company.citations.filter(
    (citation) =>
      citation.fact_key === "regulatory_license" && citation.fact_value,
  );
  const publishedCommunityEvidence = hasPublishedCommunityEvidence({
    companyResult,
    ratingResult,
    ratingMinimumResult,
    reviewsResult,
    interviewsResult,
    benefitsResult,
    employerResponsesResult,
    salaryAggregatesResult,
  });
  const canonicalUrl = new URL(
    `/companies/${company.slug}`,
    getAppOrigin(),
  ).toString();
  const aggregateRatingStructuredData =
    buildCompanyAggregateRatingStructuredData(
      company,
      canonicalUrl,
      rating,
      ratingMinimumResult.data,
    );
  return (
    <div className="site-shell stack-lg">
      <RepositoryNotice result={companyResult} resource="Company profile" />
      {aggregateRatingStructuredData ? (
        <JsonLd
          nonce={(await headers()).get("x-nonce")}
          data={aggregateRatingStructuredData}
        />
      ) : null}
      <CompanyHeading company={company} />
      <CompanyOverview
        company={company}
        counts={{
          jobs: company.activeJobs.length,
          salaries: salaryAggregates.length,
          reviews: reviews.length,
          benefits: benefits.length,
          interviews: interviews.length,
          rating: rating
            ? { value: rating.overall_rating, sample: rating.sample_size }
            : null,
        }}
      />
      {regulatoryLicenses.length > 0 ? (
        <section
          className="rule-section stack"
          aria-labelledby="regulatory-heading"
        >
          <h2 className="section-title" id="regulatory-heading">
            Regulatory status
          </h2>
          <dl className="data-list">
            <div>
              <dt>Licensed entity</dt>
              <dd>
                {regulatoryLicenses.map((license) => (
                  <span className="regulatory-license" key={license.id}>
                    {license.fact_value!.value}
                    {license.fact_value!.authority
                      ? ` — ${license.fact_value!.authority}`
                      : ""}{" "}
                    <a
                      className="text-link"
                      href={license.source_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      official register
                    </a>{" "}
                    <span className="source-note">
                      checked {formatDate(license.fact_checked_at)}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      <section
        className="rule-section stack"
        aria-labelledby="company-jobs-heading"
      >
        <div className="split">
          <h2 className="section-title" id="company-jobs-heading">
            Active jobs
          </h2>
          <span className="results-count">
            {companyResult.state === "ready"
              ? `${company.activeJobs.length} source-listed`
              : `${company.activeJobs.length} available (partial)`}
          </span>
        </div>
        {company.activeJobs.length > 0 ? (
          <div className="job-list">
            {company.activeJobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
        ) : companyResult.state === "ready" ? (
          <div className="notice">
            No active source-listed job is available for this company right now.
            SalaryPadi does not create openings to fill this section.
          </div>
        ) : (
          <div className="notice notice-warning" role="status">
            Active jobs could not be fully checked. The empty list is not
            confirmation that this company has no current openings.
          </div>
        )}
      </section>
      <section
        className="rule-section stack"
        aria-labelledby="community-evidence-heading"
      >
        <h2 className="section-title" id="community-evidence-heading">
          Community evidence
        </h2>
        <CombinedRepositoryNotice
          resource="Company intelligence"
          results={[
            ratingResult,
            reviewsResult,
            interviewsResult,
            benefitsResult,
            salaryAggregatesResult,
            employerResponsesResult,
          ]}
        />
        {!publishedCommunityEvidence &&
        ratingResult.state === "ready" &&
        reviewsResult.state === "ready" &&
        interviewsResult.state === "ready" &&
        benefitsResult.state === "ready" &&
        salaryAggregatesResult.state === "ready" ? (
          <div className="notice">
            No approved salary, review or interview aggregate is available for
            this company yet. A missing aggregate is not a positive or negative
            signal.
          </div>
        ) : null}
        {interviews.length > 0 ? (
          <div className="stack">
            <h3 className="text-lg font-bold">Interview experiences</h3>
            {interviews
              .toSorted(
                (a, b) =>
                  Date.parse(b.published_at) - Date.parse(a.published_at),
              )
              .map((interview) => (
                <InterviewExperienceCard
                  interview={interview}
                  key={interview.id}
                />
              ))}
          </div>
        ) : null}
        {benefits.length > 0 ? (
          <div className="stack">
            <h3 className="text-lg font-bold">Published benefits evidence</h3>
            <ul>
              {benefits.map((benefit) => (
                <li key={benefit.id}>
                  <strong>{benefit.label}</strong>
                  {benefit.description ? ` — ${benefit.description}` : ""}
                  {` (${formatEnum(benefit.source_kind)}`}
                  {benefit.country_code ? ` / ${benefit.country_code}` : ""}
                  {benefit.sample_size ? ` / n=${benefit.sample_size}` : ""}
                  {benefit.confidence_label
                    ? ` / ${benefit.confidence_label} confidence`
                    : ""}
                  {benefit.source_month_from && benefit.source_month_to
                    ? ` / ${benefit.source_month_from} to ${benefit.source_month_to}`
                    : ""}
                  {`)`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {employerResponses.length > 0 ? (
          <div className="stack">
            <h3 className="text-lg font-bold">Employer responses</h3>
            {employerResponses.map((response) => (
              <article className="surface surface-pad stack" key={response.id}>
                <div className="split">
                  <strong>{formatEnum(response.response_kind)}</strong>
                  <span className="source-note">
                    Published {formatDate(response.published_at)}
                  </span>
                </div>
                <p className="m-0">{response.statement}</p>
                {response.source_url ? (
                  <a
                    className="text-link w-fit"
                    href={response.source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Employer citation
                  </a>
                ) : null}
                <p className="source-note m-0">{response.provenance_label}</p>
              </article>
            ))}
          </div>
        ) : null}
        <div className="cluster">
          <Link className="button" href="/contribute/interview">
            Share interview experience
          </Link>
          <Link className="button button-secondary" href="/contribute/salary">
            Contribute salary
          </Link>
          <Link className="button button-secondary" href="/contribute/review">
            Share workplace experience
          </Link>
          <Link className="button button-secondary" href="/contribute/benefits">
            Add benefits
          </Link>
          <Link
            className="button button-secondary"
            href="/contribute/pay-reliability"
          >
            Share pay reliability
          </Link>
        </div>
        <div className="cluster">
          <Link className="text-link" href="/company-intelligence/requests">
            Report, correct, appeal or request takedown
          </Link>
          <Link className="text-link" href="/privacy/requests">
            Request contribution deletion
          </Link>
          <Link className="text-link" href="/for-employers">
            Are you this employer?
          </Link>
        </div>
      </section>
      <CompanyEvidenceDetails
        company={company}
        citedJobSources={citedJobSources}
      />
    </div>
  );
}
