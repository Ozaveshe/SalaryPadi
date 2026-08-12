import { AdminResourcePage } from "@/components/admin/admin-resource-page";
import { ModerationBacklogSummary } from "@/components/admin/moderation-backlog-summary";
export default function Page() {
  return (
    <AdminResourcePage
      resource="moderation"
      title="Moderation queue"
      description="Review the named PII, threat, manipulation and other safety flags before any contribution can be published. Queue rows expose flag kinds for triage, never the matched private text."
      summary={<ModerationBacklogSummary />}
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
