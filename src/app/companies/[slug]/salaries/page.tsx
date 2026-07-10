import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import { getCompany } from "@/lib/companies/repository";
import { searchSalaryAggregates } from "@/lib/salaries/repository";

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
  const [company, aggregates] = await Promise.all([
    getCompany(slug),
    searchSalaryAggregates({ company: slug }),
  ]);
  if (!company) notFound();
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading company={company} />
      <section className="rule-section stack">
        <h2 className="section-title">Salary evidence</h2>
        {aggregates.length > 0 ? (
          <div className="aggregate-grid">
            {aggregates.map((aggregate) => (
              <SalaryAggregateCard aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="m-0 text-xl font-bold">
              Not enough approved data to publish
            </h3>
            <p>
              SalaryPadi requires at least three sufficiently similar approved
              submissions from distinct accounts. Individual values are never
              shown.
            </p>
            <Link className="button w-fit" href="/contribute/salary">
              Contribute privately
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
