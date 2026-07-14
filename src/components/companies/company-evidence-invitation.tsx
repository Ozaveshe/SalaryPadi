import Link from "next/link";

import {
  companyEvidenceInvitations,
  type CompanyEvidenceInvitationKind,
} from "@/lib/companies/invitations";

export function CompanyEvidenceInvitation({
  kind,
  companySlug,
}: {
  kind: CompanyEvidenceInvitationKind;
  companySlug?: string | null;
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
        <Link className="text-link" href="/contribute/salary">
          Salary
        </Link>
        <Link className="text-link" href="/contribute/interview">
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
