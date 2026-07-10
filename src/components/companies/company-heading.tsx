import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompanyTabs } from "@/components/companies/company-tabs";
import { PageHeading } from "@/components/page-heading";
import { formatDate, formatEnum } from "@/lib/format";
import type { CompanySummary } from "@/lib/companies/repository";

export function CompanyHeading({ company }: { company: CompanySummary }) {
  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Companies", href: "/companies" },
          { label: company.name },
        ]}
      />
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
