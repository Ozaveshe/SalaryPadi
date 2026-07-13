import Link from "next/link";

import type { Viewer } from "@/lib/auth/dal";
import { Brand } from "@/components/brand";
import { MobileNavigation } from "@/components/mobile-navigation";

const navigation = [
  { href: "/jobs", label: "Jobs" },
  { href: "/salaries", label: "Salaries" },
  { href: "/companies", label: "Companies" },
  { href: "/insights", label: "Insights" },
  { href: "/feed", label: "Feed" },
  { href: "/forums", label: "Forums" },
  { href: "/tools", label: "Tools" },
  { href: "/contribute", label: "Contribute" },
] as const;

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
      <Link className="button button-secondary" href="/auth/sign-in">
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
          {navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <AccountLinks viewer={viewer} />
        </nav>
        <MobileNavigation>
          {navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <AccountLinks viewer={viewer} />
        </MobileNavigation>
      </div>
    </header>
  );
}
