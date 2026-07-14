import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompanyHeading } from "@/components/companies/company-heading";
import { requireViewer } from "@/lib/auth/dal";
import { getCompanyResult } from "@/lib/companies/repository";
import { firstSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Employer response",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EmployerResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  await requireViewer(`/companies/${slug}/respond`);
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
        section={{
          label: "Employer response",
          path: `/companies/${slug}/respond`,
        }}
      />
      <div className="notice">
        A verified company claim is required. Responses are moderated and shown
        beside community evidence; they never change or delete community
        ratings.
      </div>
      {status === "submitted" ? (
        <div className="notice" role="status">
          Response received for moderation. It is not public yet.
        </div>
      ) : status === "error" ? (
        <div className="notice notice-danger" role="alert">
          The response was not saved. Confirm that this account has a verified
          company claim.
        </div>
      ) : null}
      <form
        className="surface surface-pad contribution-form"
        action="/api/employer-responses"
        method="post"
      >
        <input type="hidden" name="company_slug" value={company.slug} />
        <div className="field">
          <label htmlFor="response_kind">Response type</label>
          <select className="select" id="response_kind" name="response_kind">
            <option value="factual_correction">Factual correction</option>
            <option value="right_of_reply">Right of reply</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="statement">Statement</label>
          <textarea
            className="textarea"
            id="statement"
            name="statement"
            minLength={20}
            maxLength={3000}
            required
          />
          <p className="field-help">
            Address facts or policy. Do not name a reviewer, speculate about
            identity or ask SalaryPadi to reveal one.
          </p>
        </div>
        <div className="field">
          <label htmlFor="source_url">Optional official citation</label>
          <input
            className="input"
            id="source_url"
            name="source_url"
            type="url"
            placeholder="https://"
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" name="accuracy_attestation" required />I am
          authorised to submit this statement and understand it cannot alter
          community ratings.
        </label>
        <button className="button w-fit" type="submit">
          Submit response for moderation
        </button>
      </form>
    </div>
  );
}
