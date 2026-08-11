import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function DuplicateCandidatesAdminPage() {
  return (
    <AdminResourcePage
      resource="duplicates"
      title="Duplicate candidates"
      description="Near-duplicate job pairs detected at ingestion, most recent first. Compare the named jobs and source evidence, then explicitly keep the first job, keep the second job, or dismiss the match. Confirming preserves both source records while linking every occurrence to the selected canonical job."
      actions={["keep_first", "keep_second", "dismiss"]}
    />
  );
}
