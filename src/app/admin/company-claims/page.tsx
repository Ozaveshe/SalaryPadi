import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function CompanyClaimsAdminPage() {
  return (
    <AdminResourcePage
      resource="company_claims"
      title="Company claims"
      description="Review private account-domain and organisational evidence — each row states whether the claimant's account email matches an official company domain. Verifying a mismatched claim requires beginning the reason with override:domain_mismatch plus the out-of-band evidence. Never expose the account email or evidence outside this protected queue."
      actions={["claim", "verify", "reject", "revoke"]}
    />
  );
}
