import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getCompaniesResult } from "@/lib/companies/repository";
import { countryAlternates } from "@/lib/country-packs/routing";
import { getAppOrigin } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { canIndexCompanyHub } from "@/lib/seo/indexability";

const getCompaniesPageResult = cache(() => getCompaniesResult());

export async function generateMetadata(): Promise<Metadata> {
  const result = await getCompaniesPageResult();
  return {
    title: "Companies",
    description:
      "Inspect source-labelled employer facts, jobs and safely published community intelligence.",
    alternates: {
      canonical: "/companies",
      languages: countryAlternates(getAppOrigin(), "/companies").languages,
    },
    robots: { index: canIndexCompanyHub(result), follow: true },
  };
}

export default async function CompaniesPage() {
  const result = await getCompaniesPageResult();
  const companies = result.data;
  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Company intelligence"
        title="Know more before you accept"
        description="Start with current vacancies, then look for approved salary, workplace and interview evidence. Missing data stays missing."
      />
      <RepositoryNotice result={result} resource="Company records" />
      {companies.length > 0 ? (
        <div className="company-list">
          {companies.map((company) => (
            <article className="company-row" key={company.slug}>
              <div>
                <h2>
                  <Link href={`/companies/${company.slug}`}>
                    {company.name}
                  </Link>
                </h2>
                <p>
                  {company.industry ||
                    company.categories.join(", ") ||
                    "Industry not stated"}
                </p>
              </div>
              <div className="company-row-meta">
                <strong>{company.activeJobs.length}</strong>
                <span>
                  active {company.activeJobs.length === 1 ? "job" : "jobs"}
                </span>
              </div>
              <div className="company-row-meta">
                <span>Checked</span>
                <strong>{formatDate(company.lastCheckedAt)}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : result.state === "ready" ? (
        <div className="empty-state">
          <h2 className="section-title">
            No source-listed companies available
          </h2>
          <p>
            The live feed is unavailable or disabled. SalaryPadi does not create
            fake company profiles to fill the directory.
          </p>
        </div>
      ) : null}
    </div>
  );
}
