import { z } from "zod";

import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const sourceKey = z.string().regex(/^[a-z0-9][a-z0-9_]{2,79}$/);

export const salarySourceRegistrySchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    policy: z
      .object({
        defaultStatus: z.literal("draft"),
        requiresHumanRightsReview: z.literal(true),
        requiresMethodologyReview: z.literal(true),
        allowGenericCrawler: z.literal(false),
        blendWithFirstPartyContributions: z.literal(false),
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            sourceKey,
            displayName: z.string().trim().min(2).max(160),
            publisherName: z.string().trim().min(2).max(160),
            sourceKind: z.literal("official_statistics"),
            adapterKey: z.enum([
              "bls_oews",
              "ons_ashe",
              "statcan_wages",
              "statssa_qes",
            ]),
            marketCountryCode: z.string().regex(/^[A-Z]{2}$/),
            datasetUrl: externalHttpsUrlSchema,
            methodologyUrl: externalHttpsUrlSchema,
            termsUrl: externalHttpsUrlSchema.nullable(),
            status: z.literal("draft"),
            activationBlockers: z
              .array(z.string().trim().min(8).max(240))
              .min(1)
              .max(12)
              .refine((blockers) => new Set(blockers).size === blockers.length),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .superRefine((sources, context) => {
        const keys = new Set<string>();
        const adapters = new Set<string>();
        for (const [index, source] of sources.entries()) {
          for (const [field, values] of [
            ["sourceKey", keys],
            ["adapterKey", adapters],
          ] as const) {
            const value = source[field];
            if (values.has(value)) {
              context.addIssue({
                code: "custom",
                path: [index, field],
                message: `Duplicate salary source ${field}`,
              });
            }
            values.add(value);
          }
        }
      }),
  })
  .strict();

export type SalarySourceRegistry = z.infer<typeof salarySourceRegistrySchema>;

export const normalizedSalaryBenchmarkSchema = z
  .object({
    externalRecordId: z.string().min(1).max(240),
    sourceRoleCode: z.string().min(1).max(120).nullable(),
    sourceRoleLabel: z.string().min(2).max(240),
    roleFamilySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,99}$/),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    regionLabel: z.string().min(2).max(180).nullable(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    payPeriod: z.enum(["hourly", "daily", "weekly", "monthly", "annual"]),
    grossNet: z.enum(["gross", "net", "unknown"]),
    medianAmount: z.number().positive().max(1_000_000_000_000),
    percentile25Amount: z.number().positive().max(1_000_000_000_000).nullable(),
    percentile75Amount: z.number().positive().max(1_000_000_000_000).nullable(),
    medianAnnual: z.number().positive().max(1_000_000_000_000),
    percentile25Annual: z.number().positive().max(1_000_000_000_000).nullable(),
    percentile75Annual: z.number().positive().max(1_000_000_000_000).nullable(),
    sampleSize: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date(),
    sourcePublishedAt: z.iso.datetime({ offset: true }),
    retrievedAt: z.iso.datetime({ offset: true }),
    sourceUrl: externalHttpsUrlSchema,
    methodologyUrl: externalHttpsUrlSchema.nullable(),
    normalizationVersion: z.string().min(1).max(80),
    normalizationAssumptions: z
      .array(z.string().trim().min(1).max(240))
      .max(20)
      .refine(
        (assumptions) => new Set(assumptions).size === assumptions.length,
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "Effective end date precedes the start date",
      });
    }
    if (
      value.percentile25Amount !== null &&
      value.percentile25Amount > value.medianAmount
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile25Amount"],
        message: "25th percentile exceeds the median",
      });
    }
    if (
      value.percentile75Amount !== null &&
      value.percentile75Amount < value.medianAmount
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile75Amount"],
        message: "75th percentile is below the median",
      });
    }
    if (
      value.percentile25Annual !== null &&
      value.percentile25Annual > value.medianAnnual
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile25Annual"],
        message: "Annual 25th percentile exceeds the annual median",
      });
    }
    if (
      value.percentile75Annual !== null &&
      value.percentile75Annual < value.medianAnnual
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile75Annual"],
        message: "Annual 75th percentile is below the annual median",
      });
    }
    if (
      (value.percentile25Amount === null) !==
      (value.percentile25Annual === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile25Annual"],
        message: "25th-percentile source and annual values must form a pair",
      });
    }
    if (
      (value.percentile75Amount === null) !==
      (value.percentile75Annual === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile75Annual"],
        message: "75th-percentile source and annual values must form a pair",
      });
    }
    if (value.retrievedAt < value.sourcePublishedAt) {
      context.addIssue({
        code: "custom",
        path: ["retrievedAt"],
        message: "Retrieval evidence cannot predate source publication",
      });
    }
  });

export type NormalizedSalaryBenchmark = z.infer<
  typeof normalizedSalaryBenchmarkSchema
>;
