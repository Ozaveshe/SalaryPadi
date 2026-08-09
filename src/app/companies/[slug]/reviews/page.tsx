import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import {
  CombinedRepositoryNotice,
  RepositoryNotice,
} from "@/components/repository-notice";
import {
  getCompanyRatingResult,
  getCompanyResult,
  getCompanyReviewsResult,
} from "@/lib/companies/repository";
import { formatDate, formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Company reviews",
  robots: { index: false, follow: true },
};

export default async function CompanyReviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [companyResult, reviewsResult, ratingResult] = await Promise.all([
    getCompanyResult(slug),
    getCompanyReviewsResult(slug),
    getCompanyRatingResult(slug),
  ]);
  const company = companyResult.data;
  if (companyResult.state === "ready" && !company) notFound();
  if (!company) {
    return (
      <div className="site-shell stack-lg">
        <RepositoryNotice result={companyResult} resource="Company profile" />
      </div>
    );
  }
  const reviews = reviewsResult.data;
  const rating = ratingResult.data;
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{
          label: "Reviews",
          path: `/companies/${company.slug}/reviews`,
        }}
      />
      <section className="rule-section stack">
        <h2 className="section-title">Workplace reviews</h2>
        <CombinedRepositoryNotice
          results={[reviewsResult, ratingResult]}
          resource="Company reviews"
        />
        {reviews.length > 0 ? (
          <>
            <div className="notice">
              {rating
                ? `${rating.overall_rating.toFixed(1)} / 5 overall from ${rating.sample_size} distinct approved contributors · ${rating.confidence_label} confidence.`
                : `${reviews.length} approved review${reviews.length === 1 ? "" : "s"}; the overall rating remains suppressed until the minimum sample is reached.`}
            </div>
            <div className="stack">
              {reviews.map((review) => {
                // A field the contributor did not score is omitted, never
                // printed as a null-state label — the presentation contract
                // in src/lib/presentation/public-field.ts.
                const scores = [
                  ["Compensation", review.compensation_rating],
                  ["Pay reliability", review.pay_reliability_rating],
                  ["Management", review.management_rating],
                  ["Work-life balance", review.work_life_rating],
                  ["Career growth", review.career_growth_rating],
                  [
                    "Employment status",
                    review.employment_status
                      ? formatEnum(review.employment_status)
                      : null,
                  ],
                ].filter(
                  (entry): entry is [string, string | number] =>
                    entry[1] !== null && entry[1] !== undefined,
                );
                return (
                  <article
                    className="surface surface-pad stack"
                    key={review.id}
                  >
                    <div className="split">
                      <div>
                        <p className="eyebrow">
                          {[
                            review.country_code === "WITHHELD"
                              ? "Country withheld"
                              : review.country_code,
                            review.role_family,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <h3 className="m-0 text-xl font-bold">
                          {review.overall_rating !== null &&
                          review.overall_rating !== undefined
                            ? `${review.overall_rating.toFixed(1)} / 5`
                            : "Workplace review"}
                        </h3>
                      </div>
                      <span className="source-note">
                        Published {formatDate(review.published_at)}
                      </span>
                    </div>
                    {scores.length > 0 ? (
                      <dl className="data-list">
                        {scores.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {review.pros ? (
                      <div>
                        <strong>What worked well</strong>
                        <p>{review.pros}</p>
                      </div>
                    ) : null}
                    {review.cons ? (
                      <div>
                        <strong>What could be better</strong>
                        <p>{review.cons}</p>
                      </div>
                    ) : null}
                    {review.advice_to_management ? (
                      <div>
                        <strong>Advice to management</strong>
                        <p>{review.advice_to_management}</p>
                      </div>
                    ) : null}
                    <p className="source-note m-0">{review.provenance_label}</p>
                  </article>
                );
              })}
            </div>
          </>
        ) : reviewsResult.state === "ready" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No rating is published yet
            </h3>
            <p>
              An overall rating appears only after the configurable minimum of
              distinct approved reviews. Employers cannot buy removal or receive
              reviewer identities.
            </p>
            <Link className="button w-fit" href="/contribute/review">
              Share a moderated review
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
