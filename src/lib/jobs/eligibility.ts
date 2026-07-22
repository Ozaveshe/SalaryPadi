import type {
  EligibilityDecision,
  JobEligibility,
  RemoteEligibilityScope,
} from "./types";

interface CountryDefinition {
  code: string;
  name: string;
  african: boolean;
  aliases?: string[];
}

const countries: CountryDefinition[] = [
  { code: "CF", name: "Central African Republic", african: true },
  {
    code: "CD",
    name: "Democratic Republic of the Congo",
    african: true,
    aliases: ["DRC", "DR Congo", "Democratic Republic of Congo"],
  },
  {
    code: "CG",
    name: "Republic of the Congo",
    african: true,
    aliases: ["Republic of Congo", "Congo-Brazzaville"],
  },
  { code: "GQ", name: "Equatorial Guinea", african: true },
  { code: "GW", name: "Guinea-Bissau", african: true },
  {
    code: "CI",
    name: "Côte d'Ivoire",
    african: true,
    aliases: ["Cote d'Ivoire", "Ivory Coast"],
  },
  { code: "ST", name: "São Tomé and Príncipe", african: true },
  { code: "SL", name: "Sierra Leone", african: true },
  { code: "ZA", name: "South Africa", african: true },
  { code: "SS", name: "South Sudan", african: true },
  { code: "DZ", name: "Algeria", african: true },
  { code: "AO", name: "Angola", african: true },
  { code: "BJ", name: "Benin", african: true },
  { code: "BW", name: "Botswana", african: true },
  { code: "BF", name: "Burkina Faso", african: true },
  { code: "BI", name: "Burundi", african: true },
  {
    code: "CV",
    name: "Cabo Verde",
    african: true,
    aliases: ["Cape Verde"],
  },
  { code: "CM", name: "Cameroon", african: true },
  { code: "TD", name: "Chad", african: true },
  { code: "KM", name: "Comoros", african: true },
  { code: "DJ", name: "Djibouti", african: true },
  { code: "EG", name: "Egypt", african: true },
  { code: "ER", name: "Eritrea", african: true },
  {
    code: "SZ",
    name: "Eswatini",
    african: true,
    aliases: ["Swaziland"],
  },
  { code: "ET", name: "Ethiopia", african: true },
  { code: "GA", name: "Gabon", african: true },
  {
    code: "GM",
    name: "Gambia",
    african: true,
    aliases: ["The Gambia"],
  },
  { code: "GH", name: "Ghana", african: true },
  { code: "GN", name: "Guinea", african: true },
  { code: "KE", name: "Kenya", african: true },
  { code: "LS", name: "Lesotho", african: true },
  { code: "LR", name: "Liberia", african: true },
  { code: "LY", name: "Libya", african: true },
  { code: "MG", name: "Madagascar", african: true },
  { code: "MW", name: "Malawi", african: true },
  { code: "ML", name: "Mali", african: true },
  { code: "MR", name: "Mauritania", african: true },
  { code: "MU", name: "Mauritius", african: true },
  { code: "MA", name: "Morocco", african: true },
  { code: "MZ", name: "Mozambique", african: true },
  { code: "NA", name: "Namibia", african: true },
  { code: "NE", name: "Niger", african: true },
  { code: "NG", name: "Nigeria", african: true },
  { code: "RW", name: "Rwanda", african: true },
  { code: "SN", name: "Senegal", african: true },
  { code: "SC", name: "Seychelles", african: true },
  { code: "SO", name: "Somalia", african: true },
  { code: "SD", name: "Sudan", african: true },
  { code: "TZ", name: "Tanzania", african: true },
  { code: "TG", name: "Togo", african: true },
  { code: "TN", name: "Tunisia", african: true },
  { code: "UG", name: "Uganda", african: true },
  { code: "ZM", name: "Zambia", african: true },
  { code: "ZW", name: "Zimbabwe", african: true },
  {
    code: "AE",
    name: "United Arab Emirates",
    african: false,
    aliases: ["UAE", "U.A.E."],
  },
  {
    code: "US",
    name: "United States",
    african: false,
    aliases: ["USA", "United States of America"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    african: false,
    aliases: ["UK", "Great Britain"],
  },
  { code: "CA", name: "Canada", african: false },
  { code: "IN", name: "India", african: false },
  { code: "AU", name: "Australia", african: false },
  { code: "NZ", name: "New Zealand", african: false },
  { code: "DE", name: "Germany", african: false },
  { code: "FR", name: "France", african: false },
  { code: "ES", name: "Spain", african: false },
  { code: "PT", name: "Portugal", african: false },
  { code: "NL", name: "Netherlands", african: false },
  { code: "IE", name: "Ireland", african: false },
  { code: "SG", name: "Singapore", african: false },
];

const countryByCode = new Map(
  countries.map((country) => [country.code, country]),
);

function normalizedWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const countryAliases = countries
  .flatMap((country) =>
    [country.name, ...(country.aliases ?? [])].map((alias) => ({
      country,
      alias: normalizedWords(alias),
    })),
  )
  .toSorted((a, b) => b.alias.length - a.alias.length);

function aliasPattern(alias: string) {
  return new RegExp(`(^|\\s)${alias.replace(/\s+/g, "\\s+")}(?=\\s|$)`);
}

function excludedAt(value: string, start: number, end: number) {
  const before = value.slice(Math.max(0, start - 32), start);
  const after = value.slice(end, Math.min(value.length, end + 28));
  return (
    /(?:except|excluding|exclude|not in|outside|without|other than)\s*$/.test(
      before,
    ) ||
    /^\s*(?:(?:is|are)\s+)?(?:explicitly\s+)?(?:excluded|not eligible|not accepted)/.test(
      after,
    )
  );
}

interface CountryReferences {
  includedCodes: string[];
  excludedCodes: string[];
  residual: string;
}

function countryReferences(value: string): CountryReferences {
  let residual = normalizedWords(value);
  const included = new Set<string>();
  const excluded = new Set<string>();

  for (const { country, alias } of countryAliases) {
    let match = aliasPattern(alias).exec(residual);
    while (match) {
      const start = match.index + match[1]!.length;
      const end = start + match[0].trimStart().length;
      if (excludedAt(residual, start, end)) {
        excluded.add(country.code);
        included.delete(country.code);
      } else if (!excluded.has(country.code)) {
        included.add(country.code);
      }
      residual = `${residual.slice(0, start)} ${residual.slice(end)}`
        .replace(/\s+/g, " ")
        .trim();
      match = aliasPattern(alias).exec(residual);
    }
  }

  return {
    includedCodes: [...included],
    excludedCodes: [...excluded],
    residual,
  };
}

export function countryNameFromCode(code: string) {
  return countryByCode.get(code.toUpperCase())?.name ?? code.toUpperCase();
}

export function isAfricanCountryCode(code: string) {
  return countryByCode.get(code.toUpperCase())?.african === true;
}

export function eligibilityDecisionForNigeria(
  scope: RemoteEligibilityScope,
  includedCodes: ReadonlySet<string>,
  excludedCodes: ReadonlySet<string>,
): EligibilityDecision {
  if (excludedCodes.has("NG")) return "not_eligible";
  if (scope === "worldwide" || scope === "africa" || scope === "nigeria") {
    return "eligible";
  }
  if (scope === "named_countries") {
    return includedCodes.has("NG") ? "eligible" : "not_eligible";
  }
  return "unclear";
}

export function eligibilityDecisionForAfrica(
  scope: RemoteEligibilityScope,
  includedCodes: ReadonlySet<string>,
): EligibilityDecision {
  if (
    scope === "worldwide" ||
    scope === "africa" ||
    scope === "emea" ||
    scope === "nigeria"
  ) {
    return "eligible";
  }
  if (scope === "named_countries") {
    return [...includedCodes].some(
      (code) => countryByCode.get(code)?.african === true,
    )
      ? "eligible"
      : "not_eligible";
  }
  return "unclear";
}

export interface EligibilityClassification {
  eligibility: JobEligibility;
  includedCountryCodes: string[];
  excludedCountryCodes: string[];
}

export function classifyEligibilityEvidence(
  evidence: string | null | undefined,
  verifiedAt: string,
): EligibilityClassification {
  const evidenceText = evidence?.trim() || "Not stated by the source";
  const normalized = normalizedWords(evidenceText);
  const references = countryReferences(evidenceText);
  const includedCodes = new Set(references.includedCodes);
  const excludedCodes = new Set(references.excludedCodes);
  const emeaPattern = /\bemea\b|\beurope middle east(?: and)? africa\b/;
  const hasEmea = emeaPattern.test(references.residual);
  const withoutEmea = references.residual.replace(emeaPattern, " ");
  const hasAfricaRegion = /\bafrica\b/.test(withoutEmea);
  // The standalone form stays an exact match so incidental wording such as
  // "customers worldwide" cannot widen scope; the prefixed form covers the
  // common ATS location format "Home based - Worldwide" / "Remote - Worldwide".
  // Bare "anywhere" is excluded on purpose: mission wording such as
  // "essential goods anytime, anywhere" must not widen a role's scope.
  const worldwide =
    /^(?:(?:home[ -]?based|remote)[ -]+)?(?:world|worldwide|world wide)(?: only)?$/.test(
      normalized,
    ) ||
    /\b(?:work from anywhere|anywhere in the world|global remote|remote global)\b/.test(
      normalized,
    );

  let scope: RemoteEligibilityScope;
  if (worldwide) scope = "worldwide";
  else if (hasAfricaRegion) scope = "africa";
  else if (includedCodes.size === 1 && includedCodes.has("NG"))
    scope = "nigeria";
  else if (includedCodes.size > 0) scope = "named_countries";
  else if (hasEmea) scope = "emea";
  else if (
    excludedCodes.size > 0 ||
    /\b(?:latam|apac|europe|americas|asia|middle east)\b/.test(normalized)
  ) {
    scope = "restricted_region";
  } else {
    scope = "unclear";
  }

  const base = {
    scope,
    nigeria: eligibilityDecisionForNigeria(scope, includedCodes, excludedCodes),
    africa: eligibilityDecisionForAfrica(scope, includedCodes),
    includedCountries: references.includedCodes.map(countryNameFromCode),
    excludedCountries: references.excludedCodes.map(countryNameFromCode),
    requiredTimezone: null,
    workAuthorization: null,
    visaSponsorship: "unclear" as const,
    relocationSupport: "unclear" as const,
    evidenceText,
    provenance: "source_provided" as const,
    lastVerifiedAt: verifiedAt,
  } satisfies JobEligibility;

  return {
    eligibility: base,
    includedCountryCodes: references.includedCodes,
    excludedCountryCodes: references.excludedCodes,
  };
}

export function classifyEligibility(
  evidence: string | null | undefined,
  verifiedAt: string,
): JobEligibility {
  return classifyEligibilityEvidence(evidence, verifiedAt).eligibility;
}
