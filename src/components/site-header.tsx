import Link from "next/link";

import type { Viewer } from "@/lib/auth/dal";
import { Brand } from "@/components/brand";
import { MobileNavigation } from "@/components/mobile-navigation";

const navigation = [
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/salaries", label: "Salaries" },
  { href: "/tools", label: "Tools" },
  // Insights returns to the nav once it has real data to show.
  ...(process.env.NEXT_PUBLIC_FEATURE_INSIGHTS === "true"
    ? [{ href: "/insights", label: "Insights" }]
    : []),
  { href: "/contribute", label: "Contribute" },
];

function AccountLinks({ viewer }: { viewer: Viewer }) {
  if (viewer.state === "unavailable") {
    return (
      <span className="status status-neutral" role="status">
        Account status unavailable
      </span>
    );
  }
  if (viewer.state !== "authenticated") {
    return (
      <Link className="nav-link header-sign-in" href="/auth/sign-in">
        Sign in
      </Link>
    );
  }

  return (
    <>
      <Link className="nav-link" href="/account">
        My career
      </Link>
      {viewer.isAdmin ? (
        <Link className="nav-link" href="/admin">
          Admin
        </Link>
      ) : null}
      <form action="/api/auth/sign-out" method="post">
        <button className="button button-quiet" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

export function SiteHeader({ viewer }: { viewer: Viewer }) {
  return (
    <header className="site-header">
      <div className="site-shell site-nav-row">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <div className="desktop-nav-main">
            {navigation.map((item) => (
              <Link className="nav-link" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="desktop-nav-actions">
            <AccountLinks viewer={viewer} />
            <Link className="button header-employer-cta" href="/post-a-job">
              Post a job
            </Link>
          </div>
        </nav>
        <Link className="mobile-employer-cta" href="/post-a-job">
          Post job
        </Link>
        <MobileNavigation>
          {navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <div className="mobile-nav-account">
            <AccountLinks viewer={viewer} />
          </div>
        </MobileNavigation>
      </div>
    </header>
  );
}
