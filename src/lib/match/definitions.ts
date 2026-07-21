import type { ExperienceLevel, MatchDimensionCode } from "./types";

interface DimensionDefinition {
  weight: number;
  title: string;
}

/**
 * Weights are relative, not percentages: the overall score divides by the total
 * weight of the dimensions that were actually scored, so removing a dimension
 * for lack of data does not distort the ones that remain.
 *
 * Skills are not a dimension. `app.skills` carries no vocabulary and
 * `app.job_skills` is never populated, and the tags the feeds do publish are
 * topics rather than employer-stated requirements — scoring against them would
 * assert a requirement no source ever made. Every dimension below compares a
 * claim the candidate attested against a fact the job's source published.
 */
export const DIMENSION_DEFINITIONS: Record<
  MatchDimensionCode,
  DimensionDefinition
> = {
  experience_level: { weight: 30, title: "Experience level" },
  work_arrangement: { weight: 25, title: "Work arrangement" },
  location: { weight: 25, title: "Location eligibility" },
  compensation: { weight: 20, title: "Pay expectation" },
};

/**
 * Ordinal ladder used for distance comparisons. "unspecified" is deliberately
 * absent: it is missing data, not a rung on the ladder.
 */
export const EXPERIENCE_LADDER: readonly Exclude<
  ExperienceLevel,
  "unspecified"
>[] = ["entry", "junior", "mid", "senior", "lead", "executive"];

export const TIER_THRESHOLDS = {
  strong: 75,
  possible: 50,
} as const;

/**
 * Below this share of total dimension weight the score is too thin to report as
 * a match quality, and we report insufficient data instead.
 */
export const MINIMUM_COVERAGE = 0.4;

export const MATCH_LIMITATIONS: readonly string[] = [
  "This score compares what you attested about yourself against what the job's source published. It is not an assessment of your suitability and it is not a prediction of whether you will be hired.",
  "It does not compare skills. Your match is based on experience level, work arrangement, location eligibility, and pay.",
  "Job facts are only as complete as the source that published them. A missing salary, level, or location on the posting lowers coverage rather than the score.",
  "Only an employer can decide whether you meet the requirements for a role.",
];
