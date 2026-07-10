import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="jobs"
      title="Job management"
      description="Publish, expire or remove normalized jobs without bypassing source policy or audit history."
      actions={["approve", "expire", "remove", "restore"]}
    />
  );
}
