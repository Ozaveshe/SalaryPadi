import he from "he";
import sanitizeHtml from "sanitize-html";

import { classifyEligibility } from "./eligibility";
import { buildJobFingerprint } from "./fingerprint";
import { jobicyJobSchema, type JobicyJob } from "./jobicy-schema";
import { remotiveJobSchema, type RemotiveJob } from "./remotive-schema";
import { JOBICY_SOURCE_POLICY, REMOTIVE_SOURCE_POLICY } from "./source-policy";
import { extractCompleteEligibilityEvidence } from "./supply/eligibility-evidence";
import type {
  EmploymentArrangement,
  EmploymentType,
  ExperienceLevel,
  Job,
  PayPeriod,
  SalaryRange,
} from "./types";

type SupportedSalaryCurrency =
  "NGN" | "USD" | "EUR" | "GBP" | "KES" | "GHS" | "ZAR";

interface SalaryAmountBounds {
  minimum: number;
  maximum: number;
}

const SALARY_CURRENCY_PATTERNS: readonly {
  currency: SupportedSalaryCurrency;
  pattern: RegExp;
}[] = [
  { currency: "NGN", pattern: /\bNGN\b|₦/i },
  { currency: "USD", pattern: /\bUSD\b|\$/i },
  { currency: "EUR", pattern: /\bEUR\b|€/i },
  { currency: "GBP", pattern: /\bGBP\b|£/i },
  { currency: "KES", pattern: /\bKES\b/i },
  { currency: "GHS", pattern: /\bGHS\b|₵/i },
  { currency: "ZAR", pattern: /\bZAR\b/i },
];

/**
 * Deliberately wide ingestion guardrails, not salary-market claims. The
 * bounds only reject obvious parser errors and fat-finger magnitudes. Unknown
 * periods span the lowest supported unit floor through the annual ceiling.
 */
export const SALARY_PLAUSIBILITY_BOUNDS = {
  USD: {
    hourly: { minimum: 1, maximum: 5_000 },
    daily: { minimum: 10, maximum: 50_000 },
    weekly: { minimum: 50, maximum: 250_000 },
    monthly: { minimum: 100, maximum: 1_000_000 },
    annual: { minimum: 1_000, maximum: 10_000_000 },
    unknown: { minimum: 1, maximum: 10_000_000 },
  },
  EUR: {
    hourly: { minimum: 1, maximum: 5_000 },
    daily: { minimum: 10, maximum: 50_000 },
    weekly: { minimum: 50, maximum: 250_000 },
    monthly: { minimum: 100, maximum: 1_000_000 },
    annual: { minimum: 1_000, maximum: 10_000_000 },
    unknown: { minimum: 1, maximum: 10_000_000 },
  },
  GBP: {
    hourly: { minimum: 1, maximum: 5_000 },
    daily: { minimum: 10, maximum: 50_000 },
    weekly: { minimum: 50, maximum: 250_000 },
    monthly: { minimum: 100, maximum: 1_000_000 },
    annual: { minimum: 1_000, maximum: 10_000_000 },
    unknown: { minimum: 1, maximum: 10_000_000 },
  },
  NGN: {
    hourly: { minimum: 50, maximum: 2_500_000 },
    daily: { minimum: 500, maximum: 10_000_000 },
    weekly: { minimum: 2_500, maximum: 50_000_000 },
    monthly: { minimum: 5_000, maximum: 100_000_000 },
    annual: { minimum: 50_000, maximum: 1_000_000_000 },
    unknown: { minimum: 50, maximum: 1_000_000_000 },
  },
  KES: {
    hourly: { minimum: 10, maximum: 500_000 },
    daily: { minimum: 100, maximum: 2_000_000 },
    weekly: { minimum: 500, maximum: 10_000_000 },
    monthly: { minimum: 1_000, maximum: 50_000_000 },
    annual: { minimum: 10_000, maximum: 500_000_000 },
    unknown: { minimum: 10, maximum: 500_000_000 },
  },
  GHS: {
    hourly: { minimum: 1, maximum: 100_000 },
    daily: { minimum: 10, maximum: 500_000 },
    weekly: { minimum: 50, maximum: 2_000_000 },
    monthly: { minimum: 100, maximum: 10_000_000 },
    annual: { minimum: 1_000, maximum: 100_000_000 },
    unknown: { minimum: 1, maximum: 100_000_000 },
  },
  ZAR: {
    hourly: { minimum: 1, maximum: 100_000 },
    daily: { minimum: 10, maximum: 500_000 },
    weekly: { minimum: 50, maximum: 2_000_000 },
    monthly: { minimum: 100, maximum: 10_000_000 },
    annual: { minimum: 1_000, maximum: 100_000_000 },
    unknown: { minimum: 1, maximum: 100_000_000 },
  },
} as const satisfies Record<
  SupportedSalaryCurrency,
  Record<PayPeriod, SalaryAmountBounds>
