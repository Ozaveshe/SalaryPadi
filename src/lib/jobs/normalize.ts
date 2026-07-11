import { createHash } from "node:crypto";

import he from "he";
import sanitizeHtml from "sanitize-html";

import { remotiveJobSchema, type RemotiveJob } from "./remotive-schema";
import { REMOTIVE_SOURCE_POLICY } from "./source-policy";
import type {
  EmploymentArrangement,
  EmploymentType,
  ExperienceLevel,
  Job,
  JobEligibility,
  PayPeriod,
  SalaryRange,
} from "./types";

const africanCountries = new Set([
  "algeria",
  "angola",
  "benin",
  "botswana",
  "burkina faso",
  "burundi",
  "cabo verde",
  "cameroon",
  "central african republic",
  "chad",
  "comoros",
  "congo",
  "democratic republic of the congo",
  "djibouti",
  "egypt",
  "equatorial guinea",
  "eritrea",
  "eswatini",
  "ethiopia",
  "gabon",
  "gambia",
  "ghana",
  "guinea",
  "guinea-bissau",
  "ivory coast",
  "kenya",
  "lesotho",
  "liberia",
  "libya",
  "madagascar",
  "malawi",
  "mali",
  "mauritania",
  "mauritius",
  "morocco",
  "mozambique",
  "namibia",
  "niger",
  "nigeria",
  "rwanda",
  "senegal",
  "seychelles",
  "sierra leone",
  "somalia",
  "south africa",
  "south sudan",
  "sudan",
  "tanzania",
  "togo",
  "tunisia",
  "uganda",
  "zambia",
  "zimbabwe",
]);

const knownCountries = new Map(
  [
    ...africanCountries,
    "united states",
    "usa",
    "canada",
    "united kingdom",
    "uk",
    "india",
    "australia",
    "new zealand",
    "germany",
    "france",
    "spain",
    "portugal",
    "netherlands",
    "ireland",
    "singapore",
  ].map((country) => [country, country]),
);

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article)>/gi, "\n");
  const fragments: string[] = [];

  sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    textFilter(text) {
      fragments.push(text);
      return "";
    },
  });

  return normalizeWhitespace(he.decode(fragments.join("")));
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function splitLocationTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[,;/|]+|\bor\b/)
    .map((token) => token.replace(/[()]/g, "").trim())
    .filter(Boolean);
}

export function classifyEligibility(
  evidence: string | null | undefined,
  verifiedAt: string,
): JobEligibility {
  const evidenceText = evidence?.trim() || "Not stated by the source";
  const normalized = evidenceText.toLowerCase().replace(/\s+/g, " ").trim();
  const base = {
    excludedCountries: [],
    requiredTimezone: null,
    workAuthorization: null,
    visaSponsorship: "unclear" as const,
    relocationSupport: "unclear" as const,
    evidenceText,
    provenance: "source_provided" as const,
    lastVerifiedAt: verifiedAt,
  };

  if (/^world(?:wide)?(?: only)?$/.test(normalized)) {
    return {
      ...base,
      scope: "worldwide",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: [],
    };
  }

  if (/^nigeria(?: only)?$/.test(normalized)) {
    return {
      ...base,
      scope: "nigeria",
      nigeria: "eligible",
      africa: "not_eligible",
      includedCountries: ["Nigeria"],
    };
  }

  if (/^africa(?: only)?$/.test(normalized)) {
    return {
      ...base,
      scope: "africa",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: [],
    };
  }

  if (
    /^emea(?: only)?$|europe,? middle east(?:,? and)? africa/.test(normalized)
  ) {
    return {
      ...base,
      scope: "emea",
      nigeria: "unclear",
      africa: "unclear",
      includedCountries: [],
    };
  }

  const tokens = splitLocationTokens(normalized);
  const countries = tokens
    .map((token) => knownCountries.get(token))
    .filter((country): country is string => Boolean(country));

  if (countries.length > 0 && countries.length === tokens.length) {
    const nigeriaIncluded = countries.includes("nigeria");
    const africaIncluded = countries.some((country) =>
      africanCountries.has(country),
    );
    return {
      ...base,
      scope: "named_countries",
      nigeria: nigeriaIncluded ? "eligible" : "not_eligible",
      africa: africaIncluded ? "eligible" : "not_eligible",
      includedCountries: countries.map((country) =>
        country.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      ),
    };
  }

  return {
    ...base,
    scope:
      normalized === "not stated by the source"
        ? "unclear"
        : "restricted_region",
    nigeria: "unclear",
    africa: "unclear",
    includedCountries: [],
  };
}

