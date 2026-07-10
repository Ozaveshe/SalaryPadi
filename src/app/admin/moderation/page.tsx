import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="moderation"
      title="Moderation queue"
      description="Review PII, defamation, manipulation and safety flags before any contribution can be published."
      actions={[
        "claim",
        "approve",
        "redact",
        "reject",
        "request_revision",
        "escalate",
        "merge_duplicate",
        "remove",
        "restore",
      ]}
    />
  );
}
