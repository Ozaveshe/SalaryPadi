/**
 * The clock SalaryPadi operates on.
 *
 * The product is read from Lagos, Abuja and Port Harcourt, and every date it
 * shows was being rendered in UTC. That is an hour behind, which is not a
 * rounding error at the two moments it matters most: a job checked at 00:30
 * WAT read as "yesterday", and an application closing today read as closing
 * tomorrow. A Nigerian reader should not have to do arithmetic to find out
 * whether they have missed a deadline.
 *
 * Three things stay in UTC deliberately:
 *
 *   * Storage. Every timestamp column is `timestamptz` and stores an instant;
 *     a zone belongs to how an instant is *shown*, not to what is recorded.
 *   * Worker schedules. Netlify cron is UTC and the workers are internal.
 *   * An external provider's own calendar — the currency rates carry a data
 *     month set by the European Commission, and reinterpreting it in Lagos
 *     would mismatch the provider's own labelling.
 *
 * Country-scoped surfaces use their pack's `defaultTimeZone` instead
 * (Accra, Nairobi, Johannesburg), which is what `formatCountryDate` is for.
 * This is the default for everything that is not country-scoped.
 */

export const SALARYPADI_TIME_ZONE = "Africa/Lagos";

/**
 * Shown beside a timestamp so a reader knows which clock it is on.
 *
 * West Africa Time does not observe daylight saving, so this is a constant
 * rather than something derived per-date.
 */
export const SALARYPADI_TIME_ZONE_LABEL = "WAT";

/**
 * The calendar date an instant falls on, as a day index that can be
 * subtracted.
 *
 * Day arithmetic has to be done on calendar dates in a named zone, not on
 * elapsed milliseconds: "closes tomorrow" is a statement about the date in
 * Lagos, and 23 hours can span two dates or none depending on the clock time.
 * `en-CA` is used because it formats as YYYY-MM-DD, which parses unambiguously.
 */
export function zonedDayIndex(
  value: Date,
  timeZone: string = SALARYPADI_TIME_ZONE,
): number {
  // Intl throws on an invalid Date rather than formatting one, and a thrown
  // formatter would take down whatever page was rendering the timestamp.
  if (Number.isNaN(value.getTime())) return Number.NaN;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return Number.NaN;
  }
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whole calendar days from `from` to `to`, counted in the operating zone. */
export function zonedDaysBetween(
  from: Date,
  to: Date,
  timeZone: string = SALARYPADI_TIME_ZONE,
): number {
  return zonedDayIndex(to, timeZone) - zonedDayIndex(from, timeZone);
}

/** The current year on SalaryPadi's clock, for copyright and rule-year lines. */
export function currentZonedYear(
  now: Date = new Date(),
  timeZone: string = SALARYPADI_TIME_ZONE,
): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(now),
  );
}
