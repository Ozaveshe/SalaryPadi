/**
 * Controlled employer discovery.
 *
 * The 2026-08-02 audit found the binding constraint is employers, not jobs:
 * 10 employers held all 230 visible jobs, three of them 84.3%. Adding another
 * large board makes concentration worse; adding twenty small Nigerian
 * employers makes the product work.
 *
 * This module ranks *candidates for review*. It never registers a source and
 * never publishes anything. A candidate leaves here as a prioritised entry in
 * a queue that a person then takes through the existing source-registration
 * recipe — draft, configure, re-review, activate, grant country rights.
 */

export type DiscoveryMethod =
  | "careers_page_link"
  | "ats_tenant_probe"
  | "vendor_sweep"
  | "user_request"
  | "employer_submission";

export interface EmployerCandidate {
  name: string;
  /** Careers or corporate domain, when known. */
  domain: string | null;
  /** Provider and tenant if an ATS board was found, e.g. greenhouse:acme. */
  atsTenant: string | null;
  discoveredVia: DiscoveryMethod;
  /** Evidence the employer hires in Nigeria. */
  nigeriaPresence: boolean;
  /** Evidence of hiring elsewhere in Africa. */
  africaPresence: boolean;
  /** Evidence of remote roles open beyond the employer's own country. */
  remoteHiringEvidence: boolean;
  /** Live roles observed when the board was probed. Null when unprobed. */
  observedOpenRoles: number | null;
  /** Most recent posting date seen on the board. */
  latestPostingAt: string | null;
  /** Requests from users for this employer. */
  userRequestCount: number;
  /** Job families this employer would add that are currently thin. */
  underrepresentedFunctions: readonly string[];
  /** Already registered? Re-discovering an existing source is not a find. */
  alreadyRegistered: boolean;
}

export interface DiscoveryScore {
  candidate: EmployerCandidate;
  score: number;
  /** Human-readable reasons, highest contribution first. */
  reasons: string[];
  /** Reasons this candidate cannot proceed to review at all. */
  blockers: string[];
  reviewable: boolean;
}

/**
 * A board whose newest posting is older than this is a zombie: it exists,
 * answers requests, and hires nobody. Registering one adds inventory that is
 * worse than no inventory, because it looks live.
 */
export const ZOMBIE_BOARD_DAYS = 180;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return (now.getTime() - parsed) / 86_400_000;
}

/**
 * Score a candidate for review priority.
 *
 * Weights follow the audit: Nigeria presence and a direct ATS board matter
 * most, because they are what the product is short of and what the source
 * priority order prefers. Volume is deliberately worth little — one employer
 * with 200 roles is what produced the concentration problem.
 */
export function scoreEmployerCandidate(
  candidate: EmployerCandidate,
  now: Date = new Date(),
): DiscoveryScore {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;

  if (candidate.alreadyRegistered) {
    blockers.push("Already in the source registry.");
  }

  const staleness = daysSince(candidate.latestPostingAt, now);
  if (staleness !== null && staleness > ZOMBIE_BOARD_DAYS) {
    blockers.push(
      `Newest posting is ${Math.round(staleness)} days old; the board is dormant.`,
    );
  }
  if (candidate.observedOpenRoles === 0) {
    blockers.push("Board was probed and has no open roles.");
  }
  if (!candidate.domain && !candidate.atsTenant) {
    blockers.push(
      "No domain and no ATS tenant, so employer identity cannot be resolved deterministically.",
    );
  }

  if (candidate.nigeriaPresence) {
    score += 40;
    reasons.push("Hires in Nigeria (+40)");
  } else if (candidate.africaPresence) {
    score += 20;
    reasons.push("Hires elsewhere in Africa (+20)");
  } else if (candidate.remoteHiringEvidence) {
    score += 12;
    reasons.push("Hires remotely beyond its own country (+12)");
  }

  if (candidate.atsTenant) {
    score += 25;
    reasons.push("Direct ATS board available (+25)");
  } else if (candidate.domain) {
    score += 8;
    reasons.push("Careers domain known, ATS unconfirmed (+8)");
  }

  // Discovery method quality, mirroring the recorded board-discovery order:
  // a careers-page link is evidence, a slug guess is a hypothesis.
  const methodPoints: Record<DiscoveryMethod, number> = {
    careers_page_link: 10,
    employer_submission: 10,
    user_request: 8,
    ats_tenant_probe: 5,
    vendor_sweep: 2,
  };
  score += methodPoints[candidate.discoveredVia];
  reasons.push(
    `Found via ${candidate.discoveredVia.replaceAll("_", " ")} (+${methodPoints[candidate.discoveredVia]})`,
  );

  if (candidate.userRequestCount > 0) {
    const points = Math.min(15, candidate.userRequestCount * 3);
    score += points;
    reasons.push(`${candidate.userRequestCount} user request(s) (+${points})`);
  }

  if (candidate.underrepresentedFunctions.length > 0) {
    const points = Math.min(15, candidate.underrepresentedFunctions.length * 5);
    score += points;
    reasons.push(
      `Adds thin categories: ${candidate.underrepresentedFunctions.join(", ")} (+${points})`,
    );
  }

  // Volume is worth a little, and capped hard. A single huge board is how the
  // current 84.3% concentration happened.
  if (candidate.observedOpenRoles && candidate.observedOpenRoles > 0) {
    const points = Math.min(10, Math.floor(candidate.observedOpenRoles / 5));
    score += points;
    if (points > 0) {
      reasons.push(`${candidate.observedOpenRoles} open roles (+${points})`);
    }
  }

  if (staleness !== null && staleness <= 30) {
    score += 10;
    reasons.push("Posted within the last 30 days (+10)");
  }

  return {
    candidate,
    score,
    reasons,
    blockers,
    reviewable: blockers.length === 0,
  };
}

export interface DiscoveryQueue {
  reviewable: DiscoveryScore[];
  blocked: DiscoveryScore[];
}

/**
 * Build the review queue.
 *
 * Blocked candidates are returned rather than dropped: an operator needs to
 * see that a sweep found forty dormant boards, otherwise the same forty get
 * rediscovered next week.
 */
export function buildDiscoveryQueue(
  candidates: readonly EmployerCandidate[],
  now: Date = new Date(),
): DiscoveryQueue {
  const scored = candidates.map((candidate) =>
    scoreEmployerCandidate(candidate, now),
  );
  return {
    reviewable: scored
      .filter((entry) => entry.reviewable)
      .toSorted((a, b) => b.score - a.score),
    blocked: scored.filter((entry) => !entry.reviewable),
  };
}
