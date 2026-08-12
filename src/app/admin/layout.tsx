import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff, type StaffRole } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | SalaryPadi Admin" },
  robots: { index: false, follow: false, nocache: true },
};

const adminNavigation: ReadonlyArray<
  readonly [string, string, readonly StaffRole[]]
> = [
  ["Overview", "/admin", ["data_quality", "moderator", "admin"]],
  ["Jobs", "/admin/jobs", ["data_quality", "admin"]],
  ["Duplicates", "/admin/duplicates", ["data_quality", "admin"]],
  ["Imports", "/admin/imports", ["admin"]],
  ["Sources", "/admin/sources", ["admin"]],
  ["Source health", "/admin/source-health", ["admin"]],
  ["Country readiness", "/admin/country-readiness", ["admin"]],
  ["Companies", "/admin/companies", ["admin"]],
  ["Company claims", "/admin/company-claims", ["data_quality", "admin"]],
  ["Employer responses", "/admin/employer-responses", ["moderator", "admin"]],
  ["Moderation", "/admin/moderation", ["moderator", "admin"]],
  ["Reports", "/admin/reports", ["admin"]],
  ["Users", "/admin/users", ["admin"]],
  ["Audit log", "/admin/audit-log", ["admin"]],
  ["Calculation rules", "/admin/calculation-rules", ["admin"]],
  ["Editorial", "/admin/editorial", ["admin"]],
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard the whole section here, not only in individual pages: a new staff
  // route that forgets its own role check must still require a staff role. This is
  // defense-in-depth over the RPC layer (each admin_* function enforces its own
  // staff-role/AAL2 check), so a missed page guard can never expose staff data.
  const viewer = await requireStaff(["data_quality", "moderator", "admin"]);
  const navigation = adminNavigation.filter(([, , roles]) =>
    roles.some((role) => viewer.staffRoles.includes(role)),
  );

  return (
    <div className="site-shell stack-lg">
      <nav className="cluster" aria-label="Administration">
        {navigation.map(([label, href]) => (
          <Link className="nav-link" href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
