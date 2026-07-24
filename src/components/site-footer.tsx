import Link from "next/link";

import { Brand } from "@/components/brand";

const footerGroups = [
  {
    label: "Explore",
    links: [
      ["Jobs", "/jobs"],
      ["Companies", "/companies"],
      ["Salaries", "/salaries"],
      ["Tools", "/tools"],
      ["Insights", "/insights"],
    ],
  },
  {
    label: "Contribute",
    links: [
      ["Add salary", "/contribute/salary"],
      ["Add review", "/contribute/review"],
      ["Add benefits", "/contribute/benefits"],
      ["Pay reliability", "/contribute/pay-reliability"],
      ["Add interview", "/contribute/interview"],
    ],
  },
  {
    label: "For employers",
    links: [
      ["Post a job", "/post-a-job"],
      [
        "Claim your company",
        "mailto:support@salarypadi.com?subject=Company%20claim%20request",
      ],
    ],
  },
  {
    label: "Trust",
    links: [
      ["About", "/about"],
      ["Methodology", "/methodology"],
      ["Trust & safety", "/trust-and-safety"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell footer-grid">
        <div className="stack">
          <Brand />
          <p className="m-0 max-w-xl text-sm text-[#d6e6df]">
            Fresh jobs Africans can actually apply for, with pay, company truth
            and decision tools in one path. Missing evidence stays missing.
          </p>
          <p className="m-0 text-xs text-[#b9cec5]">
            © {new Date().getUTCFullYear()} SalaryPadi. Built for informed
            career decisions.
          </p>
        </div>
        <div className="footer-nav-groups">
          {footerGroups.map((group) => (
            <nav
              className="footer-links"
              aria-label={group.label}
              key={group.label}
            >
              <strong>{group.label}</strong>
              {group.links.map(([label, href]) =>
                href.startsWith("mailto:") ? (
                  <a href={href} key={href}>
                    {label}
                  </a>
                ) : (
                  <Link href={href} key={href}>
                    {label}
                  </Link>
                ),
              )}
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
