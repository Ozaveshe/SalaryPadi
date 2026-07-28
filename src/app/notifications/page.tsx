import type { Metadata } from "next";
import Link from "next/link";

import { PrivateDataStatus } from "@/components/private-data-status";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireViewer } from "@/lib/auth/dal";
import { getDashboardSummary } from "@/lib/career/dashboard";
import { syncNotifications } from "@/lib/career/notification-sync";
import {
  getNotificationEmailOptOuts,
  getNotifications,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
} from "@/lib/career/notifications";
import { formatDate } from "@/lib/format";
import { sliceSearchParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false, nocache: true },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireViewer("/notifications");
  const input = await searchParams;
  const preference = sliceSearchParam(input.preference, 10);
  const status = sliceSearchParam(input.notifications, 10);

  // The sweep runs before the read so a condition that became true since the
  // last visit is present on this page rather than the next one. Writes are
  // idempotent, so a refresh does not duplicate anything.
  await syncNotifications(await getDashboardSummary());
  const [feed, optOuts] = await Promise.all([
    getNotifications(),
    getNotificationEmailOptOuts(),
  ]);
  const optedOut = new Set(optOuts.data);

  return (
    <div className="site-shell">
      <WorkspaceShell
        unreadNotifications={
          feed.state === "ready" ? feed.data.unreadCount : null
        }
        current="/notifications"
        title="Notifications"
        description="Everything here restates something already in your own records. SalaryPadi never notifies you about an event it cannot show you the source of."
        actions={
          feed.data.unreadCount > 0 ? (
            <form action="/api/notifications/read" method="post">
              <input type="hidden" name="redirect_to" value="/notifications" />
              <button className="button button-secondary" type="submit">
                Mark all read
              </button>
            </form>
          ) : undefined
        }
      >
        {status === "error" ? (
          <div className="notice notice-danger" role="alert">
            The notification could not be marked as read. Try again.
          </div>
        ) : null}
        {preference === "saved" ? (
          <div className="notice" role="status">
            Email preference saved.
          </div>
        ) : preference === "error" ? (
          <div className="notice notice-danger" role="alert">
            The email preference could not be saved. Try again.
          </div>
        ) : null}

        {feed.state !== "ready" ? (
          <PrivateDataStatus state={feed.state} />
        ) : null}

        <section className="stack" aria-labelledby="notification-list-heading">
          <h2 className="section-title" id="notification-list-heading">
            Recent
          </h2>
          {feed.data.items.length === 0 ? (
            <div className="empty-state">
              <h3 className="m-0 text-xl font-bold">Nothing to report</h3>
              <p className="text-muted mt-2 mb-0 max-w-2xl">
                Notifications come from your own records: a next-action date you
                set, an application that has not moved, or a role matching the
                profile you attested to. None of those apply right now.
              </p>
              <Link className="button button-secondary mt-4" href="/jobs">
                Find jobs
              </Link>
            </div>
          ) : (
            <ul className="private-list">
              {feed.data.items.map((item) => (
                <li
                  className="private-row notification-row"
                  data-unread={item.read_at === null ? "true" : undefined}
                  key={item.id}
                >
                  <div className="stack">
                    <p className="m-0 font-bold">
                      {item.read_at === null ? (
                        <span className="visually-hidden">Unread. </span>
                      ) : null}
                      {item.title}
                    </p>
                    <p className="text-muted m-0 text-sm">{item.body}</p>
                    <p className="source-note m-0">
                      {NOTIFICATION_KIND_LABELS[item.kind].label} ·{" "}
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                  <form action="/api/notifications/read" method="post">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="redirect_to" value={item.href} />
                    <button className="button button-secondary" type="submit">
                      Open
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="surface surface-pad stack"
          aria-labelledby="notification-email-heading"
        >
          <h2 className="section-title" id="notification-email-heading">
            Email for these
          </h2>
          <p className="text-muted m-0">
            Each kind is emailed unless you switch it off here. Everything stays
            in this list either way, and job alert digests still exclude sources
            that do not permit email distribution.
          </p>
          {optOuts.state !== "ready" ? (
            <PrivateDataStatus state={optOuts.state} />
          ) : (
            <ul className="notification-preference-list">
              {NOTIFICATION_KINDS.map((kind) => (
                <li key={kind}>
                  <form
                    action="/api/notifications/email-preference"
                    method="post"
                    className="notification-preference"
                  >
                    <input type="hidden" name="kind" value={kind} />
                    <div className="stack">
                      <label className="checkbox" htmlFor={`email-${kind}`}>
                        <input
                          defaultChecked={!optedOut.has(kind)}
                          id={`email-${kind}`}
                          name="email"
                          type="checkbox"
                          value="on"
                        />
                        <span>{NOTIFICATION_KIND_LABELS[kind].label}</span>
                      </label>
                      <p className="field-help m-0">
                        {NOTIFICATION_KIND_LABELS[kind].description}
                      </p>
                    </div>
                    <button className="button button-quiet" type="submit">
                      Save
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </WorkspaceShell>
    </div>
  );
}
