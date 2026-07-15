export type MatchDimensionCode =
  "experience_level" | "work_arrangement" | "location" | "compensation";

/**
 * `scored` dimensions contributed to the overall score. `unknown` dimensions had
 * no usable data on one or both sides and are excluded from the weighting rather
 * than counted as zero — a candidate is never penalised for what they have not
 * told us, and a job is never penalised for what its source did not publish.
 */
export type MatchDimensionState = "scored" | "unknown";

export type MatchTier =
  "strong_match" | "possible_match" | "limited_match" | "insufficient_data";

export type ExperienceLevel =
  "entry" | "junior" | "mid" | "senior" | "lead" | "executive" | "unspecified";

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unspecified";

export type PayPeriod = "hourly" | "daily" | "weekly" | "monthly" | "annual";

export interface CandidateProfile {
  experienceLevel: ExperienceLevel;
  desiredWorkArrangement: WorkArrangement;
  desiredSalaryMin?: number;
  desiredSalaryMax?: number;
  desiredCurrencyCode?: string;
  desiredPayPeriod?: PayPeriod;
  locationCountry?: string;
  openToRelocation: boolean;
}

export type EligibilityDecision = "eligible" | "not_eligible" | "unclear";

/**
 * A job's published hiring reach. A source that states "worldwide" names no
 * countries at all, so a plain country list would read as "nothing known" for
 * most remote supply — the shape has to carry the difference between "open to
 * everyone", "open to these countries", and "the source did not say".
 */
export interface JobEligibilityFacts {
  worldwide: boolean;
  /** The launch market is published as its own decision, not as a list entry. */
  nigeria: EligibilityDecision;
  includedCountries: readonly string[];
  excludedCountries: readonly string[];
}

export interface JobFacts {
  experienceLevel: ExperienceLevel;
  workArrangement: WorkArrangement;
  salaryMin?: number;
  salaryMax?: number;
  currencyCode?: string;
  payPeriod?: PayPeriod;
  eligibility: JobEligibilityFacts;
}

export interface MatchDimension {
  code: MatchDimensionCode;
  state: MatchDimensionState;
  /** Normalised 0..1 contribution. Always 0 when `state` is "unknown". */
  score: number;
  weight: number;
  title: string;
  /** Plain-language reason for this dimension's outcome, shown to the user. */
  explanation: string;
}

export interface MatchResult {
  tier: MatchTier;
  label: string;
  summary: string;
  /** 0..100, computed only across scored dimensions. Null when none scored. */
  score: number | null;
  dimensions: MatchDimension[];
  /** Share of total dimension weight that had usable data on both sides. */
  coverage: number;
  /** What the candidate could supply to make the score more complete. */
  improveCoverage: string[];
  limitations: string[];
}
