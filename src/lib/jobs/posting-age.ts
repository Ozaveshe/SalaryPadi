import type { Job } from "./types";

/**
 * Age-based freshness for open roles.
 *
 * The absence-based lifecycle in `app.jobs` only closes a role after two
 * consecutive complete snapshots omit it. A board that leaves a filled role
 * posted forever never triggers it, so a listing can stay "open" indefinitely
 * while its own posting date recedes. This module bounds that on the evidence
 * SalaryPadi actually holds — the source's posting date — without inventing an
 * expiry the source never published.
 *
 * Two treatments, in the order the conventions prefer them:
 *
 * 1. Visible decay from {@link JOB_POSTING_AGING_DAYS}. The role stays listed
 *    and applicable, carrying a warning that states exactly what is known: the
 *    source still carries the posting, and its posting date is old.
 * 2. Withdrawal from public listing at {@link JOB_POSTING_WITHDRAWAL_DAYS},
 *    enforced through `isJobCurrentlyPublishable` so every public surface —
 *    browse, detail, sitemap, landing pages, JobPosting JSON-LD — drops it in
 *    one pass rather than each surface deciding for itself.
 *
 * Nothing here derives a `valid_through`. Neither the Greenhouse nor the
 * Workable payload carries an expiry field, and the withdrawal bound is
 * SalaryPadi's own publication policy, not a deadline the employer stated.
 *
 * Ageing is measured from `Job.postedAt`. Sources that publish no posting date
 * at all (Greenhouse) are decoded with `last_checked_at` in that slot, so they
 * read as perpetually current and never decay here. That is a known gap in the
 * adapter, tracked separately; this module cannot close it without inventing
 * the date the source withheld. It starts working for those roles the moment a
 * real posting date is recorded.
 */

const DAY_MS = 86_400_000;

/** Age at which a still-listed role starts carrying a visible decay warning. */
export const JOB_POSTING_AGING_DAYS = 90;

/** Age at which the decay warning hardens from three months to six. */
export const JOB_POSTING_STALE_DAYS = 180;

/** Age at which a role is withdrawn from every public surface. */
export const JOB_POSTING_WITHDRAWAL_DAYS = 365;

export type JobPostingAgeStage = "current" | "aging" | "stale" | "withdrawn";

export interface JobPostingAge {
  stage: JobPostingAgeStage;
  /** Whole days since the recorded posting date, or null if it is unreadable. */
  ageDays: number | null;
  /** Short badge text for decayed roles; null while the role reads as current. */
  label: string | null;
  /** One-sentence explanation for the detail page; null for current roles. */
  note: string | null;
}

/**
 * Whole days between the recorded posting date and `now`. Returns null when
 * the timestamp cannot be read, so callers can distinguish "no age evidence"
 * from "aged zero days" and decline to decay a role on a bad parse.
 */
export function jobPostingAgeDays(job: Job, now = new Date()): number | null {
  const posted = Date.parse(job.postedAt);
  const nowValue = now.valueOf();
  if (!Number.isFinite(posted) || !Number.isFinite(nowValue)) return null;
  return Math.floor((nowValue - posted) / DAY_MS);
}

function decayNote(months: number): string {
  return (
    "The source still carries this posting, but its posting date is more than " +
    `${months} months old. Remaining listed is not evidence that the role is ` +
    "still open — confirm on the original posting before applying."
  );
}

/**
 * The freshness treatment a role has earned. `withdrawn` is reported for
 * completeness and for operational reporting — such a job is filtered out of
 * the public feed before it ever reaches a component.
 */
export function jobPostingAge(job: Job, now = new Date()): JobPostingAge {
  const ageDays = jobPostingAgeDays(job, now);
  if (ageDays === null || ageDays < JOB_POSTING_AGING_DAYS) {
    return { stage: "current", ageDays, label: null, note: null };
  }
  if (ageDays >= JOB_POSTING_WITHDRAWAL_DAYS) {
    return {
      stage: "withdrawn",
      ageDays,
      label: "Posted over a year ago",
      note: "This posting is more than a year old and is no longer listed publicly.",
    };
  }
  if (ageDays >= JOB_POSTING_STALE_DAYS) {
    return {
      stage: "stale",
      ageDays,
      label: "Posted over 6 months ago",
      note: decayNote(6),
    };
  }
  return {
    stage: "aging",
    ageDays,
    label: "Posted over 3 months ago",
    note: decayNote(3),
  };
}

/**
 * Whether a role has aged past the public listing bound. Consulted by
 * `isJobCurrentlyPublishable`; prefer that predicate over calling this.
 */
export function isJobWithdrawnForAge(job: Job, now = new Date()): boolean {
  const ageDays = jobPostingAgeDays(job, now);
  return ageDays !== null && ageDays >= JOB_POSTING_WITHDRAWAL_DAYS;
}
