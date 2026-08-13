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

type WorkspaceNavGroup = {
  label: string;
  items: WorkspaceNavItem[];
};

const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    label: "Start",
    items: [
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
      {
        href: "/matches",
        label: "CV matches",
        description: "Roles that name what your CV names",
      },
    ],
  },
  {
    label: "Decide",
    items: [
      {
        href: "/tools",
        label: "Decision tools",
        description: "Check, convert, calculate and compare",
      },
    ],
  },
  {
    label: "Track",
    items: [
      { href: "/saved", label: "Saved jobs", description: "Roles you kept" },
      {
        href: "/applications",
        label: "Applications",
        description: "Track every process you are in",
      },
      {
        href: "/alerts",
        label: "Job alerts",
        description: "Email alerts you own",
      },
      {
        href: "/notifications",
        label: "Notifications",
        description: "What changed in your own records",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/account/candidate-profile",
        label: "Career profile",
        description: "What you tell employers about yourself",
      },
      {
        href: "/account",
        label: "Security & privacy",
        description: "Identity, sign-in and privacy controls",
      },
    ],
  },
];

const WORKSPACE_NAV = WORKSPACE_NAV_GROUPS.flatMap((group) => group.items);

/**
 * The navigation entry a route belongs to.
 *
 * Matching is longest-prefix rather than exact so a nested route still marks
 * its section — `/account/candidate-profile` is its own entry, but any other
 * page under `/account` marks Account & security instead of marking nothing.
 */
export function currentWorkspaceSection(pathname: string): string | null {
  const matches = WORKSPACE_NAV.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).toSorted((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

export function WorkspaceShell({
  current,
  title,
  description,
  actions,
  unreadNotifications = null,
  children,
}: {
  /** The route this view belongs to; any path under a nav entry resolves to it. */
  current: string;
  title: string;
  description: string;
  actions?: ReactNode;
  /**
   * Unread notifications for the badge. Null means the count is unknown — a
   * page that did not read it, or a read that failed — and shows no badge at
   * all, because "none unread" and "could not be read" are different answers.
   *
   * Passed in rather than fetched here so this stays a synchronous component:
   * the workspace views are verified by rendering them to static markup, which
   * cannot render a nested async component.
   */
  unreadNotifications?: number | null;
  children?: ReactNode;
}) {
  const currentSection = currentWorkspaceSection(current);
  const notifications = unreadNotifications;
  return (
    <div className="workspace">
      <nav className="workspace-nav" aria-label="Your workspace">
        <p className="workspace-nav-label">Your workspace</p>
        <div className="workspace-nav-groups">
          {WORKSPACE_NAV_GROUPS.map((group) => (
            <div className="workspace-nav-group" key={group.label}>
              <p className="workspace-nav-group-label">{group.label}</p>
              <ul className="workspace-nav-list">
                {group.items.map((item) => {
                  const isCurrent = item.href === currentSection;
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
                        <span className="workspace-nav-link-label">
                          {item.label}
                          {item.href === "/notifications" &&
                          notifications !== null &&
                          notifications > 0 ? (
                            <span className="workspace-nav-count">
                              {notifications}
                              <span className="visually-hidden"> unread</span>
                            </span>
                          ) : null}
                        </span>
                        <span className="workspace-nav-link-description">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
