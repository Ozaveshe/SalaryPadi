import type { DashboardSummary } from "./dashboard";
import type { NotificationKind } from "./notifications";

/**
 * Which notifications an account's own records justify.
 *
 * Free of "server-only" so the mapping from records to notifications can be
 * unit tested directly, in the same spirit as the match adapter. Every rule
 * here restates something already visible on one of the owner's own pages: a
 * date they set, an application they have not moved. Nothing is generated from
 * another account's data, from a prediction, or from an event that did not
 * happen.
 */

export interface PendingNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Always a path on this site; a notification is never a way off-site. */
  href: string;
  /**
   * Stable per condition, so a sweep that runs again while the condition is
   * still true updates one row instead of stacking duplicates.
   */
  dedupeKey: string;
}

/** How many are written per sweep, so one read cannot fan out unbounded. */
const MAX_PER_SYNC = 12;

export function deriveNotifications(
  summary: DashboardSummary,
): PendingNotification[] {
  // A degraded read reports zero of everything. Notifying from it would tell
  // someone nothing is due when the truth is that it could not be read.
  if (summary.state !== "ready") return [];

  const pending: PendingNotification[] = [];

  for (const action of summary.upcomingActions) {
    const overdue = action.urgency === "overdue";
    pending.push({
      kind: "action_due",
      title: overdue
        ? `Past its date: ${action.title}`
        : `Coming up: ${action.title}`,
      body: overdue
        ? `The next action you set for ${action.companyName} has passed. Move the date on, or update the status if the process has ended.`
        : `You set a next action for ${action.companyName}. It is the date on your own application record.`,
      href: "/applications",
      // Pinned to the date itself, so moving the date is a new notification
      // and leaving it alone is not.
      dedupeKey: `action_due:${action.jobSlug}:${action.dueAt.slice(0, 10)}`,
    });
  }

  for (const application of summary.activeApplications) {
    if (!application.stalled) continue;
    pending.push({
      kind: "application_stalled",
      title: `No change in two weeks: ${application.title}`,
      body: `Your ${application.companyName} application has not moved since ${application.updatedAt.slice(0, 10)}. If the process has ended, updating the status keeps your counts honest.`,
      href: "/applications",
      dedupeKey: `application_stalled:${application.jobSlug}:${application.updatedAt.slice(0, 10)}`,
    });
  }

  return pending.slice(0, MAX_PER_SYNC);
}
