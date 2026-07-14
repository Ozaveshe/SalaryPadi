import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Expected an HTTPS URL");

const sourceKey = z.string().regex(/^[a-z0-9][a-z0-9_]{2,79}$/);

export const salarySourceRegistrySchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  policy: z.object({
    defaultStatus: z.literal("draft"),
    requiresHumanRightsReview: z.literal(true),
    requiresMethodologyReview: z.literal(true),
    allowGenericCrawler: z.literal(false),
    blendWithFirstPartyContributions: z.literal(false),
  }),
  sources: z
    .array(
      z.object({
        sourceKey,
        displayName: z.string().min(2).max(160),
        publisherName: z.string().min(2).max(160),
        sourceKind: z.literal("official_statistics"),
        adapterKey: z.enum([
          "bls_oews",
          "ons_ashe",
          "statcan_wages",
          "statssa_qes",
        ]),
        marketCountryCode: z.string().regex(/^[A-Z]{2}$/),
        datasetUrl: httpsUrl,
        methodologyUrl: httpsUrl,
        termsUrl: httpsUrl.nullable(),
        status: z.literal("draft"),
        activationBlockers: z.array(z.string().min(8).max(240)).min(1).max(12),
      }),
    )
    .min(1)
    .max(20)
    .superRefine((sources, context) => {
      const seen = new Set<string>();
      for (const [index, source] of sources.entries()) {
        if (seen.has(source.sourceKey)) {
          context.addIssue({
            code: "custom",
            path: [index, "sourceKey"],
            message: "Duplicate salary source key",
          });
        }
        seen.add(source.sourceKey);
      }
    }),
});

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
    medianAmount: z.number().positive(),
    percentile25Amount: z.number().positive().nullable(),
    percentile75Amount: z.number().positive().nullable(),
    medianAnnual: z.number().positive(),
    percentile25Annual: z.number().positive().nullable(),
    percentile75Annual: z.number().positive().nullable(),
    sampleSize: z.number().int().positive().nullable(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date(),
    sourcePublishedAt: z.iso.datetime({ offset: true }),
    retrievedAt: z.iso.datetime({ offset: true }),
    sourceUrl: httpsUrl,
    methodologyUrl: httpsUrl.nullable(),
    normalizationVersion: z.string().min(1).max(80),
    normalizationAssumptions: z.array(z.string().min(1).max(240)).max(20),
  })
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
  });

export type NormalizedSalaryBenchmark = z.infer<
  typeof normalizedSalaryBenchmarkSchema
>;
