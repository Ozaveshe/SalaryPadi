import {
  countryCodeFromReference,
  countryNameFromCode,
  isAfricanCountryCode,
} from "./eligibility";
import type { EligibilityDecision, RemoteEligibilityScope } from "./types";

export interface CountryEligibilityEvidence {
  scope: RemoteEligibilityScope;
  includedCountries: readonly string[];
  excludedCountries: readonly string[];
  nigeria?: EligibilityDecision;
}

export interface CountryEligibilityResult {
  state: EligibilityDecision;
  basis: "named" | "excluded" | "africa" | "worldwide" | "unclear";
  explanation: string;
}

/** Location evidence only: authorization, skills and working hours remain separate checks. */
export function countryEligibility(
  evidence: CountryEligibilityEvidence,
  reference: string,
): CountryEligibilityResult {
  const code = countryCodeFromReference(reference);
  const name = code ? countryNameFromCode(code) : "your country";
  const included = evidence.includedCountries.map(countryCodeFromReference);
  const excluded = evidence.excludedCountries.map(countryCodeFromReference);
  const result = (
    state: EligibilityDecision,
    basis: CountryEligibilityResult["basis"],
    explanation: string,
  ): CountryEligibilityResult => ({ state, basis, explanation });
  if (!code)
    return result(
      "unclear",
      "unclear",
      "Choose a recognized country to check location eligibility.",
    );
  if (
    excluded.includes(code) ||
    (code === "NG" && evidence.nigeria === "not_eligible")
  ) {
    return result(
      "not_eligible",
      "excluded",
      `The source does not accept applicants working from ${name}.`,
    );
  }
  // Unrecognized country references cannot safely define a closed country list.
  if (included.includes(null) || excluded.includes(null))
    return result(
      "unclear",
      "unclear",
      "Some source country restrictions could not be interpreted. Check the original posting.",
    );
  if (included.includes(code))
    return result(
      "eligible",
      "named",
      `The source names ${name} as an accepted applicant location.`,
    );
  if (evidence.scope === "named_countries" || evidence.scope === "nigeria") {
    if (evidence.scope === "nigeria" && code === "NG")
      return result(
        "eligible",
        "named",
        "The source names Nigeria as an accepted applicant location.",
      );
    if (evidence.scope === "named_countries" && included.length === 0)
      return result(
        "unclear",
        "unclear",
        "The source country list is missing. Check the original posting.",
      );
    return result(
      "not_eligible",
      "excluded",
      `The source's accepted applicant locations do not include ${name}.`,
    );
  }
  if (evidence.scope === "worldwide")
    return result(
      "eligible",
      "worldwide",
      `The source states worldwide hiring, including ${name}. Check separate work-authorization requirements.`,
    );
  if (evidence.scope === "africa" && isAfricanCountryCode(code))
    return result(
      "eligible",
      "africa",
      `The source states Africa-wide hiring, including ${name}. Check separate work-authorization requirements.`,
    );
  return result(
    "unclear",
    "unclear",
    `The source does not confirm that applicants working from ${name} can apply. Check country and work-authorization requirements.`,
  );
}

export function jobCountryUrl(slug: string, applicantCountry?: string) {
  const country = countryCodeFromReference(applicantCountry ?? "");
  return `/jobs/${slug}${country ? `?applicantCountry=${country}` : ""}`;
}
