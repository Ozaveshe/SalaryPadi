import type { Metadata } from "next";
import {
  BadgeDollarSign,
  Building2,
  ExternalLink,
  Flag,
  Heart,
  MessageCircle,
  MessagesSquare,
  Route,
} from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JobCard } from "@/components/jobs/job-card";
import { JobFeedNotice } from "@/components/jobs/job-feed-notice";
import { JobTruthCard } from "@/components/jobs/job-truth-card";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import { CombinedRepositoryNotice } from "@/components/repository-notice";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { getViewer } from "@/lib/auth/dal";
import { countryAlternates } from "@/lib/country-packs/routing";
import {
  getCompanyBenefitsResult,
  getCompanyRatingResult,
  getCompanyReviewsResult,
  getInterviewExperiencesResult,
} from "@/lib/companies/repository";
import { formatDate, formatEnum } from "@/lib/format";
import { getAppOrigin } from "@/lib/env";
import { getReferenceCurrencyRates } from "@/lib/currency/repository";
import { estimateNairaTakeHome } from "@/lib/jobs/naira-take-home";
import { getJobBySlug } from "@/lib/jobs/repository";
import { searchSalaryAggregatesResult } from "@/lib/salaries/repository";
import { buildWhatsAppShareUrl } from "@/lib/share/whatsapp";
import {
  buildJobPostingStructuredData,
  canIndexJobDetail,
} from "@/lib/seo/job-posting";
import { buildSocialImageMetadata } from "@/lib/seo/open-graph";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { job } = await getJobBySlug(slug);
  if (!job)
    return { title: "Job unavailable", robots: { index: false, follow: true } };
  const title = `${job.title} at ${job.company.name}`;
  const description = `${job.locationDisplay}. ${job.salary?.originalText ?? "Salary not disclosed"}. Check eligibility and source evidence before applying.`;
  const socialImage = buildSocialImageMetadata(
    `/jobs/${job.slug}/opengraph-image`,
    `${title} on SalaryPadi`,
  );
  return {
    title,
    description,
    alternates: {
      canonical: `/jobs/${job.slug}`,
      languages: countryAlternates(getAppOrigin(), `/jobs/${job.slug}`)
        .languages,
    },
    robots: { index: canIndexJobDetail(job), follow: true },
    openGraph: {
      title,
      description: `${job.locationDisplay} · ${job.eligibility.evidenceText}`,
      type: "article",
      images: socialImage.openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: socialImage.twitterImages,
    },
  };
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  const { slug } = await params;
  const savedInput = (await searchParams).saved;
  const saved = Array.isArray(savedInput) ? savedInput[0] : savedInput;
  const { feed, job } = await getJobBySlug(slug);
  if (!job && feed.state === "live") notFound();
  if (!job) {
    return (
      <div className="site-shell stack-lg">
        <PageHeading
          eyebrow="Job evidence unavailable"
          title="This job could not be checked"
          description="SalaryPadi could not verify every relevant job source, so this request is not being presented as a confirmed missing job."
        />
        <JobFeedNotice feed={feed} />
      </div>
    );
  }
  const viewer = await getViewer();
  const [
    ratingResult,
    reviewsResult,
    interviewsResult,
    benefitsResult,
    salaryResult,
    currencyRates,
  ] = await Promise.all([
    getCompanyRatingResult(job.company.slug),
    getCompanyReviewsResult(job.company.slug),
    getInterviewExperiencesResult(job.company.slug),
    getCompanyBenefitsResult(job.company.slug),
    searchSalaryAggregatesResult({ company: job.company.slug }),
    getReferenceCurrencyRates(),
  ]);
  const nairaEstimate = estimateNairaTakeHome(job.salary, currencyRates);
  const companyRating = ratingResult.data;
  const companyReviews = reviewsResult.data;
  const companyInterviews = interviewsResult.data;
  const companyBenefits = benefitsResult.data;
  const nonce = (await headers()).get("x-nonce");
  const canonicalUrl = new URL(`/jobs/${job.slug}`, getAppOrigin()).toString();
  const jobPosting = buildJobPostingStructuredData(job, canonicalUrl);
  const whatsappUrl = buildWhatsAppShareUrl(
    `${job.title} at ${job.company.name} — check eligibility and source on SalaryPadi: ${canonicalUrl}`,
  );
  const similar = feed.jobs
    .filter(
      (candidate) =>
        candidate.id !== job.id && candidate.category === job.category,
    )
    .slice(0, 3);

  return (
    <article className="site-shell job-detail-layout">
      <JsonLd
        nonce={nonce}
        data={buildBreadcrumbStructuredData([
          { name: "Home", url: getAppOrigin() },
          {
            name: "Jobs",
            url: new URL("/jobs", getAppOrigin()).toString(),
          },
          { name: job.title, url: canonicalUrl },
        ])}
      />
      {jobPosting ? <JsonLd nonce={nonce} data={jobPosting} /> : null}
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Jobs", href: "/jobs" },
          { label: job.title },
        ]}
      />
      <header className="stack">
        <p className="eyebrow">{job.company.name}</p>
        <h1 className="page-title">{job.title}</h1>
        <div className="job-facts">
          <span>{job.locationDisplay}</span>
          <span>{formatEnum(job.employmentType)}</span>
          <span>{formatEnum(job.workMode)}</span>
          <span>Posted {formatDate(job.postedAt)}</span>
        </div>
        <div className="job-actions" aria-label="Job actions">
          <a
            className="button"
            href={job.applicationUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            data-event="outbound_apply_click"
          >
            Apply on {job.source.name}
            <ExternalLink aria-hidden="true" size={17} />
          </a>
          {viewer.state === "authenticated" ? (
            <form action="/api/saved" method="post">
              <input type="hidden" name="job_slug" value={job.slug} />
              <input
                type="hidden"
                name="return_to"
                value={`/jobs/${job.slug}`}
              />
              <button className="button button-secondary" type="submit">
                <Heart aria-hidden="true" size={17} />
                Save job
              </button>
            </form>
          ) : (
            <Link
              className="button button-secondary"
              href={`/auth/sign-in?next=${encodeURIComponent(`/jobs/${job.slug}`)}`}
            >
              <Heart aria-hidden="true" size={17} />
              Sign in to save
            </Link>
          )}
          <a
            className="button button-secondary"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden="true" size={17} />
            Share on WhatsApp
          </a>
          {viewer.state === "authenticated" ? (
            <form action="/api/applications" method="post">
              <input type="hidden" name="job_slug" value={job.slug} />
              <input type="hidden" name="status" value="applied" />
              <button className="button button-secondary" type="submit">
                <Route aria-hidden="true" size={17} />I applied
              </button>
            </form>
          ) : null}
        </div>
      </header>
      {saved === "true" ? (
        <div className="notice" role="status">
          Job saved to your private workspace.
        </div>
      ) : saved === "error" ? (
        <div className="notice notice-danger" role="alert">
          The job could not be saved. Try again.
        </div>
      ) : null}
      <JobTruthCard job={job} nairaEstimate={nairaEstimate} />
      <nav className="decision-path" aria-label="Continue this job decision">
        <div>
          <p className="eyebrow">Continue your decision</p>
          <h2 className="section-title">Move from the vacancy to the offer</h2>
        </div>
        <Link href="/tools/take-home-pay">
          <BadgeDollarSign aria-hidden="true" size={20} />
          <span>
            <strong>Estimate take-home pay</strong>
            <small>
              Use the stated currency and period; do not assume tax basis.
            </small>
          </span>
        </Link>
        <Link href={`/companies/${job.company.slug}`}>
          <Building2 aria-hidden="true" size={20} />
          <span>
            <strong>Inspect company evidence</strong>
            <small>Official facts, current jobs and honest gaps.</small>
          </span>
        </Link>
        <Link href={`/companies/${job.company.slug}/interviews`}>
          <MessagesSquare aria-hidden="true" size={20} />
          <span>
            <strong>Check interview evidence</strong>
            <small>Only moderated experiences are published.</small>
          </span>
        </Link>
      </nav>
      {salaryResult.state === "ready" &&
      (salaryResult.data.length === 0 || saved === "true") ? (
        <SalaryContributionCta
          company={job.company.name}
          role={job.title}
          heading={
            saved === "true"
              ? "Job saved. Know what this work pays?"
              : `No published salary data for ${job.company.name} yet`
          }
          description="Share your own pay evidence privately to help future applicants compare this role without exposing an individual salary."
        />
      ) : null}
      <div className="job-detail-layout lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="stack-lg">
          <section
            className="rule-section rich-copy"
            aria-labelledby="description-heading"
          >
            <h2 className="section-title" id="description-heading">
              Role details
            </h2>
            <p className="description-copy">{job.description}</p>
          </section>
          <section
            className="rule-section"
            aria-labelledby="requirements-heading"
          >
            <h2 className="section-title" id="requirements-heading">
              Requirements
            </h2>
            <p className="text-muted">
              {job.requirements ??
                "This source does not provide requirements as a separate structured field. Review the role details and original posting carefully."}
            </p>
          </section>
          <section className="rule-section" aria-labelledby="benefits-heading">
            <h2 className="section-title" id="benefits-heading">
              Benefits
            </h2>
            <p className="text-muted">
              {job.benefits ??
                "This source does not provide benefits as a separate structured field. Do not infer benefits from the company name or role."}
            </p>
          </section>
        </div>
        <aside className="stack">
          <section
            className="surface surface-pad stack"
            aria-labelledby="source-heading"
          >
            <h2 className="text-lg font-bold" id="source-heading">
              Source and freshness
            </h2>
            <dl className="data-list">
              <div>
                <dt>Source</dt>
                <dd>{job.source.name}</dd>
              </div>
              <div>
                <dt>Checked</dt>
                <dd>{formatDate(job.lastCheckedAt)}</dd>
              </div>
              <div>
                <dt>Attribution</dt>
                <dd>Required and shown</dd>
              </div>
              <div>
                <dt>Structured data</dt>
                <dd>
                  {jobPosting
                    ? "JobPosting permitted and published"
                    : "Not permitted for this source"}
                </dd>
              </div>
            </dl>
            <a
              className="text-link"
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open original source <ExternalLink aria-hidden="true" size={15} />
            </a>
          </section>
          <section
            className="surface surface-pad stack"
            aria-labelledby="company-heading"
          >
            <h2 className="text-lg font-bold" id="company-heading">
              Company intelligence
            </h2>
            <CombinedRepositoryNotice
              resource="Company intelligence"
              results={[
                ratingResult,
                reviewsResult,
                interviewsResult,
                benefitsResult,
              ]}
            />
            <dl className="data-list">
              <div>
                <dt>Employer evidence</dt>
                <dd>{formatEnum(job.company.verification)}</dd>
              </div>
              <div>
                <dt>Approved reviews</dt>
                <dd>{companyReviews.length}</dd>
              </div>
              <div>
                <dt>Interview experiences</dt>
                <dd>{companyInterviews.length}</dd>
              </div>
              <div>
                <dt>Published benefits</dt>
                <dd>{companyBenefits.length}</dd>
              </div>
              {companyRating ? (
                <div>
                  <dt>Community rating</dt>
                  <dd>
                    {companyRating.overall_rating.toFixed(1)} / 5 ·{" "}
                    {companyRating.sample_size} approved reviews ·{" "}
                    {companyRating.confidence_label} confidence
                  </dd>
                </div>
              ) : null}
            </dl>
            {ratingResult.state === "ready" &&
            reviewsResult.state === "ready" &&
            interviewsResult.state === "ready" &&
            benefitsResult.state === "ready" &&
            !companyRating &&
            companyReviews.length === 0 &&
            companyInterviews.length === 0 &&
            companyBenefits.length === 0 ? (
              <p className="text-muted m-0 text-sm">
                No approved community aggregate is available yet. SalaryPadi
                does not infer a rating from the vacancy or employer name.
              </p>
            ) : null}
            <Link className="text-link" href={`/companies/${job.company.slug}`}>
              Inspect company evidence
            </Link>
          </section>
          <section
            className="surface surface-pad stack"
            aria-labelledby="next-heading"
          >
            <h2 className="text-lg font-bold" id="next-heading">
              What to do next
            </h2>
            <p className="text-muted m-0 text-sm">
              Verify the role on the employer’s own site, compare the offer
              value, and never pay an application fee.
            </p>
            <Link className="text-link" href="/tools/offer-compare">
              <Route aria-hidden="true" size={15} />
              Compare an offer
            </Link>
            <Link className="text-link" href="/tools/job-scam-checker">
              <Flag aria-hidden="true" size={15} />
              Check warning signs
            </Link>
          </section>
          {viewer.state === "authenticated" ? (
            <form
              id="report-job"
              className="surface surface-pad stack"
              action="/api/reports"
              method="post"
            >
              <input type="hidden" name="target_type" value="job" />
              <input
                type="hidden"
                name="target_id"
                value={job.databaseId ?? job.id}
              />
              <input
                type="hidden"
                name="return_to"
                value={`/jobs/${job.slug}`}
              />
              <label className="field-label" htmlFor="report-category">
                Report this job
              </label>
              <select
                className="select"
                id="report-category"
                name="category"
                required
              >
                <option value="">Choose a reason</option>
                <option value="expired">Expired</option>
                <option value="fee">Application fee</option>
                <option value="impersonation">Possible impersonation</option>
                <option value="eligibility">Incorrect eligibility</option>
                <option value="other">Other safety concern</option>
              </select>
              <button className="button button-secondary" type="submit">
                <Flag aria-hidden="true" size={17} />
                Send report
              </button>
            </form>
          ) : (
            <section
              className="surface surface-pad stack"
              id="report-job"
              aria-labelledby="report-job-heading"
            >
              <h2 className="text-lg font-bold" id="report-job-heading">
                Report this job
              </h2>
              <p className="text-muted m-0 text-sm">
                Sign in to report an expired role, application fee,
                impersonation, or incorrect eligibility evidence.
              </p>
              <Link
                className="button button-secondary w-fit"
                href={`/auth/sign-in?next=${encodeURIComponent(`/jobs/${job.slug}#report-job`)}`}
              >
                <Flag aria-hidden="true" size={17} />
                Sign in to report
              </Link>
            </section>
          )}
        </aside>
      </div>
      {similar.length > 0 ? (
        <section
          className="rule-section stack"
          aria-labelledby="similar-heading"
        >
          <h2 className="section-title" id="similar-heading">
            Similar jobs
          </h2>
          <div className="job-list">
            {similar.map((item) => (
              <JobCard job={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
