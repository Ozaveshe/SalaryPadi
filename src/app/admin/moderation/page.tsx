import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="moderation"
      title="Moderation queue"
      description="Review the named PII, threat, manipulation and other safety flags before any contribution can be published. Queue rows expose flag kinds for triage, never the matched private text."
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
