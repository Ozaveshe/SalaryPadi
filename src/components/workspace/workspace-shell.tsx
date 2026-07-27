import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The signed-in product surface.
 *
 * Deliberately distinct from the marketing header: once someone signs in, the
 * job is to move them between their own records quickly, not to re-pitch the
 * product. Navigation is a plain list of links so it works without JavaScript
 * and stays reachable by keyboard and screen reader in source order.
 */

type WorkspaceNavItem = {
  href: string;
  label: string;
  description: string;
};

const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Your saved jobs, applications and next actions",
  },
  {
    href: "/jobs",
    label: "Find jobs",
    description: "Browse roles open to Nigeria first",
  },
  { href: "/saved", label: "Saved jobs", description: "Roles you kept" },
  {
    href: "/applications",
    label: "Applications",
    description: "Track every process you are in",
  },
  { href: "/alerts", label: "Job alerts", description: "Email alerts you own" },
  {
    href: "/account/candidate-profile",
    label: "Career profile",
    description: "What you tell employers about yourself",
  },
  {
    href: "/account",
    label: "Account & security",
    description: "Identity, sign-in and privacy controls",
  },
];

export function WorkspaceShell({
  current,
  title,
  description,
  actions,
  children,
}: {
  current: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="workspace">
      <nav className="workspace-nav" aria-label="Your workspace">
        <p className="workspace-nav-label">Your workspace</p>
        <ul className="workspace-nav-list">
          {WORKSPACE_NAV.map((item) => {
            const isCurrent = item.href === current;
            return (
              <li key={item.href}>
                <Link
                  className={
                    isCurrent
                      ? "workspace-nav-link workspace-nav-link-current"
                      : "workspace-nav-link"
                  }
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  <span className="workspace-nav-link-label">{item.label}</span>
                  <span className="workspace-nav-link-description">
                    {item.description}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="workspace-main stack-lg">
        <header className="workspace-header">
          <div className="stack">
            <h1 className="page-title">{title}</h1>
            <p className="text-muted m-0">{description}</p>
          </div>
          {actions ? <div className="cluster">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * A single headline number. The label carries the unit and the caption carries
 * the qualifier, so the figure is never presented without what it counts.
 */
export function WorkspaceStat({
  value,
  label,
  caption,
  href,
}: {
  value: number | string;
  label: string;
  caption: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="workspace-stat-value">{value}</span>
      <span className="workspace-stat-label">{label}</span>
      <span className="workspace-stat-caption">{caption}</span>
    </>
  );
  return href ? (
    <Link className="workspace-stat workspace-stat-link" href={href}>
      {body}
    </Link>
  ) : (
    <div className="workspace-stat">{body}</div>
  );
}
