import { AdminResourcePage } from "@/components/admin/admin-resource-page";
export default function Page() {
  return (
    <AdminResourcePage
      resource="users"
      title="Roles and account operations"
      description="Database role membership—not client metadata—controls staff authority. Self-promotion and removal of the last admin are prohibited."
      actions={[
        "grant_moderator",
        "grant_data_quality",
        "grant_admin",
        "revoke_role",
        "suspend",
        "restore",
      ]}
    />
  );
}
