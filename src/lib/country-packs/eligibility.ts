export type NormalizedEligibilityScope =
  | "worldwide"
  | "africa"
  | "emea"
  | "nigeria"
  | "named_countries"
  | "restricted_region"
  | "unclear";

export interface CountryEligibilityEvidence {
  scope: NormalizedEligibilityScope;
  includedCountries: readonly string[];
  excludedCountries: readonly string[];
}

const AFRICA_PACK_COUNTRIES = new Set(["NG", "GH", "KE", "ZA"]);

/** Generic remote and EMEA are not country permission evidence. */
export function explicitlyAllowsCountry(
  evidence: CountryEligibilityEvidence,
  countryCode: string,
) {
  const country = countryCode.toUpperCase();
  const included = new Set(
    evidence.includedCountries.map((value) => value.toUpperCase()),
  );
  const excluded = new Set(
    evidence.excludedCountries.map((value) => value.toUpperCase()),
  );
  if (excluded.has(country)) return false;
  if (included.has(country)) return true;
  if (evidence.scope === "worldwide") return true;
  if (evidence.scope === "africa" && AFRICA_PACK_COUNTRIES.has(country)) {
    return true;
  }
  if (evidence.scope === "nigeria" && country === "NG") return true;
  return false;
}
