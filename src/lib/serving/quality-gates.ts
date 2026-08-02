/**
 * Publication quality gates.
 *
 * Every gate answers one question, and a job enters the public projection
 * only when all of them pass. They are evaluated in a fixed order so a
 * rejection reason is always the *first* thing wrong rather than whichever
 * check happened to run first.
 *
 * The gates exist because inventory growth is the easiest thing to fake. A
 * job count rises just as readily from stale, duplicated and un-appliable
 * listings as from real ones, and the difference is invisible in the number.
 * These are what make the number mean something.
 */

import { mayPublishUnderRights } from "@/lib/canonical/source-rights";

export const QUALITY_GATES = [
  "source_rights",
  "employer_identity",
  "job_identity",
  "application_destination",
  "freshness",
  "minimum_content",
  "location_representation",
  "eligibility_representation",
  "non_duplication",
  "safety",
] as const;

export type QualityGate = (typeof QUALITY_GATES)[number];

export type EligibilityRepresentation =
  | "nigeria_eligible"
  | "africa_eligible"
  | "global_remote"
  | "unclear"
  | "not_stated"
  | "excluded";

export interface JobCandidate {
  rightsClassification: string | null;
  employerId: string | null;
  canonicalJobId: string | null;
  /** Resolved apply destination, already classified. */
  applicationUrl: string | null;
  applyLinkState?: "unchecked" | "healthy" | "broken" | "indeterminate";
  /** Last time a complete source snapshot confirmed this job. */
  lastConfirmedAt: string | null;
  /** Source-specific window, in hours, before confirmation goes stale. */
  freshnessWindowHours: number;
  descriptionLength: number;
  title: string;
  hasLocationEvidence: boolean;
  eligibility: EligibilityRepresentation;
  /** Set when this job was folded into another canonical record. */
  duplicateOfJobId?: string | null;
  /** Raised by scam/risk screening. */
  safetyFlags?: readonly string[];
}

export interface GateFailure {
  gate: QualityGate;
  reason: string;
}

export type GateOutcome =
  | { publishable: true; eligibilityCollection: EligibilityCollection }
  | { publishable: false; failure: GateFailure };

/**
 * Which collection a published job may appear in.
 *
 * A job with unclear eligibility is publishable — withholding it would hide
 * real work from people — but it is never promoted into a Nigeria-eligible
 * collection, because appearing there is itself a claim that the person can
 * apply.
 */
export type EligibilityCollection =
  "nigeria_eligible" | "africa_eligible" | "global_remote" | "unclear_only";

/** The minimum body text that makes a job page worth showing at all. */
export const MINIMUM_DESCRIPTION_LENGTH = 140;

/** Titles this short carry no information about the role. */
export const MINIMUM_TITLE_LENGTH = 3;

function hoursSince(iso: string, now: Date): number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - parsed) / 3_600_000;
}

export function evaluateQualityGates(
  candidate: JobCandidate,
  now: Date = new Date(),
): GateOutcome {
  const fail = (gate: QualityGate, reason: string): GateOutcome => ({
    publishable: false,
    failure: { gate, reason },
  });

  // 1. Rights. Nothing else matters if we may not publish it at all.
  if (!mayPublishUnderRights(candidate.rightsClassification)) {
    return fail(
      "source_rights",
      "The source's recorded rights do not permit publication.",
    );
  }

  // 2. Employer identity. An unattributed job cannot be researched, and a
  //    wrongly attributed one is worse than none.
  if (!candidate.employerId) {
    return fail(
      "employer_identity",
      "No canonical employer resolved for this job.",
    );
  }

  // 3. Job identity.
  if (!candidate.canonicalJobId) {
    return fail("job_identity", "No canonical job identity assigned.");
  }

  // 4. Application destination. A job nobody can apply to is not a job.
  if (!candidate.applicationUrl) {
    return fail("application_destination", "No application destination.");
  }
  if (candidate.applyLinkState === "broken") {
    return fail(
      "application_destination",
      "The application destination failed its last check.",
    );
  }

  // 5. Freshness, against the source's own window rather than a global one.
  if (!candidate.lastConfirmedAt) {
    return fail("freshness", "Never confirmed by a complete source snapshot.");
  }
  if (
    hoursSince(candidate.lastConfirmedAt, now) > candidate.freshnessWindowHours
  ) {
    return fail(
      "freshness",
      "Not confirmed within this source's freshness window.",
    );
  }

  // 6. Minimum content.
  if (candidate.title.trim().length < MINIMUM_TITLE_LENGTH) {
    return fail("minimum_content", "Title is too short to describe a role.");
  }
  if (candidate.descriptionLength < MINIMUM_DESCRIPTION_LENGTH) {
    return fail(
      "minimum_content",
      "Description is too thin to be worth a page.",
    );
  }

  // 7. Location representation.
  if (!candidate.hasLocationEvidence) {
    return fail(
      "location_representation",
      "No location evidence, so where the role is cannot be stated honestly.",
    );
  }

  // 8. Eligibility representation. An explicit exclusion is withheld: showing
  //    a Nigerian job seeker a role that names Nigeria as ineligible wastes
  //    their time by design.
  if (candidate.eligibility === "excluded") {
    return fail(
      "eligibility_representation",
      "The posting explicitly excludes Nigeria.",
    );
  }
  if (candidate.eligibility === "not_stated") {
    return fail(
      "eligibility_representation",
      "No eligibility evidence at all; nothing honest can be shown.",
    );
  }

  // 9. Non-duplication.
  if (candidate.duplicateOfJobId) {
    return fail(
      "non_duplication",
      "Already represented by another canonical job.",
    );
  }

  // 10. Safety.
  if (candidate.safetyFlags && candidate.safetyFlags.length > 0) {
    return fail(
      "safety",
      `Held by safety screening: ${candidate.safetyFlags.join(", ")}.`,
    );
  }

  return {
    publishable: true,
    eligibilityCollection: collectionFor(candidate.eligibility),
  };
}

function collectionFor(
  eligibility: EligibilityRepresentation,
): EligibilityCollection {
  switch (eligibility) {
    case "nigeria_eligible":
      return "nigeria_eligible";
    case "africa_eligible":
      return "africa_eligible";
    case "global_remote":
      return "global_remote";
    default:
      // Unclear is publishable but never promoted.
      return "unclear_only";
  }
}

/**
 * Whether a job may appear in a Nigeria-eligible collection.
 *
 * Kept separate from the gate result so callers cannot accidentally treat
 * "publishable" as "promotable" — they are different permissions.
 */
export function mayEnterNigeriaCollection(outcome: GateOutcome): boolean {
  return (
    outcome.publishable && outcome.eligibilityCollection === "nigeria_eligible"
  );
}

export interface GateReport {
  evaluated: number;
  published: number;
  rejectedByGate: Record<string, number>;
}

/** Aggregate outcomes so the operational dashboard can show where jobs die. */
export function summariseGateOutcomes(
  outcomes: readonly GateOutcome[],
): GateReport {
  const rejectedByGate: Record<string, number> = {};
  let published = 0;
  for (const outcome of outcomes) {
    if (outcome.publishable) {
      published += 1;
      continue;
    }
    const gate = outcome.failure.gate;
    rejectedByGate[gate] = (rejectedByGate[gate] ?? 0) + 1;
  }
  return { evaluated: outcomes.length, published, rejectedByGate };
}
