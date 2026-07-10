import { z } from "zod";

import type { Job } from "./types";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]*$/);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestampSchema = z.string().datetime({ offset: true, local: true });
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const sourceSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(300),
    type: z.enum(["permitted_api", "employer", "partner", "manual"]),
    termsUrl: z.string().trim().min(1).max(2_000),
    termsReviewedAt: z.string().trim().min(1).max(100),
    attributionRequired: z.string().trim().min(1).max(2_000),
    canStoreFullDescription: z.boolean(),
    canIndex: z.boolean(),
    canUseJobPostingStructuredData: z.boolean(),
    destinationRequirement: z.string().trim().min(1).max(2_000),
    refreshIntervalSeconds: z.number().int().positive(),
  })
  .strict();

const salarySchema = z
  .object({
    originalText: z.string().trim().min(1).max(500),
    currency: z.string().trim().min(1).max(20).nullable(),
    minimum: z.number().finite().nonnegative().nullable(),
    maximum: z.number().finite().nonnegative().nullable(),
    payPeriod: z.enum([
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "annual",
      "unknown",
    ]),
    grossNet: z.enum(["gross", "net", "unknown"]),
  })
  .strict();

const eligibilitySchema = z
  .object({
    scope: z.enum([
      "worldwide",
      "africa",
      "emea",
      "nigeria",
      "named_countries",
      "restricted_region",
      "unclear",
    ]),
    nigeria: z.enum(["eligible", "not_eligible", "unclear"]),
    africa: z.enum(["eligible", "not_eligible", "unclear"]),
    includedCountries: z.array(z.string().trim().min(1).max(160)).max(100),
    excludedCountries: z.array(z.string().trim().min(1).max(160)).max(100),
    requiredTimezone: z.string().trim().min(1).max(300).nullable(),
    workAuthorization: z.string().trim().min(1).max(1_000).nullable(),
    visaSponsorship: z.enum(["yes", "no", "unclear"]),
    relocationSupport: z.enum(["yes", "no", "unclear"]),
    evidenceText: z.string().trim().min(1).max(5_000),
    provenance: z.enum(["source_provided", "manually_verified", "inferred"]),
    lastVerifiedAt: timestampSchema,
  })
  .strict();

const riskIndicatorSchema = z
  .object({
    code: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(300),
    explanation: z.string().trim().min(1).max(2_000),
    severity: z.enum(["info", "caution", "high"]),
  })
  .strict();

/**
 * The current alert snapshot is a privacy-minimized operational projection,
 * not a trusted TypeScript object. Validate every nested field and require
 * redacted content before matching or email rendering can consume it.
 */
export const alertCatalogJobSchema = z
  .object({
    id: identifierSchema,
    databaseId: z.string().uuid().nullable(),
    slug: slugSchema,
    externalId: z.string().trim().min(1).max(300),
    source: sourceSchema,
    sourceUrl: httpsUrlSchema,
    applicationUrl: httpsUrlSchema,
    title: z.string().trim().min(1).max(300),
    company: z
      .object({
        name: z.string().trim().min(1).max(300),
        slug: slugSchema,
        verification: z.enum([
          "source_listed",
          "employer_verified",
          "unverified",
        ]),
      })
      .strict(),
    locationDisplay: z.string().trim().min(1).max(1_000),
    workMode: z.enum(["remote", "hybrid", "onsite", "unclear"]),
    employmentType: z.enum([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "internship",
      "freelance",
      "unknown",
    ]),
    arrangement: z.enum(["employee", "contractor", "freelance", "unknown"]),
    experienceLevel: z.enum([
      "entry",
      "mid",
      "senior",
      "lead",
      "executive",
      "unknown",
    ]),
    category: z.string().trim().min(1).max(300).nullable(),
    skills: z.array(z.string().trim().min(1).max(160)).max(100),
    salary: salarySchema.nullable(),
    eligibility: eligibilitySchema,
    description: z.literal(""),
    requirements: z.null(),
    benefits: z.null(),
    postedAt: timestampSchema,
    lastCheckedAt: timestampSchema,
    validThrough: timestampSchema.nullable(),
    status: z.enum(["open", "expired"]),
    riskIndicators: z.array(riskIndicatorSchema).max(0),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict() satisfies z.ZodType<Job>;

export const alertCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    checkedAt: timestampSchema,
    jobs: z.array(alertCatalogJobSchema).max(2_000),
  })
  .strict();

export type AlertCatalog = z.infer<typeof alertCatalogSchema>;

export function createAlertCatalog(
  jobs: Job[],
  checkedAt = new Date().toISOString(),
): AlertCatalog {
  return {
    schemaVersion: 1,
    checkedAt,
    jobs: jobs.map((job) => ({
      ...job,
      description: "",
      requirements: null,
      benefits: null,
      riskIndicators: [],
    })),
  };
}
