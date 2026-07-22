import {
  classifyEligibilityEvidence,
  isAfricanCountryCode,
} from "../eligibility";
import type { EmploymentArrangement } from "../types";
import { extractCompleteEligibilityEvidence } from "./eligibility-evidence";

export type RemotePublicationRejection =
  | "not_remote"
  | "geography_restricted"
  | "eligibility_unclear"
  | "work_authorization_restricted";

export type RemotePublicationDecision =
  | {
      eligible: true;
      reason:
        "worldwide" | "africa" | "emea" | "nigeria" | "named_african_country";
      evidenceText: string;
    }
  | {
      eligible: false;
      reason: RemotePublicationRejection;
      evidenceText: string;
    };

const eligibilitySentencePattern =
  /\b(?:worldwide|anywhere|global remote|remote globally)\b|\b(?:candidates?|applicants?|role|position|job|we)\b[^.!?\n]{0,180}\b(?:open to|hiring|hire|based|located|reside|work from|available in|remote in|eligible|time\s?zone|work authori[sz]ation|right to work)\b|\b(?:must|required|need)\b[^.!?\n]{0,180}\b(?:based|located|reside|work from|work authori[sz]ation|right to work|time\s?zone)\b/i;

function boundedSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => eligibilitySentencePattern.test(sentence))
    .slice(0, 8)
    .map((sentence) => sentence.slice(0, 500));
}

/**
 * Location is always source evidence. Description text contributes only
 * sentences that look like candidate-location or work-authorization rules,
 * so phrases such as "customers across Africa" cannot make a role eligible.
 */
export function remoteEligibilityEvidence(
  location: string | null,
  description: string,
) {
  const evidence = [location?.trim(), ...boundedSentences(description)].filter(
    (value): value is string => Boolean(value),
  );
  return evidence.join(". ").slice(0, 2_000) || "Not stated by the source";
}

export function inferRemoteArrangement(
  workplaceType: string | null,
  location: string | null,
  description: string,
): "remote" | "hybrid" | "onsite" | "unspecified" {
  const declared = workplaceType?.toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  if (declared === "hybrid") return "hybrid";
  if (declared === "onsite") return "onsite";
  if (declared === "remote") return "remote";

  const evidence = `${location ?? ""}. ${boundedSentences(description).join(" ")}`;
  if (/\b(?:hybrid|on[ -]?site|office[ -]?based)\b/i.test(evidence)) {
    return /\bhybrid\b/i.test(evidence) ? "hybrid" : "onsite";
  }
  if (/\b(?:remote|home[ -]?based|work from (?:anywhere|home))\b/i.test(evidence)) {
    return "remote";
  }
  return "unspecified";
}

function hasDisqualifyingWorkAuthorization(
  value: string | null,
  verifiedAt: string,
  publication: ReturnType<typeof classifyEligibilityEvidence>,
) {
  if (!value) return false;
  if (
    /\b(?:country (?:where|in which) you (?:live|reside)|your country of residence)\b/i.test(
      value,
    )
  ) {
    return false;
  }

  const authorization = classifyEligibilityEvidence(value, verifiedAt);
  if (authorization.includedCountryCodes.length > 0) {
    const authorizedAfricanCodes =
      authorization.includedCountryCodes.filter(isAfricanCountryCode);
    if (authorizedAfricanCodes.length === 0) return true;
    if (publication.eligibility.scope === "nigeria") {
      return !authorizedAfricanCodes.includes("NG");
    }
    if (publication.eligibility.scope === "named_countries") {
      return !authorizedAfricanCodes.some((code) =>
        publication.includedCountryCodes.includes(code),
      );
    }
    return false;
  }

  return !["worldwide", "africa", "emea", "nigeria"].includes(
    authorization.eligibility.scope,
  );
}

/**
 * Onsite, hybrid, and unspecified-arrangement roles are publishable when the
 * source's stated location resolves to a named African country: the workplace
 * itself is the eligibility evidence. Roles whose location cannot be resolved
 * to an African country stay filtered rather than guessed at.
 */
export function evaluateLocalPublication(input: {
  evidenceText: string;
  verifiedAt: string;
}): RemotePublicationDecision {
  const classification = classifyEligibilityEvidence(
    input.evidenceText,
    input.verifiedAt,
  );
  if (classification.eligibility.scope === "nigeria") {
    return {
      eligible: true,
      reason: "nigeria",
      evidenceText: input.evidenceText,
    };
  }
  if (classification.includedCountryCodes.some(isAfricanCountryCode)) {
    return {
      eligible: true,
      reason: "named_african_country",
      evidenceText: input.evidenceText,
    };
  }
  return {
    eligible: false,
    reason: "geography_restricted",
    evidenceText: input.evidenceText,
  };
}

export function evaluateRemotePublication(input: {
  arrangement:
    | EmploymentArrangement
    | "remote"
    | "hybrid"
    | "onsite"
    | "unspecified"
    | "unclear";
  evidenceText: string;
  verifiedAt: string;
  workAuthorization?: string | null;
}): RemotePublicationDecision {
  if (input.arrangement !== "remote") {
    return {
      eligible: false,
      reason: "not_remote",
      evidenceText: input.evidenceText,
    };
  }

  const classification = classifyEligibilityEvidence(
    input.evidenceText,
    input.verifiedAt,
  );
  const complete = extractCompleteEligibilityEvidence(
    input.evidenceText,
    input.verifiedAt,
  );
  if (
    hasDisqualifyingWorkAuthorization(
      input.workAuthorization ?? complete.workAuthorization,
      input.verifiedAt,
      classification,
    )
  ) {
    return {
      eligible: false,
      reason: "work_authorization_restricted",
      evidenceText: input.evidenceText,
    };
  }

  switch (classification.eligibility.scope) {
    case "worldwide":
    case "africa":
    case "emea":
    case "nigeria":
      return {
        eligible: true,
        reason: classification.eligibility.scope,
        evidenceText: input.evidenceText,
      };
    case "named_countries":
      return classification.includedCountryCodes.some(isAfricanCountryCode)
        ? {
            eligible: true,
            reason: "named_african_country",
            evidenceText: input.evidenceText,
          }
        : {
            eligible: false,
            reason: "geography_restricted",
            evidenceText: input.evidenceText,
          };
    case "restricted_region":
      return {
        eligible: false,
        reason: "geography_restricted",
        evidenceText: input.evidenceText,
      };
    case "unclear":
      return {
        eligible: false,
        reason: "eligibility_unclear",
        evidenceText: input.evidenceText,
      };
  }
}