function parseEmploymentType(value: string | null | undefined): EmploymentType {
  const normalized = value?.toLowerCase().replace(/[ -]+/g, "_") ?? "";
  if (normalized.includes("full")) return "full_time";
  if (normalized.includes("part")) return "part_time";
  if (normalized.includes("intern")) return "internship";
  if (normalized.includes("freelance")) return "freelance";
  if (normalized.includes("contract")) return "contract";
  if (normalized.includes("temporary")) return "temporary";
  return "unknown";
}

function inferArrangement(type: EmploymentType): EmploymentArrangement {
  if (type === "contract") return "contractor";
  if (type === "freelance") return "freelance";
  if (type === "full_time" || type === "part_time" || type === "internship") {
    return "employee";
  }
  return "unknown";
}

function inferExperienceLevel(title: string, tags: string[]): ExperienceLevel {
  const value = `${title} ${tags.join(" ")}`.toLowerCase();
  if (/\b(chief|c-level|vp|vice president|director)\b/.test(value))
    return "executive";
  if (/\b(lead|principal|staff|head of)\b/.test(value)) return "lead";
  if (/\b(senior|sr\.)\b/.test(value)) return "senior";
  if (/\b(junior|graduate|entry|intern|trainee)\b/.test(value)) return "entry";
  if (/\b(mid|intermediate)\b/.test(value)) return "mid";
  return "unknown";
}

function parseAmount(rawValue: string): number | null {
  // A multiplier may be attached or separated by whitespace, but it must not
  // start a longer word. This accepts "$120 k" while ensuring "60000 Kč" and
  // "6,000 monthly" never read as 60000×1000 or 6000×1000000.
  const match = rawValue
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)(?:\s*([kKmM])(?!\p{L}))?/u);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const multiplier =
    match[2]?.toLowerCase() === "k"
      ? 1_000
      : match[2]?.toLowerCase() === "m"
        ? 1_000_000
        : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : null;
}

function detectCurrency(value: string): string | null {
  if (/\b(?:NGN)\b|₦/i.test(value)) return "NGN";
  if (/\b(?:USD)\b|\$/i.test(value)) return "USD";
  if (/\b(?:EUR)\b|€/i.test(value)) return "EUR";
  if (/\b(?:GBP)\b|£/i.test(value)) return "GBP";
  if (/\bKES\b/i.test(value)) return "KES";
  if (/\bGHS\b|₵/i.test(value)) return "GHS";
  if (/\bZAR\b/i.test(value)) return "ZAR";
  return null;
}

function detectPayPeriod(value: string): PayPeriod {
  if (/\b(?:per\s+)?hour(?:ly)?\b|\/hr\b/i.test(value)) return "hourly";
  if (/\b(?:per\s+)?day|daily\b|\/day\b/i.test(value)) return "daily";
  if (/\b(?:per\s+)?week|weekly\b|\/week\b/i.test(value)) return "weekly";
  if (/\b(?:per\s+)?month|monthly\b|\/month\b/i.test(value)) return "monthly";
  if (/\b(?:per\s+)?year|annual(?:ly)?\b|\/year\b|\/yr\b/i.test(value))
    return "annual";
  return "unknown";
}