>;

export const SALARY_ANNUALIZATION_ASSUMPTIONS = {
  weeksPerYear: 52,
  workDaysPerWeek: 5,
  workHoursPerWeek: 40,
} as const;

export const PAY_PERIOD_ANNUALIZATION_FACTORS = {
  hourly:
    SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear *
    SALARY_ANNUALIZATION_ASSUMPTIONS.workHoursPerWeek,
  daily:
    SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear *
    SALARY_ANNUALIZATION_ASSUMPTIONS.workDaysPerWeek,
  weekly: SALARY_ANNUALIZATION_ASSUMPTIONS.weeksPerYear,
  monthly: 12,
  annual: 1,
  unknown: null,
} satisfies Record<PayPeriod, number | null>;

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
  // Treat a comma followed by one or two digits before k/m as a decimal
  // separator. Three-digit comma groups remain thousands separators.
  const decimalComma = /\d,\d{1,2}\s*[kKmM](?!\p{L})/u.test(rawValue);
  const numericValue = decimalComma
    ? rawValue.replace(/(\d),(?=\d{1,2}\s*[kKmM](?!\p{L}))/gu, "$1.")
    : rawValue.replace(/,/g, "");
  const match = numericValue.match(/(\d+(?:\.\d+)?)(?:\s*([kKmM])(?!\p{L}))?/u);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const multiplier =
    match[2]?.toLowerCase() === "k"
      ? 1_000
      : match[2]?.toLowerCase() === "m"
        ? 1_000_000
        : 1;
  const scaled = amount * multiplier;
  return Number.isFinite(scaled) &&
    scaled > 0 &&
    scaled <= Number.MAX_SAFE_INTEGER
    ? Math.round(scaled)
    : null;
}

function detectCurrencies(value: string): SupportedSalaryCurrency[] {
  return SALARY_CURRENCY_PATTERNS.filter(({ pattern }) =>
    pattern.test(value),
  ).map(({ currency }) => currency);
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
  const currencies = detectCurrencies(originalText);
  if (currencies.length > 1) return null;
  const currency = currencies[0] ?? null;
  const payPeriod = detectPayPeriod(originalText);
  const amountParts = originalText
    .split(/\s*(?:-|–|—|to)\s*/i)
    .map(parseAmount);
  const present = amountParts.filter(
    (amount): amount is number => amount !== null,
  );
  if (present.length === 0) return null;
  if (currency) {
    const bounds = SALARY_PLAUSIBILITY_BOUNDS[currency][payPeriod];
    if (
      present.some(
        (amount) => amount < bounds.minimum || amount > bounds.maximum,
      )
    ) {
      return null;
    }
  }

  const first = present[0]!;
  const second = present[1] ?? first;

  return {
    originalText,
    currency,
    minimum: Math.min(first, second),
    maximum: Math.max(first, second),
    payPeriod,
    grossNet: /\bnet\b/i.test(originalText)
      ? "net"
      : /\bgross\b/i.test(originalText)
        ? "gross"
        : "unknown",
  };
}

