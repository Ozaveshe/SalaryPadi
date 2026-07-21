import Link from "next/link";

import {
  companyEvidenceInvitations,
  type CompanyEvidenceInvitationKind,
} from "@/lib/companies/invitations";

function prefilledHref(
  pathname: string,
  parameters: Record<string, string | null | undefined>,
) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value) query.set(name, value);
  }
  const encoded = query.toString();
  return encoded ? `${pathname}?${encoded}` : pathname;
}

export function CompanyEvidenceInvitation({
  kind,
  companySlug,
  company,
  role,
}: {
  kind: CompanyEvidenceInvitationKind;
  companySlug?: string | null;
  company?: string | null;
  role?: string | null;
}) {
  return (
    <aside
      className="surface surface-pad stack"
      aria-label="Optional contribution"
    >
      <h3 className="m-0 text-lg font-bold">Add evidence when you are ready</h3>
      <p className="text-muted m-0 text-sm">
        {companyEvidenceInvitations[kind]} No incentive is offered and nothing
        is sent automatically.
      </p>
      <div className="cluster">
        <Link
          className="text-link"
          href={prefilledHref("/contribute/salary", { company, role })}
        >
          Salary
        </Link>
        <Link
          className="text-link"
          href={prefilledHref("/contribute/interview", {
            company,
            role_family: role,
          })}
        >
          Interview
        </Link>
        <Link className="text-link" href="/contribute/benefits">
          Benefits
        </Link>
        <Link className="text-link" href="/contribute/pay-reliability">
          Pay reliability
        </Link>
        {companySlug ? (
          <Link className="text-link" href={`/companies/${companySlug}`}>
            Shareable company profile
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
