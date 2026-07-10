import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="companies"
      title="Company records"
      description="Resolve aliases, claims and factual corrections while keeping employer-provided and community information separate."
      actions={["verify", "request_evidence", "remove"]}
    />
  );
}
