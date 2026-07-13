import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompanyTabs } from "@/components/companies/company-tabs";
import { JsonLd } from "@/components/json-ld";
import { PageHeading } from "@/components/page-heading";
import type { CompanySummary } from "@/lib/companies/repository";
import { getAppOrigin } from "@/lib/env";
import { formatDate, formatEnum } from "@/lib/format";
import { buildBreadcrumbStructuredData } from "@/lib/seo/structured-data";
import { headers } from "next/headers";

export async function CompanyHeading({
  company,
  section,
}: {
  company: CompanySummary;
  section?: { label: string; path: string };
}) {
  const origin = getAppOrigin();
  const companyPath = `/companies/${company.slug}`;
  const visibleBreadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Companies", href: "/companies" },
    section
      ? { label: company.name, href: companyPath }
      : { label: company.name },
    ...(section ? [{ label: section.label }] : []),
  ];
  const structuredBreadcrumbs = [
    { name: "Home", url: origin },
    {
      name: "Companies",
      url: new URL("/companies", origin).toString(),
    },
    {
      name: company.name,
      url: new URL(companyPath, origin).toString(),
    },
    ...(section
      ? [
          {
            name: section.label,
            url: new URL(section.path, origin).toString(),
          },
        ]
      : []),
  ];
  return (
    <div className="stack">
      <JsonLd
        nonce={(await headers()).get("x-nonce")}
        data={buildBreadcrumbStructuredData(structuredBreadcrumbs)}
      />
      <Breadcrumbs items={visibleBreadcrumbs} />
      <PageHeading
        eyebrow="Company evidence"
        title={company.name}
        description="Employer facts, current jobs and community intelligence are kept separate so you can see who supplied each claim."
      />
      <div className="cluster">
        <span className="status status-warning">
          {formatEnum(company.verification)}
        </span>
        <span className="source-note">
          Last source check {formatDate(company.lastCheckedAt)}
        </span>
      </div>
      <CompanyTabs slug={company.slug} />
    </div>
  );
}
