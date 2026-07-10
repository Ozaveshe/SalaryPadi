import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { getCompany } from "@/lib/companies/repository";

export const metadata: Metadata = {
  title: "Company salaries",
  robots: { index: false, follow: true },
};

export default async function CompanySalariesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const company = await getCompany((await params).slug);
  if (!company) notFound();
  return (
    <div className="site-shell stack-lg">
      <CompanyHeading company={company} />
      <section className="rule-section stack">
        <h2 className="section-title">Salary evidence</h2>
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
      </section>
    </div>
  );
}
