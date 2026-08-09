/**
 * Adapts a public `Job` into the ranking engine's input.
 *
 * Kept separate from `ranking.ts` so the scoring rules stay testable without
 * a Job fixture, and separate from `search.ts` so the mapping decisions —
 * which are judgement calls about evidence, not about scoring — are visible
 * in one place.
 */

import { classifyDestination } from "@/lib/canonical/application-destination";
import { nigeriaEligibilityBasis } from "@/lib/jobs/eligibility";
import type { Job } from "@/lib/jobs/types";

import type { EligibilityState, RankableJob, SourceAuthority } from "./ranking";

/**
 * Map the stored eligibility evidence onto the ranking taxonomy.
 *
 * Deliberately conservative at every step: anything that does not resolve to
 * an explicit statement lands on `unclear`, never on a more favourable state.
 * A ranking engine must not be the place where eligibility quietly improves.
 */
export function eligibilityStateFor(job: Job): EligibilityState {
  const { nigeria, africa } = job.eligibility;

  // `nigeria === "not_eligible"` is authoritative: the classifier sets it
  // whenever the evidence excludes Nigeria — by name, or via a named-country
  // list that omits it. An earlier guard here also tested
  // `excludedCountries.includes("NG")`, but `excludedCountries` holds display
  // names ("Nigeria"), so comparing them to the code "NG" never matched. The
  // axis check already covers every exclusion path, so the dead clause is gone.
  if (nigeria === "not_eligible") {
    return "not_eligible";
  }
  // The bare `nigeria` axis answers "may a Nigerian apply"; the ranking
  // ladder distinguishes *why*. Mapping every eligible job to
  // `nigeria_explicit` gave "work from anywhere" wording the same score as a
  // role that named Nigeria, and left the two weaker rungs unreachable.
  switch (nigeriaEligibilityBasis(job.eligibility)) {
    case "explicit":
      return "nigeria_explicit";
    case "africa_wide":
      return "africa_explicit";
    case "worldwide_reviewed":
      return "global_remote_reviewed";
    case null:
      break;
  }
  // EMEA scope: Africa is inside the stated region while Nigeria itself
  // stays unconfirmed.
  if (africa === "eligible") return "africa_explicit";

  if (job.workMode === "onsite") return "local_presence_required";

  return "unclear";
}

/**
 * Source authority from the reviewed source policy.
 *
 * `manual` means an employer submitted the role to SalaryPadi directly under
 * its own attestation, which is the closest relationship we have.
 */
export function sourceAuthorityFor(job: Job): SourceAuthority {
  switch (job.source.type) {
    case "manual":
      return "direct_employer";
    case "employer":
      return "employer_ats";
    case "partner":
      return "licensed_partner";
    default:
      return "secondary_feed";
  }
}

function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return (now.getTime() - parsed) / 3_600_000;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  const hours = hoursSince(iso, now);
  return hours === null ? null : hours / 24;
}

export interface RankAdapterContext {
  /** 0-1 text relevance from the existing lexical scorer. 1 when no query. */
  textRelevance: number;
  /** Verified employer domains, for direct-destination classification. */
  employerDomains?: readonly string[];
  locationMatch?: boolean;
  preferenceMatch?: number;
  now?: Date;
}

export function toRankableJob(
  job: Job,
  context: RankAdapterContext,
): RankableJob {
  const now = context.now ?? new Date();
  const destination = classifyDestination(
    job.applicationUrl,
    context.employerDomains ?? [],
  );

  return {
    id: job.id,
    employerKey: job.company.slug ?? job.company.name,
    textRelevance: context.textRelevance,
    eligibility: eligibilityStateFor(job),
    hoursSinceConfirmed: hoursSince(job.lastCheckedAt, now),
    daysSincePosted: daysSince(job.postedAt, now),
    sourceAuthority: sourceAuthorityFor(job),
    // The public Job carries no link-health field, so an unchecked link is
    // reported as unchecked rather than assumed healthy. Assuming health
    // would let a dead link rank as though it had been verified.
    applyLinkState: "unchecked",
    destinationKind: destination.kind,
    salaryDisclosed: job.salary !== null,
    employerVerified: false,
    locationMatch: context.locationMatch ?? false,
    preferenceMatch: context.preferenceMatch ?? 0,
  };
}
