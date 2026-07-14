import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function CompanyClaimsAdminPage() {
  return (
    <AdminResourcePage
      resource="company_claims"
      title="Company claims"
      description="Review private account-domain and organisational evidence. Never expose the account email or evidence outside this protected queue."
      actions={["claim", "verify", "reject", "revoke"]}
    />
  );
}
