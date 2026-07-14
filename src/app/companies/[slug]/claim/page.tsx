import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { requireViewer } from "@/lib/auth/dal";
import { getCompanyResult } from "@/lib/companies/repository";
import { firstSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Claim company",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CompanyClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  await requireViewer(`/companies/${slug}/claim`);
  const companyResult = await getCompanyResult(slug);
  const company = companyResult.data;
  if (!company && companyResult.state === "ready") notFound();
  if (!company)
    return <div className="site-shell">Company data is unavailable.</div>;
  const status = firstSearchParam((await searchParams).status);
  return (
    <div className="reading-shell stack-lg">
      <CompanyHeading
        company={company}
        section={{ label: "Claim", path: `/companies/${slug}/claim` }}
      />
      {status === "submitted" ? (
        <div className="notice" role="status">
          Claim received for human review. No verification was granted
          automatically.
        </div>
      ) : status === "error" ? (
        <div className="notice notice-danger" role="alert">
          The claim was not saved. A cited company record and an active account
          are required.
        </div>
      ) : null}
      <form
        className="surface surface-pad contribution-form"
        action="/api/company-claims"
        method="post"
      >
        <input type="hidden" name="company_slug" value={company.slug} />
        <div className="field">
          <label htmlFor="corporate_domain">Official work domain</label>
          <input
            className="input"
            id="corporate_domain"
            name="corporate_domain"
            placeholder="company.example"
            required
          />
          <p className="field-help">
            Your signed-in address is checked privately. It is never included in
            the public company response or profile.
          </p>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="relationship">Relationship</label>
            <select className="select" id="relationship" name="relationship">
              <option value="employee">Employee</option>
              <option value="owner">Owner</option>
              <option value="authorised_representative">
                Authorised representative
              </option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="job_title">Job title</label>
            <input
              className="input"
              id="job_title"
              name="job_title"
              maxLength={120}
              required
            />
          </div>
        </div>
        <details className="contribution-details">
          <summary>Add a non-secret evidence reference</summary>
          <div className="field">
            <label htmlFor="evidence_reference">Reference</label>
            <input
              className="input"
              id="evidence_reference"
              name="evidence_reference"
              maxLength={300}
            />
            <p className="field-help">
              Do not paste a work email, password, identity document, payslip or
              private file link.
            </p>
          </div>
        </details>
        <button className="button w-fit" type="submit">
          Submit claim for review
        </button>
      </form>
    </div>
  );
}
