import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="reports"
      title="User reports"
      description="Investigate suspicious, stale, incorrect or privacy-sensitive content with a reasoned audit trail."
      actions={["resolve", "dismiss", "escalate", "remove"]}
    />
  );
}
