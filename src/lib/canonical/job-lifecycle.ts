/**
 * Job lifecycle.
 *
 * A listing is a claim about the world that decays. The lifecycle prevents
 * two opposite failures: showing a job that closed weeks ago, and closing a
 * job because a network request timed out.
 *
 * The second failure is the dangerous one, because it is invisible. A
 * rate-limited provider that silently emptied the board would look exactly
 * like a quiet job market.
 */

export const JOB_LIFECYCLE_STATES = [
  "draft",
  "active",
  "possibly_active",
  "source_delayed",
  "closed",
  "expired",
  "removed",
  "duplicate",
  "invalid",
  "rights_blocked",
  "manual_review",
] as const;

export type JobLifecycleState = (typeof JOB_LIFECYCLE_STATES)[number];

/** States a visitor may see, given rights and country packs also allow it. */
const PUBLISHABLE: ReadonlySet<JobLifecycleState> = new Set([
  "active",
  "possibly_active",
  "source_delayed",
]);

export function isPublishableState(state: JobLifecycleState): boolean {
  return PUBLISHABLE.has(state);
}

/**
 * Outcome of a single source fetch. Only `complete` carries information about
 * absence: every other outcome means we failed to look, not that the job is
 * gone.
 */
export type FetchOutcome =
  | "complete"
  | "partial"
  | "failed"
  | "timed_out"
  | "rate_limited"
  | "forbidden";

export function outcomeProvesAbsence(outcome: FetchOutcome): boolean {
  return outcome === "complete";
}

export interface LifecycleInput {
  state: JobLifecycleState;
  /** Successful snapshots in a row that did not contain this job. */
  successfulOmissions: number;
  firstSuccessfulAbsenceAt?: string | null;
  /** The source's own stated deadline, if any. */
  validThrough?: string | null;
  /** When the job was last seen present in a successful snapshot. */
  lastSeenAt?: string | null;
  /** Whether the source may currently publish at all. */
  rightsPermitPublication: boolean;
  /** Consecutive failed or timed-out fetches for this source. */
  consecutiveSourceFailures: number;
}

export interface LifecycleTransition {
  state: JobLifecycleState;
  reason: string;
  changed: boolean;
}

/** Absence must persist this long before a second omission may close a job. */
export const CLOSURE_GRACE_MINUTES = 30;

/** A source silent for this many consecutive attempts is delayed, not empty. */
export const SOURCE_DELAY_THRESHOLD = 2;

/** Direct and manual jobs without a deadline close after this long unseen. */
export const UNCONFIRMED_MAX_DAYS = 30;

function minutesBetween(from: string, to: Date): number {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return 0;
  return (to.getTime() - start) / 60_000;
}

function daysBetween(from: string, to: Date): number {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return 0;
  return (to.getTime() - start) / 86_400_000;
}

/**
 * Apply one observation to a job's lifecycle.
 *
 * `outcome` is the fetch result for the whole snapshot; `seen` is whether the
 * job appeared in it. A job cannot move toward closure on any outcome other
 * than a complete snapshot.
 */
export function nextLifecycleState(
  input: LifecycleInput,
  observation: { outcome: FetchOutcome; seen: boolean },
  now: Date = new Date(),
): LifecycleTransition {
  const unchanged = (reason: string): LifecycleTransition => ({
    state: input.state,
    reason,
    changed: false,
  });

  // Rights outrank everything. A source that may not publish withdraws its
  // jobs regardless of whether they are still live at the source.
  if (!input.rightsPermitPublication) {
    return {
      state: "rights_blocked",
      reason: "The source's rights no longer permit publication.",
      changed: input.state !== "rights_blocked",
    };
  }

  // Terminal states are not revisited by routine observation.
  if (
    input.state === "duplicate" ||
    input.state === "invalid" ||
    input.state === "removed"
  ) {
    return unchanged("Terminal state; routine observation does not reopen it.");
  }

  if (input.state === "manual_review") {
    return unchanged("Held for a reviewer; ingestion does not override.");
  }

  // A stated deadline in the past closes the job, whatever the snapshot said.
  if (input.validThrough) {
    const deadline = Date.parse(input.validThrough);
    if (Number.isFinite(deadline) && deadline < now.getTime()) {
      return {
        state: "expired",
        reason: "The source's own closing date has passed.",
        changed: input.state !== "expired",
      };
    }
  }

  if (observation.seen) {
    return {
      state: "active",
      reason: "Seen in the latest snapshot; absence evidence reset.",
      changed: input.state !== "active",
    };
  }

  // Not seen. Everything below depends on whether we actually looked.
  if (!outcomeProvesAbsence(observation.outcome)) {
    if (input.consecutiveSourceFailures + 1 >= SOURCE_DELAY_THRESHOLD) {
      return {
        state: "source_delayed",
        reason: `The source has failed ${input.consecutiveSourceFailures + 1} times (${observation.outcome}); absence is unproven.`,
        changed: input.state !== "source_delayed",
      };
    }
    return unchanged(
      `Snapshot outcome ${observation.outcome} cannot prove absence; state held.`,
    );
  }

  // A complete snapshot that did not contain the job.
  const omissions = input.successfulOmissions + 1;

  if (omissions === 1) {
    return {
      state: "possibly_active",
      reason: "Absent from one complete snapshot; awaiting confirmation.",
      changed: input.state !== "possibly_active",
    };
  }

  const graceElapsed = input.firstSuccessfulAbsenceAt
    ? minutesBetween(input.firstSuccessfulAbsenceAt, now) >=
      CLOSURE_GRACE_MINUTES
    : false;

  if (!graceElapsed) {
    return unchanged(
      `Absent again, but less than ${CLOSURE_GRACE_MINUTES} minutes since the first absence; two rapid ticks cannot close a job.`,
    );
  }

  return {
    state: "closed",
    reason: `Absent from ${omissions} complete snapshots over more than ${CLOSURE_GRACE_MINUTES} minutes.`,
    changed: input.state !== "closed",
  };
}

/**
 * A job with no stated deadline must not stay active forever. This is the
 * opposite guard to the closure rules above.
 */
export function exceedsUnconfirmedWindow(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeenAt) return false;
  return daysBetween(lastSeenAt, now) > UNCONFIRMED_MAX_DAYS;
}