export function normalizeRemotiveJob(
  input: RemotiveJob,
  checkedAt = new Date().toISOString(),
): Job {
  const source = remotiveJobSchema.parse(input);
  const employmentType = parseEmploymentType(source.job_type);
  const arrangement = inferArrangement(employmentType);
  const location =
    source.candidate_required_location || "Not stated by the source";
  const description = htmlToPlainText(source.description);
  const completeEligibility = extractCompleteEligibilityEvidence(
    `${location}. ${description}`,
    checkedAt,
  );
  const eligibility = {
    ...classifyEligibility(location, checkedAt),
    requiredTimezone: completeEligibility.timezone,
    workAuthorization: completeEligibility.workAuthorization,
    visaSponsorship: completeEligibility.visaSponsorship,
  };
  const companySlug = slugify(source.company_name);
  const titleSlug = slugify(source.title);
  const sourceUrl = new URL(source.url);
  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.username ||
    sourceUrl.password ||
    (sourceUrl.port && sourceUrl.port !== "443") ||
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
    location,
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
    locationDisplay: location,
    workMode: "remote",
    employmentType,
    arrangement,
    experienceLevel: inferExperienceLevel(source.title, source.tags),
    category: source.category || null,
    skills: [...new Set(source.tags)].slice(0, 20),
    salary: parseSalary(source.salary),
    eligibility,
    description,
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

function jobicySalary(source: JobicyJob): SalaryRange | null {
  const minimum = source.salaryMin ?? source.salaryMax;
  const maximum = source.salaryMax ?? source.salaryMin;
  if (
    minimum == null ||
    maximum == null ||
    !source.salaryCurrency ||
    !(source.salaryCurrency in SALARY_PLAUSIBILITY_BOUNDS)
  ) {
    return null;
  }
  const period = source.salaryPeriod?.toLowerCase() ?? "";
  const periodText = period.includes("hour")
    ? "hour"
    : period.includes("day")
      ? "day"
      : period.includes("week")
        ? "week"
        : period.includes("month")
          ? "month"
          : period.includes("year") || period.includes("annual")
            ? "year"
            : "";
  return parseSalary(
    `${source.salaryCurrency} ${minimum} - ${maximum}${periodText ? ` per ${periodText}` : ""}`,
  );
}

export function normalizeJobicyJob(
  input: JobicyJob,
  checkedAt = new Date().toISOString(),
): Job {
  const source = jobicyJobSchema.parse(input);
  const employmentType = parseEmploymentType(source.jobType.join(" "));
  const arrangement = inferArrangement(employmentType);
  const sourceUrl = new URL(source.url);
  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.username ||
    sourceUrl.password ||
    (sourceUrl.port && sourceUrl.port !== "443") ||
    (sourceUrl.hostname !== "jobicy.com" &&
      !sourceUrl.hostname.endsWith(".jobicy.com"))
  ) {
    throw new Error(
      "Jobicy returned a destination outside its allowed HTTPS host.",
    );
  }

  const location = source.jobGeo;
  const companySlug = slugify(source.companyName);
  const titleSlug = slugify(source.jobTitle);
  const description = htmlToPlainText(source.jobExcerpt ?? "").slice(0, 600);
  const eligibility = classifyEligibility(location, checkedAt);
  const fingerprint = buildJobFingerprint({
    title: source.jobTitle,
    company: source.companyName,
    location,
    arrangement,
    destination: sourceUrl.toString(),
  });

  return {
    id: `jobicy-${source.id}`,
    databaseId: null,
    slug: `${titleSlug}-at-${companySlug}-${source.id}`,
    externalId: source.id,
    source: JOBICY_SOURCE_POLICY,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: sourceUrl.toString(),
    title: source.jobTitle,
    company: {
      name: source.companyName,
      slug: companySlug,
      verification: "source_listed",
    },
    locationDisplay: location,
    workMode: "remote",
    employmentType,
    arrangement,
    experienceLevel: inferExperienceLevel(source.jobTitle, [
      source.jobLevel ?? "",
      ...source.jobIndustry,
    ]),
    category: source.jobIndustry[0] ?? null,
    skills: [],
    salary: jobicySalary(source),
    eligibility,
    description:
      description || "Open the attributed source listing for full details.",
    requirements: null,
    benefits: null,
    postedAt: source.pubDate,
    lastCheckedAt: checkedAt,
    validThrough: null,
    status: "open",
    riskIndicators: [
      {
        code: "source-not-employer-verified",
        label: "Employer not verified by SalaryPadi",
        explanation:
          "This listing comes from Jobicy's documented public feed. Verify the vacancy on the employer's own website before sharing information.",
        severity: "caution",
      },
    ],
    fingerprint,
  };
}

export { classifyEligibility } from "./eligibility";
export { buildJobFingerprint } from "./fingerprint";

export function annualizedSalaryMinimum(job: Job): number | null {
  const salary = job.salary;
  if (!salary?.minimum) return null;
  const factor = PAY_PERIOD_ANNUALIZATION_FACTORS[salary.payPeriod];
  return factor === null ? null : salary.minimum * factor;
}
