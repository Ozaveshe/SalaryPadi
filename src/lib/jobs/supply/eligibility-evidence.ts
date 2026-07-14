import { classifyEligibilityEvidence } from "../eligibility";
import type { EmploymentArrangement } from "../types";

export interface CompleteEligibilityEvidence {
  scope: ReturnType<typeof classifyEligibilityEvidence>["eligibility"]["scope"];
  includedCountryCodes: string[];
  excludedCountryCodes: string[];
  regionWording: string | null;
  timezone: string | null;
  workAuthorization: string | null;
  visaSponsorship: "yes" | "no" | "unclear";
  physicalLocation: string | null;
  arrangement: EmploymentArrangement;
  sourceText: string;
  verifiedAt: string;
}

function evidenceMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0]?.trim().slice(0, 500) ?? null;
}

export function extractCompleteEligibilityEvidence(
  sourceText: string,
  verifiedAt: string,
): CompleteEligibilityEvidence {
  const classified = classifyEligibilityEvidence(sourceText, verifiedAt);
  const regionWording = evidenceMatch(
    sourceText,
    /\b(?:worldwide|global|africa|emea|europe|middle east|latam|apac|americas)\b[^.;\n]*/i,
  );
  const timezone = evidenceMatch(
    sourceText,
    /\b(?:(?:pacific|mountain|central|eastern)\s+(?:standard\s+|daylight\s+)?time|(?:utc|gmt|cet|eet|wet|pst|pdt|mst|mdt|cst|cdt|est|edt|ist|cat|eat|wat|sast)\s*(?:[+-]\s*\d{1,2}(?::\d{2})?)?(?:\s*(?:to|through|-|±)\s*(?:utc|gmt)?\s*[+-]?\s*\d{1,2}(?::\d{2})?)?)\b/i,
  );
  const workAuthorization = evidenceMatch(
    sourceText,
    /\b(?:must|requires?|required to)\b[^.;\n]{0,160}\b(?:work authori[sz]ation|right to work|authorized to work)\b[^.;\n]*/i,
  );
  const noVisa =
    /\b(?:no|without|not offer(?:ing)?)\b[^.;\n]{0,80}\bvisa sponsorship\b/i.test(
      sourceText,
    );
  const yesVisa =
    /\b(?:visa sponsorship (?:is )?(?:available|provided|offered)|we sponsor visas?)\b/i.test(
      sourceText,
    );
  const physicalLocation = evidenceMatch(
    sourceText,
    /\b(?:must|need to|required to)\b[^.;\n]{0,120}\b(?:live|reside|be based|located|work from)\b[^.;\n]*/i,
  );
  const contractor =
    /\b(?:independent contractor|contractor arrangement|b2b contract)\b/i.test(
      sourceText,
    );
  const freelance = /\bfreelanc(?:e|er)\b/i.test(sourceText);
  const employee = /\b(?:employee|employment contract|payroll)\b/i.test(
    sourceText,
  );

  return {
    scope: classified.eligibility.scope,
    includedCountryCodes: classified.includedCountryCodes,
    excludedCountryCodes: classified.excludedCountryCodes,
    regionWording,
    timezone,
    workAuthorization,
    visaSponsorship: noVisa ? "no" : yesVisa ? "yes" : "unclear",
    physicalLocation,
    arrangement: contractor
      ? "contractor"
      : freelance
        ? "freelance"
        : employee
          ? "employee"
          : "unknown",
    sourceText,
    verifiedAt,
  };
}
