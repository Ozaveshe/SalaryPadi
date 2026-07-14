import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function EmployerResponsesAdminPage() {
  return (
    <AdminResourcePage
      resource="employer_responses"
      title="Employer responses"
      description="Moderate factual corrections and rights of reply. Approval publishes employer speech beside community evidence and never changes community ratings."
      actions={[
        "claim",
        "approve",
        "redact",
        "request_revision",
        "reject",
        "escalate",
        "remove",
        "restore",
      ]}
    />
  );
}
