import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function DuplicateCandidatesAdminPage() {
  return (
    <AdminResourcePage
      resource="duplicates"
      title="Duplicate candidates"
      description="Near-duplicate job pairs detected at ingestion, most recent first. Each row names the two roles and their title similarity so an operator can investigate them against the Jobs queue. This queue is view-only: confirming or dismissing a pair, and linking a canonical job, is not yet wired here."
      actions={[]}
    />
  );
}
