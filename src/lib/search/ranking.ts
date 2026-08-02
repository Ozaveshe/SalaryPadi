/**
 * Job ranking.
 *
 * The previous order was `nigeriaValueTier` then `postedAt` — eligibility
 * bucket, then recency. That makes the newest job in a bucket the best job in
 * that bucket, which is only true by accident. A freshly ingested listing
 * with no salary, an unverified apply link and a vague location outranked a
 * three-week-old role at a verified employer that states its pay.
 *
 * This ranks on the signals a job seeker actually weighs. Every component is
 * bounded and named, so a result order can be explained to the person looking
 * at it and argued with by whoever maintains it.
 */

export type EligibilityState =
  | "nigeria_explicit"
  | "africa_explicit"
  | "global_remote_reviewed"
  | "local_presence_required"
  | "unclear"
  | "not_eligible";

export type SourceAuthority =
  "direct_employer" | "employer_ats" | "licensed_partner" | "secondary_feed";

export type DestinationKind =
  | "direct_employer"
  | "employer_ats"
  | "agency"
  | "email"
  | "external_board"
  | "aggregator";

export interface RankableJob {
  id: string;
  employerKey: string | null;
  /** 0-1 from the text search layer. 1 when no query was supplied. */
  textRelevance: number;
  eligibility: EligibilityState;
  /** Hours since the source last confirmed this job. */
  hoursSinceConfirmed: number | null;
  /** Days since the employer published it. */
  daysSincePosted: number | null;
  sourceAuthority: SourceAuthority;
  applyLinkState: "unchecked" | "healthy" | "broken" | "indeterminate";
  destinationKind: DestinationKind;
  salaryDisclosed: boolean;
  employerVerified: boolean;
  /** True when the job matches the searcher's stated location. */
  locationMatch: boolean;
  /** 0-1 from opted-in personalisation. 0 when personalisation is off. */
  preferenceMatch: number;
  /** Paid placement. Never contributes to the organic score. */
  sponsored?: boolean;
}

export interface RankedJob {
  job: RankableJob;
  score: number;
  /** Every contribution, for explanation and for debugging a bad order. */
  components: Record<string, number>;
}

/**
 * Weights. These are the product's opinion about what matters, expressed as
 * numbers so the opinion is arguable rather than buried.
 *
 * Eligibility is the largest single weight because it is the question the
 * product exists to answer: a perfectly relevant job a Nigerian cannot apply
 * for is worth less than a slightly less relevant one they can.
 */
export const WEIGHTS = {
  textRelevance: 30,
  eligibility: 25,
  freshness: 15,
  sourceReliability: 10,
  applyQuality: 8,
  salaryTransparency: 6,
  locationMatch: 4,
  preference: 12,
} as const;

const ELIGIBILITY_SCORE: Record<EligibilityState, number> = {
  nigeria_explicit: 1,
  africa_explicit: 0.8,
  global_remote_reviewed: 0.6,
  local_presence_required: 0.3,
  // Unclear is deliberately mid-low rather than zero: these are real jobs and
  // burying them entirely would hide work from people who might qualify.
  unclear: 0.25,
  not_eligible: 0,
};

const AUTHORITY_SCORE: Record<SourceAuthority, number> = {
  direct_employer: 1,
  employer_ats: 0.9,
  licensed_partner: 0.6,
  secondary_feed: 0.4,
};

const DESTINATION_SCORE: Record<DestinationKind, number> = {
  direct_employer: 1,
  employer_ats: 0.95,
  agency: 0.6,
  email: 0.5,
  external_board: 0.4,
  aggregator: 0.2,
};

/**
 * Freshness decays over the first month and then flattens.
 *
 * A job confirmed an hour ago and one confirmed six hours ago are equally
 * live to a job seeker, so the curve is deliberately flat at the top; the
 * penalty arrives once a listing is old enough that it might be gone.
 */
