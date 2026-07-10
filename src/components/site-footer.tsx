import Link from "next/link";

import { Brand } from "@/components/brand";

const links = [
  ["About", "/about"],
  ["Methodology", "/methodology"],
  ["Trust & safety", "/trust-and-safety"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell footer-grid">
        <div className="stack">
          <Brand />
          <p className="m-0 max-w-xl text-sm text-[#d6e6df]">
            Clearer jobs, compensation and workplace evidence for Africans.
            SalaryPadi explains confidence and uncertainty; it never promises
            that a vacancy is risk-free.
          </p>
          <p className="m-0 text-xs text-[#b9cec5]">
            © {new Date().getUTCFullYear()} SalaryPadi. Built for informed
            career decisions.
          </p>
        </div>
        <nav className="footer-links" aria-label="Legal and trust">
          {links.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