export function parseSalary(
  value: string | null | undefined,
): SalaryRange | null {
  const originalText = value?.trim();
  if (!originalText) return null;
  const amountParts = originalText
    .split(/\s*(?:-|–|—|to)\s*/i)
    .map(parseAmount);
  const present = amountParts.filter(
    (amount): amount is number => amount !== null,
  );

  return {
    originalText,
    currency: detectCurrency(originalText),
    minimum: present[0] ?? null,
    maximum: present.length > 1 ? (present[1] ?? null) : (present[0] ?? null),
    payPeriod: detectPayPeriod(originalText),
    grossNet: /\bnet\b/i.test(originalText)
      ? "net"
      : /\bgross\b/i.test(originalText)
        ? "gross"
        : "unknown",
  };
}

export function buildJobFingerprint(input: {
  title: string;
  company: string;
  location: string;
  arrangement: EmploymentArrangement;
  destination: string;
}) {
  const canonicalText = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const destination = new URL(input.destination);
  destination.hash = "";
  destination.hostname = destination.hostname.toLowerCase();
  const canonical = JSON.stringify([
    canonicalText(input.title),
    canonicalText(input.company),
    canonicalText(input.location),
    input.arrangement,
    destination.toString(),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function normalizeRemotiveJob(
  input: RemotiveJob,
  checkedAt = new Date().toISOString(),
): Job {
  const source = remotiveJobSchema.parse(input);
  const employmentType = parseEmploymentType(source.job_type);
  const arrangement = inferArrangement(employmentType);
  const evidence =
    source.candidate_required_location || "Not stated by the source";
  const eligibility = classifyEligibility(evidence, checkedAt);
  const companySlug = slugify(source.company_name);
  const titleSlug = slugify(source.title);
  const sourceUrl = new URL(source.url);
  if (
    sourceUrl.protocol !== "https:" ||
    (sourceUrl.hostname !== "remotive.com" &&
      !sourceUrl.hostname.endsWith(".remotive.com"))
  ) {
    throw new Error(
      "Remotive returned a destination outside its allowed HTTPS host.",
    );
  }

  const fingerprint = buildJobFingerprint({
    title: source.title,
    company: source.company_name,
    location: evidence,
    arrangement,
    destination: sourceUrl.toString(),
  });

  return {
    id: `remotive-${source.id}`,
    databaseId: null,
    slug: `${titleSlug}-at-${companySlug}-${source.id}`,
    externalId: String(source.id),
    source: REMOTIVE_SOURCE_POLICY,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: sourceUrl.toString(),
    title: source.title,
    company: {
      name: source.company_name,
      slug: companySlug,
      verification: "source_listed",
    },
    locationDisplay: evidence,
    workMode: "remote",
    employmentType,
    arrangement,
    experienceLevel: inferExperienceLevel(source.title, source.tags),
    category: source.category || null,
    skills: [...new Set(source.tags)].slice(0, 20),
    salary: parseSalary(source.salary),
    eligibility,
    description: htmlToPlainText(source.description),
    requirements: null,
    benefits: null,
    postedAt: source.publication_date,
    lastCheckedAt: checkedAt,
    validThrough: null,
    status: "open",
    riskIndicators: [
      {
        code: "source-not-employer-verified",
        label: "Employer not verified by SalaryPadi",
        explanation:
          "This listing comes from a permitted third-party feed. Verify the vacancy on the employer’s own website before sharing information.",
        severity: "caution",
      },
    ],
    fingerprint,
  };
}

export function annualizedSalaryMinimum(job: Job): number | null {
  const salary = job.salary;
  if (!salary?.minimum) return null;
  const multiplier: Record<PayPeriod, number | null> = {
    hourly: 2_080,
    daily: 260,
    weekly: 52,
    monthly: 12,
    annual: 1,
    unknown: null,
  };
  const factor = multiplier[salary.payPeriod];
  return factor ? salary.minimum * factor : null;
}
