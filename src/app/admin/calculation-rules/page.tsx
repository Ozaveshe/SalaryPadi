import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="calculation_rules"
      title="Calculation rules"
      description="Inspect effective dates and source links before activating a payroll or privacy-threshold rule version."
      actions={["activate", "retire", "request_review"]}
    />
  );
}
