import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | SalaryPadi Admin" },
  robots: { index: false, follow: false, nocache: true },
};

const adminNavigation = [
  ["Overview", "/admin"],
  ["Jobs", "/admin/jobs"],
  ["Imports", "/admin/imports"],
  ["Sources", "/admin/sources"],
  ["Companies", "/admin/companies"],
  ["Moderation", "/admin/moderation"],
  ["Reports", "/admin/reports"],
  ["Users", "/admin/users"],
  ["Calculation rules", "/admin/calculation-rules"],
  ["Editorial", "/admin/editorial"],
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
