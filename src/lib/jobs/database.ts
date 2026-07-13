import { z } from "zod";

import {
  countryNameFromCode,
  eligibilityDecisionForAfrica,
  eligibilityDecisionForNigeria,
} from "./eligibility";
import { buildJobFingerprint } from "./fingerprint";
import type {
  EmploymentArrangement,
  EmploymentType,
  ExperienceLevel,
  Job,
  JobEligibility,
  JobSourcePolicy,
  PayPeriod,
  RemoteEligibilityScope,
  RiskIndicator,
  SalaryRange,
  WorkMode,
} from "./types";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const locationSchema = z.object({
  country_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
});

const eligibilityCountrySchema = z.object({
  country_code: z.string(),
  rule: z.enum(["include", "exclude"]),
});

const riskSchema = z.object({
  code: z.string(),
  severity: z.coerce.number().int().min(1).max(5),
  evidence_text: z.string().nullable().optional(),
});

const databaseJobSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  external_source_id: z.string(),
  title: z.string(),
  description_text: z.string(),
  requirements_text: z.string().nullable(),
  benefits_text: z.string().nullable(),
  work_arrangement: z.string(),
  employment_type: z.string(),
  engagement_type: z.string(),
  experience_level: z.string(),
  salary_min: z.coerce.number().nullable(),
  salary_max: z.coerce.number().nullable(),
  currency_code: z.string().nullable(),
  pay_period: z.string().nullable(),
  gross_net: z.string(),
  bonus_text: z.string().nullable(),
  application_url: httpsUrl,
  source_url: httpsUrl,
  posted_at: z.string().nullable(),
  valid_through: z.string().nullable(),
  last_checked_at: z.string(),
  last_verified_at: z.string().nullable(),
  company_slug: z.string(),
  company_name: z.string(),
  company_verification_status: z.string(),
  source_name: z.string(),
  source_id: z.string().uuid(),
  source_type: z.string(),
  source_terms_url: z.string(),
  source_homepage_url: z.string().nullable(),
  attribution_required: z.boolean(),
  attribution_text: z.string().nullable(),
  may_store_full_description: z.boolean(),
  may_index_jobs: z.boolean(),
  may_emit_jobposting_schema: z.boolean(),
  may_email_jobs: z.boolean(),
  required_destination_kind: z.string(),
  refresh_interval_seconds: z.coerce.number().int().positive(),
  terms_reviewed_at: z.string(),
  eligibility_scope: z.string().nullable(),
  required_timezone_overlap: z.string().nullable(),
  work_authorization_requirement: z.string().nullable(),
  visa_sponsorship: z.boolean().nullable(),
  relocation_support: z.boolean().nullable(),
  eligibility_evidence: z.string().nullable(),
  eligibility_provenance: z.string().nullable(),
  eligibility_verified_at: z.string().nullable(),
  role_family: z.string().nullable(),
  dedup_fingerprint: z.string().nullable(),
  locations: z.array(locationSchema).max(50),
  eligibility_countries: z.array(eligibilityCountrySchema).max(100),
  skills: z.array(z.string()).max(100),
  risk_indicators: z.array(riskSchema).max(100),
});

function mapSourceType(value: string): JobSourcePolicy["type"] {
  if (value === "direct_employer" || value === "employer_ats")
    return "employer";
  if (value === "partner_feed") return "partner";
  if (value === "manual") return "manual";
  return "permitted_api";
}

function mapWorkMode(value: string): WorkMode {
  return value === "remote" || value === "hybrid" || value === "onsite"
    ? value
    : "unclear";
}

function mapEmploymentType(value: string): EmploymentType {
  const values = new Set<EmploymentType>([
    "full_time",
    "part_time",
    "contract",
    "temporary",
    "internship",
    "freelance",
  ]);
  return values.has(value as EmploymentType)
    ? (value as EmploymentType)
    : "unknown";
}

function mapArrangement(value: string): EmploymentArrangement {
  return value === "employee" || value === "contractor" || value === "freelance"
    ? value
    : "unknown";
}

function mapExperience(value: string): ExperienceLevel {
  if (value === "junior") return "entry";
  return value === "entry" ||
    value === "mid" ||
    value === "senior" ||
    value === "lead" ||
    value === "executive"
    ? value
    : "unknown";
}

function mapPayPeriod(value: string | null): PayPeriod {
  return value === "hourly" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "annual"
    ? value
    : "unknown";
}

function mapSalary(row: z.infer<typeof databaseJobSchema>): SalaryRange | null {
  if (row.salary_min === null && row.salary_max === null) return null;
  const currency = row.currency_code ?? "Currency not stated";
  const values = [row.salary_min, row.salary_max]
    .filter((value): value is number => value !== null)
    .map((value) => value.toLocaleString("en"));
  const payPeriod = mapPayPeriod(row.pay_period);
  const periodText =
    payPeriod === "unknown" ? "period not stated" : `per ${payPeriod}`;
  return {
    originalText: `${currency} ${values.join("–")} ${periodText}`,
    currency: row.currency_code,
    minimum: row.salary_min,
    maximum: row.salary_max ?? row.salary_min,
    payPeriod,
    grossNet:
      row.gross_net === "gross" || row.gross_net === "net"
        ? row.gross_net
        : "unknown",
  };
}

