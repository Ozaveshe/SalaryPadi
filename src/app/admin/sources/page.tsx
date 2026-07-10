import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="sources"
      title="Source policies"
      description="Enable a source only when terms, attribution, storage, indexing, destination and refresh rules are recorded."
      actions={["enable", "disable", "request_review"]}
    />
  );
}
