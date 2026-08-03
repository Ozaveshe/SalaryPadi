/**
 * The application deadline, stated plainly.
 *
 * A deadline was reachable in the data and shown nowhere: `valid_through` sat
 * in the record while the page listed source, freshness and posting age. Of
 * everything on a job page it is the one fact that expires, and the one a
 * reader is worst served by discovering late.
 *
 * Days are counted in whole calendar days from the start of today, so "closes
 * tomorrow" does not become "closes in 0 days" because of the clock time.
 */

export type DeadlineNotice =
  | { state: "none" }
  | { state: "closed"; label: string }
  | { state: "open"; label: string; daysRemaining: number; urgent: boolean };

/** Inside this many days the deadline is called out rather than just stated. */
export const DEADLINE_URGENT_DAYS = 7;

const DAY_MS = 86_400_000;

function startOfDay(value: Date) {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function formatDeadlineDate(value: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function jobDeadlineNotice(
  validThrough: string | null | undefined,
  now: Date,
): DeadlineNotice {
  if (!validThrough) return { state: "none" };
  const parsed = new Date(validThrough);
  if (Number.isNaN(parsed.getTime())) return { state: "none" };

  const daysRemaining = Math.round(
    (startOfDay(parsed) - startOfDay(now)) / DAY_MS,
  );
  const date = formatDeadlineDate(parsed);

  if (daysRemaining < 0) {
    return { state: "closed", label: `Applications closed on ${date}` };
  }
  if (daysRemaining === 0) {
    return {
      state: "open",
      label: `Applications close today, ${date}`,
      daysRemaining,
      urgent: true,
    };
  }
  return {
    state: "open",
    label:
      daysRemaining === 1
        ? `Applications close tomorrow, ${date}`
        : `Applications close on ${date}`,
    daysRemaining,
    urgent: daysRemaining <= DEADLINE_URGENT_DAYS,
  };
}
