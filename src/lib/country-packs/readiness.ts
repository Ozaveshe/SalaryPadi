import type { CountryPack } from "./registry";

export const COUNTRY_PACK_REVIEW_GATES = [
  "local_eligibility_accuracy",
  "localized_content_quality",
  "moderation_privacy_takedown",
  "seo_canonical_hreflang",
] as const;

export type CountryPackReviewGate = (typeof COUNTRY_PACK_REVIEW_GATES)[number];

export interface CountryPackReadinessEvidence {
  authorizedActiveJobs: number;
  authorizedSources: number;
  explicitEligibilityRatio: number;
  uniqueContentPages: number;
  firstPartyContributions: number;
  reviewedTaxRules: number;
  reviewedEmploymentRules: number;
  reviewGates: Partial<Record<CountryPackReviewGate, boolean>>;
}

export interface CountryPackReadinessDecision {
  ready: boolean;
  blockers: string[];
}

export function evaluateCountryPackReadiness(
  pack: CountryPack,
  evidence: CountryPackReadinessEvidence,
): CountryPackReadinessDecision {
  const blockers: string[] = [];
  const integerEvidence = [
    evidence.authorizedActiveJobs,
    evidence.authorizedSources,
    evidence.uniqueContentPages,
    evidence.firstPartyContributions,
    evidence.reviewedTaxRules,
    evidence.reviewedEmploymentRules,
  ];
  if (
    integerEvidence.some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    !Number.isFinite(evidence.explicitEligibilityRatio) ||
    evidence.explicitEligibilityRatio < 0 ||
    evidence.explicitEligibilityRatio > 1 ||
    !evidence.reviewGates ||
    typeof evidence.reviewGates !== "object"
  ) {
    return { ready: false, blockers: ["invalid_readiness_evidence"] };
  }
  const thresholds = pack.activation.thresholds;
  if (evidence.authorizedActiveJobs < thresholds.authorizedActiveJobs) {
    blockers.push("authorized_job_supply");
  }
  if (evidence.authorizedSources < thresholds.authorizedSources) {
    blockers.push("source_diversity");
  }
  if (evidence.explicitEligibilityRatio < thresholds.explicitEligibilityRatio) {
    blockers.push("local_eligibility_accuracy");
  }
  if (evidence.reviewedTaxRules < 1 || evidence.reviewedEmploymentRules < 1) {
    blockers.push("reviewed_statutory_rules");
  }
  if (evidence.uniqueContentPages < thresholds.uniqueContentPages) {
    blockers.push("unique_localized_content");
  }
  if (evidence.firstPartyContributions < thresholds.firstPartyContributions) {
    blockers.push("first_party_data");
  }
  for (const gate of COUNTRY_PACK_REVIEW_GATES) {
    if (evidence.reviewGates[gate] !== true) blockers.push(gate);
  }
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}
