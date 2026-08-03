/**
 * Shared rules for reading where a tracked application sits in its process.
 *
 * The overview and the tracker describe the same records, so "live", "stalled"
 * and "due" are defined once here. A summary that counted these differently
 * from the page it links to would contradict itself.
 *
 * Every rule is pure and takes `now` explicitly. These are time-dependent
 * readings of the account owner's own data, and a caller that cannot pin the
 * clock cannot test them.
 */

/** Statuses that represent a live, in-flight process, in funnel order. */
export const ACTIVE_APPLICATION_STATUSES = [
  "applied",
  "assessment",
  "interview",
  "offer",
] as const;

export type ActiveApplicationStatus =
  (typeof ACTIVE_APPLICATION_STATUSES)[number];

const ACTIVE_STATUSES: ReadonlySet<string> = new Set(
  ACTIVE_APPLICATION_STATUSES,
);

export function isActiveApplicationStatus(
  status: string,
): status is ActiveApplicationStatus {
  return ACTIVE_STATUSES.has(status);
}

/**
 * An application untouched for two weeks has usually progressed off-platform.
 * That moment — not the moment of applying — is when a first-party interview
 * or salary account exists to be asked for.
 */
export const STALE_APPLICATION_MS = 14 * 24 * 60 * 60 * 1_000;

export function isStaleApplication(
  updatedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const updated = Date.parse(updatedAt);
  return Number.isFinite(updated) && now - updated >= STALE_APPLICATION_MS;
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Index of the UTC calendar day an instant falls on. */
function utcDay(timestamp: number): number {
  return Math.floor(timestamp / MS_PER_DAY);
}

export type DeadlineUrgency = "overdue" | "today" | "tomorrow" | "upcoming";

export type Deadline = {
  /** Whole calendar days from today; negative once the date has passed. */
  dayOffset: number;
  urgency: DeadlineUrgency;
  /** The same offset in words, e.g. "Overdue by 3 days". */
  description: string;
};

/**
 * Reads a self-set next-action date as an urgency.
 *
 * The comparison runs on the UTC calendar because that is the calendar the date
 * is displayed on (`formatDate` pins the operating zone). Comparing against a
 * local calendar instead would let a date rendered as today be described as
 * tomorrow.
 *
 * Returns null for an unparseable date rather than guessing at one: an
 * invented deadline is worse than an absent one.
 */
export function readDeadline(
  dueAt: string,
  now: number = Date.now(),
): Deadline | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;

  const dayOffset = utcDay(due) - utcDay(now);
  if (dayOffset < 0) {
    const days = Math.abs(dayOffset);
    return {
      dayOffset,
      urgency: "overdue",
      description: days === 1 ? "Overdue by a day" : `Overdue by ${days} days`,
    };
  }
  if (dayOffset === 0) {
    return { dayOffset, urgency: "today", description: "Due today" };
  }
  if (dayOffset === 1) {
    return { dayOffset, urgency: "tomorrow", description: "Due tomorrow" };
  }
  return {
    dayOffset,
    urgency: "upcoming",
    description: `Due in ${dayOffset} days`,
  };
}
