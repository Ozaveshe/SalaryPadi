import {
  DIMENSION_DEFINITIONS,
  EXPERIENCE_LADDER,
  MATCH_LIMITATIONS,
  MINIMUM_COVERAGE,
  TIER_THRESHOLDS,
} from "./definitions";
import type {
  CandidateProfile,
  ExperienceLevel,
  JobFacts,
  MatchDimension,
  MatchDimensionCode,
  MatchResult,
  MatchTier,
  WorkArrangement,
} from "./types";

function scored(
  code: MatchDimensionCode,
  score: number,
  explanation: string,
): MatchDimension {
  const definition = DIMENSION_DEFINITIONS[code];
  return {
    code,
    state: "scored",
    score: Math.min(1, Math.max(0, score)),
    weight: definition.weight,
    title: definition.title,
    explanation,
  };
}

function unknown(
  code: MatchDimensionCode,
  explanation: string,
): MatchDimension {
  const definition = DIMENSION_DEFINITIONS[code];
  return {
    code,
    state: "unknown",
    score: 0,
    weight: definition.weight,
    title: definition.title,
    explanation,
  };
}

function ladderIndex(level: ExperienceLevel): number | null {
  const index = EXPERIENCE_LADDER.indexOf(
    level as Exclude<ExperienceLevel, "unspecified">,
  );
  return index === -1 ? null : index;
}

function scoreExperienceLevel(
  candidate: CandidateProfile,
  job: JobFacts,
): MatchDimension {
  const jobIndex = ladderIndex(job.experienceLevel);
  const candidateIndex = ladderIndex(candidate.experienceLevel);

  if (jobIndex === null) {
    return unknown(
      "experience_level",
      "This posting did not state an experience level.",
    );
  }
  if (candidateIndex === null) {
    return unknown(
      "experience_level",
      "You have not set an experience level on your profile.",
    );
  }

  const distance = Math.abs(candidateIndex - jobIndex);
  if (distance === 0) {
    return scored(
      "experience_level",
      1,
      `The posting asks for ${job.experienceLevel} and you attested ${candidate.experienceLevel}.`,
    );
  }

  // Sitting above the posting's level is a weaker signal against a match than
  // sitting below it, so it decays more gently and never reaches zero.
  if (candidateIndex > jobIndex) {
    return scored(
      "experience_level",
      Math.max(0.7, 1 - 0.15 * distance),
      `You attested ${candidate.experienceLevel}; the posting asks for ${job.experienceLevel}. The employer decides whether more experience counts against a role.`,
    );
  }

  return scored(
    "experience_level",
    Math.max(0, 1 - 0.35 * distance),
    `The posting asks for ${job.experienceLevel} and you attested ${candidate.experienceLevel}.`,
  );
}

const ARRANGEMENT_FIT: Record<
  Exclude<WorkArrangement, "unspecified">,
  Record<Exclude<WorkArrangement, "unspecified">, number>
> = {
  // Row: what the candidate wants. Column: what the job offers.
  remote: { remote: 1, hybrid: 0.5, onsite: 0 },
  hybrid: { remote: 0.8, hybrid: 1, onsite: 0.5 },
  onsite: { remote: 0.4, hybrid: 0.8, onsite: 1 },
};

function scoreWorkArrangement(
  candidate: CandidateProfile,
  job: JobFacts,
): MatchDimension {
  if (job.workArrangement === "unspecified") {
    return unknown(
      "work_arrangement",
      "This posting did not state a work arrangement.",
    );
  }
  if (candidate.desiredWorkArrangement === "unspecified") {
    return unknown(
      "work_arrangement",
      "You have not set a preferred work arrangement on your profile.",
    );
  }

  return scored(
    "work_arrangement",
    ARRANGEMENT_FIT[candidate.desiredWorkArrangement][job.workArrangement],
    `You prefer ${candidate.desiredWorkArrangement} work and this role is ${job.workArrangement}.`,
  );
}

function outOfReach(
  candidate: CandidateProfile,
  reason: string,
): MatchDimension {
  // Relocation is the candidate's own stated flexibility, so it softens a miss
  // rather than erasing it — the posting still says who it can hire.
  if (candidate.openToRelocation) {
    return scored(
      "location",
      0.5,
      `${reason} You marked yourself open to relocation, so check the posting for who it can actually hire.`,
    );
  }
  return scored("location", 0, reason);
}

function scoreLocation(
  candidate: CandidateProfile,
  job: JobFacts,
): MatchDimension {
  const country = candidate.locationCountry;
  if (!country) {
    return unknown("location", "You have not set a location on your profile.");
  }

  const { worldwide, nigeria, includedCountries, excludedCountries } =
    job.eligibility;

  // An explicit exclusion is the strongest published statement there is, so it
  // outranks every broader permission below it.
  if (excludedCountries.includes(country)) {
    return outOfReach(
      candidate,
      `This role's published eligibility excludes ${country}.`,
    );
  }

  if (includedCountries.includes(country)) {
    return scored(
      "location",
      1,
      `This role's published eligibility includes ${country}.`,
    );
  }

  if (country === "NG" && nigeria === "eligible") {
    return scored("location", 1, "This role is published as Nigeria eligible.");
  }
  if (country === "NG" && nigeria === "not_eligible") {
    return outOfReach(
      candidate,
      "This role is published as not open to Nigeria.",
    );
  }

  if (worldwide) {
    return scored(
      "location",
      1,
      `This role is published as open worldwide, which includes ${country}.`,
    );
  }

  if (includedCountries.length > 0) {
    return outOfReach(
      candidate,
      `This role's published eligibility does not include ${country}.`,
    );
  }

  // A regional scope with no country list ("africa", "emea", "restricted
  // region") cannot be resolved to a country without inventing a mapping the
  // source never published.
  return unknown(
    "location",
    "This posting did not publish country eligibility rules precise enough to compare.",
  );
}

