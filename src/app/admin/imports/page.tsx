import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="imports"
      title="Import runs"
      description="Inspect immutable source-run evidence. Refreshes run only through the reviewed scheduled adapter; the console does not create an unconsumed retry queue."
      actions={[]}
    />
  );
}
