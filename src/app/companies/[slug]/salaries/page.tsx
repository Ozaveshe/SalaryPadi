import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import {
  CombinedRepositoryNotice,
  RepositoryNotice,
} from "@/components/repository-notice";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { SalaryContributionCta } from "@/components/salaries/salary-contribution-cta";
import { getCompanyResult } from "@/lib/companies/repository";
import { searchSalaryAggregatesResult } from "@/lib/salaries/repository";

export const metadata: Metadata = {
  title: "Company salaries",
  robots: { index: false, follow: true },
};

export default async function CompanySalariesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [companyResult, aggregatesResult] = await Promise.all([
    getCompanyResult(slug),
    searchSalaryAggregatesResult({ company: slug }),
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
  const aggregates = aggregatesResult.data;
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{
          label: "Salaries",
          path: `/companies/${company.slug}/salaries`,
        }}
      />
      <section className="rule-section stack">
        <h2 className="section-title">Salary evidence</h2>
        <CombinedRepositoryNotice
          results={[companyResult, aggregatesResult]}
          resource="Company salary evidence"
        />
        {aggregates.length > 0 ? (
          <div className="aggregate-grid">
            {aggregates.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        ) : aggregatesResult.state === "ready" ? (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              Not enough approved data to publish
            </h3>
            <p>
              SalaryPadi requires at least three sufficiently similar approved
              submissions from distinct accounts. Individual values are never
              shown.
            </p>
            <p className="text-muted m-0 text-sm">
              Company-level progress is intentionally not shown: a count below
              the threshold could identify a contributor.
            </p>
            <SalaryContributionCta company={company.name} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
