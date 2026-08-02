import Link from "next/link";

import type { Viewer } from "@/lib/auth/dal";
import { Brand } from "@/components/brand";
import { MobileNavigation } from "@/components/mobile-navigation";
import { primaryNavigation } from "@/lib/product/surfaces";

/*
 * Four surfaces, not a list of every page. Salaries and the pay tools were
 * separate header entries even though a user thinking about money does not
 * distinguish them, and Contribute sat beside them as a peer of the whole
 * jobs catalogue. The full set of destinations lives on each surface landing
 * page; see src/lib/product/surfaces.ts.
 */
function buildNavigation() {
  return primaryNavigation();
}

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
        Account
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
  const navigation = buildNavigation();
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
