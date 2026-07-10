import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { getCompany } from "@/lib/companies/repository";

export const metadata: Metadata = {
  title: "Company reviews",
  robots: { index: false, follow: true },
};

export default async function CompanyReviewsPage({
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
        <h2 className="section-title">Workplace reviews</h2>
        <div className="empty-state">
          <h3 className="m-0 text-xl font-bold">No rating is published yet</h3>
          <p>
            An overall rating appears only after the configurable minimum of
            distinct approved reviews. Employers cannot buy removal or receive
            reviewer identities.
          </p>
          <Link className="button w-fit" href="/contribute/review">
            Share a moderated review
          </Link>
        </div>
      </section>
    </div>
  );
}
