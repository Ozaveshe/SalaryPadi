import { AdminResourcePage } from "@/components/admin/admin-resource-page";

export default function Page() {
  return (
    <AdminResourcePage
      resource="editorial"
      title="Editorial queue"
      description="Review fact-check status, approve evidence-backed drafts, schedule publication, request updates, or archive content."
      actions={["approve", "schedule", "publish", "request_update", "archive"]}
    />
  );
}
