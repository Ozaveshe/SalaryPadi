import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | SalaryPadi Admin" },
  robots: { index: false, follow: false, nocache: true },
};

const adminNavigation = [
  ["Overview", "/admin"],
  ["Jobs", "/admin/jobs"],
  ["Duplicates", "/admin/duplicates"],
  ["Imports", "/admin/imports"],
  ["Sources", "/admin/sources"],
  ["Source health", "/admin/source-health"],
  ["Country readiness", "/admin/country-readiness"],
  ["Companies", "/admin/companies"],
  ["Company claims", "/admin/company-claims"],
  ["Employer responses", "/admin/employer-responses"],
  ["Moderation", "/admin/moderation"],
  ["Reports", "/admin/reports"],
  ["Users", "/admin/users"],
  ["Calculation rules", "/admin/calculation-rules"],
  ["Editorial", "/admin/editorial"],
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard the whole section here, not only in individual pages: a new admin
  // route that forgets its own requireAdmin() call must still be gated. This is
  // defense-in-depth over the RPC layer (each admin_* function enforces its own
  // staff-role/AAL2 check), so a missed page guard can never expose staff data.
  await requireAdmin();

  return (
    <div className="site-shell stack-lg">
      <nav className="cluster" aria-label="Administration">
        {adminNavigation.map(([label, href]) => (
          <Link className="nav-link" href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
