import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { getCompany } from "@/lib/companies/repository";

export const metadata: Metadata = {
  title: "Interview experiences",
  robots: { index: false, follow: true },
};

export default async function CompanyInterviewsPage({
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
        <h2 className="section-title">Interview experiences</h2>
        <div className="empty-state">
          <h3 className="m-0 text-xl font-bold">
            No approved interview evidence yet
          </h3>
          <p>
            Submissions can describe stages and themes, but should not expose
            confidential material or exact proprietary test answers.
          </p>
          <Link className="button w-fit" href="/contribute/interview">
            Share an interview experience
          </Link>
        </div>
      </section>
    </div>
  );
}
