import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import {
  getCompany,
  getCompanyRating,
  getCompanyReviews,
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
  const [company, reviews, rating] = await Promise.all([
    getCompany(slug),
    getCompanyReviews(slug),
    getCompanyRating(slug),
  ]);
  if (!company) notFound();
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading company={company} />
      <section className="rule-section stack">
        <h2 className="section-title">Workplace reviews</h2>
        {reviews.length > 0 ? (
          <>
            <div className="notice">
              {rating
                ? `${rating.overall_rating.toFixed(1)} / 5 overall from ${rating.sample_size} distinct approved contributors · ${rating.confidence_label} confidence.`
                : `${reviews.length} approved review${reviews.length === 1 ? "" : "s"}; the overall rating remains suppressed until the minimum sample is reached.`}
            </div>
            <div className="stack">
              {reviews.map((review) => (
                <article className="surface surface-pad stack" key={review.id}>
                  <div className="split">
                    <div>
                      <p className="eyebrow">
                        {review.country_code} ·{" "}
                        {review.role_family ?? "Role not published"}
                      </p>
                      <h3 className="m-0 text-xl font-bold">
                        {review.overall_rating?.toFixed(1) ?? "Unrated"} / 5
                      </h3>
                    </div>
                    <span className="source-note">
                      Published {formatDate(review.published_at)}
                    </span>
                  </div>
                  <dl className="data-list">
                    <div>
                      <dt>Compensation</dt>
                      <dd>{review.compensation_rating ?? "Not scored"}</dd>
                    </div>
                    <div>
                      <dt>Pay reliability</dt>
                      <dd>{review.pay_reliability_rating ?? "Not scored"}</dd>
                    </div>
                    <div>
                      <dt>Management</dt>
                      <dd>{review.management_rating ?? "Not scored"}</dd>
                    </div>
                    <div>
                      <dt>Work-life balance</dt>
                      <dd>{review.work_life_rating ?? "Not scored"}</dd>
                    </div>
                    <div>
                      <dt>Career growth</dt>
                      <dd>{review.career_growth_rating ?? "Not scored"}</dd>
                    </div>
                    <div>
                      <dt>Employment status</dt>
                      <dd>
                        {review.employment_status
                          ? formatEnum(review.employment_status)
                          : "Not published"}
                      </dd>
                    </div>
                  </dl>
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
                </article>
              ))}
            </div>
          </>
        ) : (
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
        )}
      </section>
    </div>
  );
}