function mapEligibility(
  row: z.infer<typeof databaseJobSchema>,
): JobEligibility {
  const allowedScopes = new Set<RemoteEligibilityScope>([
    "worldwide",
    "africa",
    "emea",
    "nigeria",
    "named_countries",
    "restricted_region",
    "unclear",
  ]);
  const scope = allowedScopes.has(
    row.eligibility_scope as RemoteEligibilityScope,
  )
    ? (row.eligibility_scope as RemoteEligibilityScope)
    : "unclear";
  const included = new Set(
    row.eligibility_countries
      .filter(({ rule }) => rule === "include")
      .map(({ country_code }) => country_code),
  );
  const excluded = new Set(
    row.eligibility_countries
      .filter(({ rule }) => rule === "exclude")
      .map(({ country_code }) => country_code),
  );
  const provenance =
    row.eligibility_provenance === "manually_verified" ||
    row.eligibility_provenance === "inferred"
      ? row.eligibility_provenance
      : "source_provided";
  return {
    scope,
    nigeria: eligibilityDecisionForNigeria(scope, included, excluded),
    africa: eligibilityDecisionForAfrica(scope, included),
    includedCountries: [...included].map(countryNameFromCode),
    excludedCountries: [...excluded].map(countryNameFromCode),
    requiredTimezone: row.required_timezone_overlap,
    workAuthorization: row.work_authorization_requirement,
    visaSponsorship:
      row.visa_sponsorship === true
        ? "yes"
        : row.visa_sponsorship === false
          ? "no"
          : "unclear",
    relocationSupport:
      row.relocation_support === true
        ? "yes"
        : row.relocation_support === false
          ? "no"
          : "unclear",
    evidenceText:
      row.eligibility_evidence ?? "Eligibility evidence was not published.",
    provenance,
    lastVerifiedAt:
      row.eligibility_verified_at ??
      row.last_verified_at ??
      row.last_checked_at,
  };
}

function mapLocation(row: z.infer<typeof databaseJobSchema>): string {
  const locations = row.locations
    .map((location) =>
      [
        location.city,
        location.region,
        location.country_code
          ? countryNameFromCode(location.country_code)
          : null,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean);
  if (locations.length > 0) return locations.join("; ");
  return row.eligibility_evidence ?? "Location not stated";
}

function mapRisks(rows: z.infer<typeof riskSchema>[]): RiskIndicator[] {
  return rows.map((row) => ({
    code: row.code,
    label: row.code
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    explanation:
      row.evidence_text ?? "A reviewer recorded this public caution.",
    severity:
      row.severity >= 4 ? "high" : row.severity >= 2 ? "caution" : "info",
  }));
}

function mapValidatedDatabaseJobRow(
  row: z.infer<typeof databaseJobSchema>,
): Job {
  const arrangement = mapArrangement(row.engagement_type);
  const locationDisplay = mapLocation(row);
  const source: JobSourcePolicy = {
    id: row.source_id,
    name: row.source_name,
    type: mapSourceType(row.source_type),
    termsUrl: row.source_terms_url,
    termsReviewedAt: row.terms_reviewed_at,
    attributionRequired:
      row.attribution_text ??
      (row.attribution_required
        ? "Visible source attribution is required."
        : "No special attribution text is required."),
    canStoreFullDescription: row.may_store_full_description,
    canIndex: row.may_index_jobs,
    canUseJobPostingStructuredData: row.may_emit_jobposting_schema,
    canEmail: row.may_email_jobs,
    destinationRequirement: row.required_destination_kind,
    refreshIntervalSeconds: row.refresh_interval_seconds,
  };
  return {
    id: row.id,
    databaseId: row.id,
    slug: row.slug,
    externalId: row.external_source_id,
    source,
    sourceUrl: row.source_url,
    applicationUrl: row.application_url,
    title: row.title,
    company: {
      name: row.company_name,
      slug: row.company_slug,
      verification:
        row.company_verification_status === "domain_verified" ||
        row.company_verification_status === "organization_verified"
          ? "employer_verified"
          : "unverified",
    },
    locationDisplay,
    workMode: mapWorkMode(row.work_arrangement),
    employmentType: mapEmploymentType(row.employment_type),
    arrangement,
    experienceLevel: mapExperience(row.experience_level),
    category: row.role_family,
    skills: row.skills,
    salary: mapSalary(row),
    eligibility: mapEligibility(row),
    description: row.description_text,
    requirements: row.requirements_text,
    benefits: row.benefits_text,
    postedAt: row.posted_at ?? row.last_checked_at,
    lastCheckedAt: row.last_checked_at,
    validThrough: row.valid_through,
    status: "open",
    riskIndicators: mapRisks(row.risk_indicators),
    // SQL fingerprints remain useful as source-record evidence, but every
    // adapter must use one canonical read-time key for cross-source merging.
    fingerprint: buildJobFingerprint({
      title: row.title,
      company: row.company_name,
      location: locationDisplay,
      arrangement,
      destination: row.application_url,
    }),
  };
}

export type DatabaseJobDecodeResult =
  | { ok: true; job: Job }
  | {
      ok: false;
      code: "database_job_contract_invalid";
      issuePaths: string[];
    };

/**
 * Validates the public database boundary and returns bounded diagnostics. The
 * diagnostics contain field paths only, never source values or descriptions.
 */
export function decodeDatabaseJobRow(input: unknown): DatabaseJobDecodeResult {
  const parsed = databaseJobSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "database_job_contract_invalid",
      issuePaths: [
        ...new Set(
          parsed.error.issues.map((issue) =>
            issue.path.length > 0 ? issue.path.join(".") : "row",
          ),
        ),
      ].slice(0, 12),
    };
  }
  return { ok: true, job: mapValidatedDatabaseJobRow(parsed.data) };
}

export function mapDatabaseJobRow(input: unknown): Job | null {
  const decoded = decodeDatabaseJobRow(input);
  return decoded.ok ? decoded.job : null;
}
