import { currentZonedYear } from "@/lib/time/zone";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { PRODUCT_SURFACES } from "@/lib/product/surfaces";

/**
 * The footer derives its primary group from the same surface model as the
 * header and mobile drawer, so the two navigations cannot drift apart —
 * the 2026-08 audit found this file hand-listing a six-entry navigation the
 * surface consolidation had already replaced, and shipping /insights
 * regardless of its feature flag.
 */
const CONTRIBUTE_LINKS = [
  ["Add salary", "/contribute/salary"],
  ["Add review", "/contribute/review"],
  ["Add benefits", "/contribute/benefits"],
  ["Pay reliability", "/contribute/pay-reliability"],
  ["Add interview", "/contribute/interview"],
] as const;

const EMPLOYER_LINKS = [
  ["Post a job", "/post-a-job"],
  ["Claim your company", "/for-employers"],
] as const;

const TRUST_LINKS = [
  ["About", "/about"],
  ["Methodology", "/methodology"],
  ["Trust & safety", "/trust-and-safety"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
] as const;

export function SiteFooter() {
  const exploreLinks: readonly (readonly [string, string])[] = [
    ...PRODUCT_SURFACES.map(
      (surface) => [surface.label, surface.href] as const,
    ),
    ["Blog", "/blog"],
  ];
  const footerGroups = [
    { label: "Explore", links: exploreLinks },
    { label: "Contribute", links: CONTRIBUTE_LINKS },
    { label: "For employers", links: EMPLOYER_LINKS },
    { label: "Trust", links: TRUST_LINKS },
  ];
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
            © {currentZonedYear()} SalaryPadi. Built for informed career
            decisions.
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
              {group.links.map(([label, href]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
