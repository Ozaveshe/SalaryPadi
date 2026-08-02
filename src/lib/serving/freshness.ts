/**
 * Public freshness states and the language that describes them.
 *
 * A public surface has to answer two different questions at once: *what can I
 * show you*, and *how much should you trust that it is current*. Collapsing
 * them is how a source outage becomes the sentence "no jobs found" — which is
 * a claim about the Nigerian job market, not about our pipeline, and it is
 * false.
 *
 * These five states keep the two apart. Every public read reports one, and
 * the consumer message for each is written for a job seeker, never for an
 * operator: no source names, no queue states, no parser errors.
 */

export const FRESHNESS_STATES = [
  "current",
  "partial",
  "stale",
  "unavailable",
  "confirmed_empty",
] as const;

export type FreshnessState = (typeof FRESHNESS_STATES)[number];

export interface FreshnessInput {
  /** Whether the read that produced these records completed successfully. */
  readSucceeded: boolean;
  /** Records actually available to show. */
  recordCount: number;
  /** When the newest verified snapshot behind these records was taken. */
  verifiedAt: string | null;
  /** Approved sources whose latest run did not complete. */
  delayedSourceCount: number;
  /** Approved sources in total. */
  totalSourceCount: number;
  /** How old a snapshot may be before it is described as stale. */
  freshnessTargetMs: number;
}

export interface FreshnessVerdict {
  state: FreshnessState;
  /** One sentence for a job seeker. Safe to render verbatim. */
  message: string;
  /** True when the surface may show records at all. */
  showsRecords: boolean;
  /** Why, in operational terms. Never rendered publicly. */
  operatorNote: string;
}

/** Formats a timestamp the way the brief specifies: "2 August at 14:20". */
export function formatVerifiedAt(
  iso: string,
  timeZone = "Africa/Lagos",
): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) return "an unknown time";
  const date = parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone,
  });
  const time = parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  return `${date} at ${time}`;
}

/**
 * Classify a public read.
 *
 * Order matters. A failed read is never allowed to fall through to
 * "confirmed empty", because the only thing that entitles us to tell someone
 * there are no matching jobs is a read that actually succeeded.
 */
export function classifyFreshness(input: FreshnessInput): FreshnessVerdict {
  const {
    readSucceeded,
    recordCount,
    verifiedAt,
    delayedSourceCount,
    totalSourceCount,
    freshnessTargetMs,
  } = input;

  // No trustworthy snapshot at all.
  if (!readSucceeded && recordCount === 0) {
    return {
      state: "unavailable",
      showsRecords: false,
      message:
        "We could not load jobs just now. This does not mean there are no jobs — please try again shortly.",
      operatorNote:
        "Read failed and no cached records were available to serve.",
    };
  }

  if (!verifiedAt) {
    return {
      state: "unavailable",
      showsRecords: recordCount > 0,
      message:
        "We could not confirm when this information was last updated, so it may not be current.",
      operatorNote: "No verified snapshot timestamp accompanied the records.",
    };
  }

  const ageMs = Date.now() - Date.parse(verifiedAt);
  const isStale = Number.isFinite(ageMs) && ageMs > freshnessTargetMs;
  const updated = `Updated ${formatVerifiedAt(verifiedAt)}.`;

  // A successful read that genuinely matched nothing. Only reachable when the
  // read succeeded and no source is delayed, so the emptiness is a fact about
  // the query rather than about our pipeline.
  if (readSucceeded && recordCount === 0 && delayedSourceCount === 0) {
    return {
      state: "confirmed_empty",
      showsRecords: false,
      message: `${updated} No jobs match this search right now.`,
      operatorNote: "Read completed successfully with zero matching records.",
    };
  }

  if (recordCount === 0) {
    // Nothing to show, and at least one source is delayed: we cannot claim
    // the result is empty.
    return {
      state: "partial",
      showsRecords: false,
      message: `${updated} Some sources are still updating, so this view may be incomplete. Please check back shortly.`,
      operatorNote: `${delayedSourceCount} of ${totalSourceCount} sources delayed; zero records available.`,
    };
  }

  if (isStale) {
    return {
      state: "stale",
      showsRecords: true,
      message: `${updated} These jobs are from our latest verified snapshot, which is older than usual — check the employer's own page before applying.`,
      operatorNote: `Snapshot age ${Math.round(ageMs / 60_000)} minutes exceeds the freshness target.`,
    };
  }

  if (delayedSourceCount > 0) {
    return {
      state: "partial",
      showsRecords: true,
      message: `${updated} Some sources are delayed, but the jobs shown below are from the latest verified snapshot.`,
      operatorNote: `${delayedSourceCount} of ${totalSourceCount} sources delayed; serving verified records.`,
    };
  }

  return {
    state: "current",
    showsRecords: true,
    message: updated,
    operatorNote: "All approved sources current.",
  };
}

/**
 * The sanitised public status payload.
 *
 * Deliberately narrow: a status endpoint is a public surface, and naming
 * which provider is failing tells the world where our supply comes from and
 * when it is weak. Operators get the detail from the private dashboard.
 */
export interface PublicStatus {
  state: "current" | "delayed" | "partial" | "unavailable";
  lastSuccessfulUpdate: string | null;
}

export function toPublicStatus(
  verdict: FreshnessVerdict,
  verifiedAt: string | null,
): PublicStatus {
  const state: PublicStatus["state"] =
    verdict.state === "current" || verdict.state === "confirmed_empty"
      ? "current"
      : verdict.state === "stale"
        ? "delayed"
        : verdict.state === "partial"
          ? "partial"
          : "unavailable";
  return { state, lastSuccessfulUpdate: verifiedAt };
}

/**
 * Vocabulary that must never reach a public surface. Asserted by test against
 * every message this module produces.
 */
export const OPERATIONAL_VOCABULARY = [
  "budget",
  "timeout",
  "timed out",
  "ingestion",
  "parser",
  "provider",
  "queue",
  "coverage gate",
  "runtime eligibility",
  "http",
  "supabase",
  "adapter",
  "snapshot run",
  "jobicy",
  "himalayas",
  "remotive",
  "reliefweb",
  "greenhouse",
  "workable",
  "ashby",
] as const;