export function freshnessScore(
  daysSincePosted: number | null,
  hoursSinceConfirmed: number | null,
): number {
  const posted =
    daysSincePosted === null
      ? 0.5 // Unknown age is neither fresh nor stale.
      : daysSincePosted <= 3
        ? 1
        : daysSincePosted <= 7
          ? 0.9
          : daysSincePosted <= 14
            ? 0.75
            : daysSincePosted <= 30
              ? 0.5
              : daysSincePosted <= 90
                ? 0.25
                : 0.1;

  // Confirmation matters separately: an old posting the source still lists
  // today is more trustworthy than a recent one nobody has re-checked.
  const confirmed =
    hoursSinceConfirmed === null
      ? 0.5
      : hoursSinceConfirmed <= 24
        ? 1
        : hoursSinceConfirmed <= 72
          ? 0.8
          : hoursSinceConfirmed <= 168
            ? 0.5
            : 0.2;

  return posted * 0.6 + confirmed * 0.4;
}

function applyQualityScore(job: RankableJob): number {
  if (job.applyLinkState === "broken") return 0;
  const destination = DESTINATION_SCORE[job.destinationKind];
  const verified = job.applyLinkState === "healthy" ? 1 : 0.7;
  return destination * verified;
}

/**
 * Score one job. Sponsored jobs are scored exactly like organic ones — the
 * flag is carried through untouched so the caller can separate them, and it
 * contributes nothing here. Paid placement must never move an organic score.
 */
export function scoreJob(job: RankableJob): RankedJob {
  const components: Record<string, number> = {
    textRelevance: clamp01(job.textRelevance) * WEIGHTS.textRelevance,
    eligibility: ELIGIBILITY_SCORE[job.eligibility] * WEIGHTS.eligibility,
    freshness:
      freshnessScore(job.daysSincePosted, job.hoursSinceConfirmed) *
      WEIGHTS.freshness,
    sourceReliability:
      AUTHORITY_SCORE[job.sourceAuthority] * WEIGHTS.sourceReliability,
    applyQuality: applyQualityScore(job) * WEIGHTS.applyQuality,
    salaryTransparency: job.salaryDisclosed ? WEIGHTS.salaryTransparency : 0,
    locationMatch: job.locationMatch ? WEIGHTS.locationMatch : 0,
    preference: clamp01(job.preferenceMatch) * WEIGHTS.preference,
  };

  // A verified employer is a small confidence bonus, not a ranking lever;
  // it is folded into source reliability rather than given its own weight so
  // it cannot outrank eligibility.
  if (job.employerVerified) components.sourceReliability *= 1.1;

  const score = Object.values(components).reduce(
    (sum, value) => sum + value,
    0,
  );
  return { job, score, components };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface RankingResult {
  /** Organic results in score order. */
  organic: RankedJob[];
  /** Sponsored results, kept entirely separate. */
  sponsored: RankedJob[];
}

/**
 * Rank a candidate set.
 *
 * Sponsored jobs are partitioned out rather than sorted among the organic
 * results. A caller that wants to show them must place them deliberately and
 * label them; there is no code path that lets a paid job appear as an organic
 * result, because there is no combined list to accidentally render.
 */
export function rankJobs(jobs: readonly RankableJob[]): RankingResult {
  const scored = jobs.map(scoreJob);
  const byScore = (a: RankedJob, b: RankedJob) =>
    b.score - a.score || a.job.id.localeCompare(b.job.id);

  return {
    organic: scored.filter((entry) => !entry.job.sponsored).toSorted(byScore),
    sponsored: scored.filter((entry) => entry.job.sponsored).toSorted(byScore),
  };
}

/**
 * The largest contributors to a job's position, for the "why am I seeing
 * this" explanation. Returns consumer-safe labels, never raw weights.
 */
export function explainRanking(ranked: RankedJob, limit = 3): string[] {
  const labels: Record<string, string> = {
    textRelevance: "Matches your search",
    eligibility: "You can apply from Nigeria",
    freshness: "Recently posted and checked",
    sourceReliability: "From the employer's own listing",
    applyQuality: "Applies directly to the employer",
    salaryTransparency: "Salary is disclosed",
    locationMatch: "Matches your location",
    preference: "Matches your saved preferences",
  };
  return Object.entries(ranked.components)
    .filter(([, value]) => value > 0)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => labels[key] ?? key);
}
