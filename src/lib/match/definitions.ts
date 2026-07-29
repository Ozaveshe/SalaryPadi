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
 * Every dimension compares something the candidate supplied against something
 * the job's own source published.
 *
 * `skills` was excluded for a long time, for a reason that still holds as
 * written: `app.skills` carries no vocabulary, `app.job_skills` is never
 * populated, and the tags the feeds publish are topics rather than
 * employer-stated requirements, so scoring against them would assert a
 * requirement no source ever made.
 *
 * What changed is not that objection but the evidence available. The candidate
 * now supplies a CV, and the posting supplies its own text, so both sides of
 * the comparison are documents the two parties actually wrote. The dimension
 * therefore claims exactly one thing — that both documents name the same terms
 * — and never that the candidate meets a requirement. It scores only when a CV
 * was readable *and* the posting names terms the fixed vocabulary recognises;
 * absent either, it is unknown and drops out of the weighting rather than
 * counting as zero.
 */
export const DIMENSION_DEFINITIONS: Record<
  MatchDimensionCode,
  DimensionDefinition
> = {
  experience_level: { weight: 30, title: "Experience level" },
  skills: { weight: 30, title: "Skills in common" },
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
  "Where you have uploaded a CV, the skills line reports only that your CV and the posting name the same terms. It is not a judgement that you meet the role's requirements, and the terms come from a fixed list, so a skill missing from it is not a comment on you.",
  "Job facts are only as complete as the source that published them. A missing salary, level, or location on the posting lowers coverage rather than the score.",
  "Only an employer can decide whether you meet the requirements for a role.",
];