function scoreCompensation(
  candidate: CandidateProfile,
  job: JobFacts,
): MatchDimension {
  const jobPay = job.salaryMax ?? job.salaryMin;
  const wanted = candidate.desiredSalaryMin ?? candidate.desiredSalaryMax;

  if (jobPay === undefined || !job.currencyCode || !job.payPeriod) {
    return unknown(
      "compensation",
      "This posting did not publish a comparable salary.",
    );
  }
  if (
    wanted === undefined ||
    !candidate.desiredCurrencyCode ||
    !candidate.desiredPayPeriod
  ) {
    return unknown(
      "compensation",
      "You have not set a pay expectation on your profile.",
    );
  }

  // No conversion happens here. Comparing across currencies or pay periods would
  // mean inventing a rate inside a pure function, so mismatches stay unknown.
  if (job.currencyCode !== candidate.desiredCurrencyCode) {
    return unknown(
      "compensation",
      `This role is quoted in ${job.currencyCode} and your expectation is in ${candidate.desiredCurrencyCode}. Pay was not compared across currencies.`,
    );
  }
  if (job.payPeriod !== candidate.desiredPayPeriod) {
    return unknown(
      "compensation",
      `This role is quoted per ${job.payPeriod} and your expectation is per ${candidate.desiredPayPeriod}. Pay was not compared across periods.`,
    );
  }

  if (jobPay >= wanted) {
    return scored(
      "compensation",
      1,
      `The published pay reaches your stated expectation of ${wanted} ${candidate.desiredCurrencyCode} per ${candidate.desiredPayPeriod}.`,
    );
  }

  const shortfall = (wanted - jobPay) / wanted;
  return scored(
    "compensation",
    Math.max(0, 1 - shortfall * 2),
    `The published pay is below your stated expectation of ${wanted} ${candidate.desiredCurrencyCode} per ${candidate.desiredPayPeriod}.`,
  );
}

function tierDetails(
  score: number | null,
  coverage: number,
): { tier: MatchTier; label: string; summary: string } {
  if (score === null || coverage < MINIMUM_COVERAGE) {
    return {
      tier: "insufficient_data",
      label: "Not enough information",
      summary:
        "Too little is known about you, this posting, or both to compare them fairly. Adding the missing details below will produce a fuller comparison.",
    };
  }
  if (score >= TIER_THRESHOLDS.strong) {
    return {
      tier: "strong_match",
      label: "Strong match on what you attested",
      summary:
        "What you attested lines up closely with what this posting published. Only the employer decides whether you meet the role's requirements.",
    };
  }
  if (score >= TIER_THRESHOLDS.possible) {
    return {
      tier: "possible_match",
      label: "Possible match",
      summary:
        "Some of what you attested lines up with this posting and some does not. The breakdown below shows which is which.",
    };
  }
  return {
    tier: "limited_match",
    label: "Limited match on what you attested",
    summary:
      "What you attested differs from this posting on most points that could be compared. That is not a judgement of your suitability.",
  };
}

/**
 * Compares a candidate's attested profile against a job's published facts.
 *
 * Pure and deterministic by design: the same inputs always produce the same
 * score and the same explanation, and every dimension states its own reasoning
 * so a candidate can see exactly why a number came out the way it did. No claim
 * is inferred about the candidate that they did not attest themselves.
 */
export function scoreJobMatch(
  candidate: CandidateProfile,
  job: JobFacts,
): MatchResult {
  const dimensions: MatchDimension[] = [
    scoreExperienceLevel(candidate, job),
    scoreWorkArrangement(candidate, job),
    scoreLocation(candidate, job),
    scoreCompensation(candidate, job),
  ];

  const scoredDimensions = dimensions.filter(
    (dimension) => dimension.state === "scored",
  );
  const scoredWeight = scoredDimensions.reduce(
    (total, dimension) => total + dimension.weight,
    0,
  );
  const totalWeight = dimensions.reduce(
    (total, dimension) => total + dimension.weight,
    0,
  );

  const score =
    scoredWeight === 0
      ? null
      : Math.round(
          (scoredDimensions.reduce(
            (total, dimension) => total + dimension.score * dimension.weight,
            0,
          ) /
            scoredWeight) *
            100,
        );

  const coverage = totalWeight === 0 ? 0 : scoredWeight / totalWeight;
  const { tier, label, summary } = tierDetails(score, coverage);

  return {
    tier,
    label,
    summary,
    score,
    dimensions,
    coverage,
    improveCoverage: dimensions
      .filter((dimension) => dimension.state === "unknown")
      .map((dimension) => dimension.explanation),
    limitations: [...MATCH_LIMITATIONS],
  };
}
