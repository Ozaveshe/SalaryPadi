import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import {
  CombinedRepositoryNotice,
  RepositoryNotice,
} from "@/components/repository-notice";
import {
  getCompanyBenefitsResult,
  getCompanyResult,
} from "@/lib/companies/repository";
import { formatEnum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Company benefits",
  robots: { index: false, follow: true },
};

export default async function CompanyBenefitsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [companyResult, benefitsResult] = await Promise.all([
    getCompanyResult(slug),
    getCompanyBenefitsResult(slug),
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
  const benefits = benefitsResult.data;

  return (
    <div className="site-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{
          label: "Benefits",
          path: `/companies/${company.slug}/benefits`,
        }}
      />
      <section
        className="rule-section stack"
        aria-labelledby="company-benefits"
      >
        <h2 className="section-title" id="company-benefits">
          Benefits evidence
        </h2>
        <CombinedRepositoryNotice
          results={[companyResult, benefitsResult]}
          resource="Company benefits"
        />
        {benefits.length > 0 ? (
          <ul className="stack">
            {benefits.map((benefit) => (
              <li className="surface surface-pad" key={benefit.id}>
                <strong>{benefit.label}</strong>
                {benefit.description ? ` — ${benefit.description}` : ""}
                <span className="source-note">
                  {` ${formatEnum(benefit.source_kind)}`}
                  {benefit.country_code ? ` · ${benefit.country_code}` : ""}
                  {benefit.sample_size ? ` · n=${benefit.sample_size}` : ""}
                  {benefit.confidence_label
                    ? ` · ${benefit.confidence_label} confidence`
                    : ""}
                  {benefit.source_month_from && benefit.source_month_to
                    ? ` · ${benefit.source_month_from} to ${benefit.source_month_to}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : benefitsResult.state === "ready" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              No benefits evidence published yet
            </h3>
            <p>
              Benefits appear here only when contributors report them or the
              employer publishes them. SalaryPadi does not infer benefits from
              the company name, size or industry.
            </p>
            <Link
              className="button button-secondary"
              href={`/contribute/benefits?company=${company.slug}`}
            >
              Add benefits evidence
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
