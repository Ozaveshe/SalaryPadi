import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="imports"
      title="Import runs"
      description="Inspect failures and retry a fixed, approved source adapter. User-controlled URLs are never fetched."
      actions={["retry", "cancel"]}
    />
  );
}
