import { z } from "zod";

import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });
const amountSchema = z.number().nonnegative().finite();

const aggregateRowSchema = z
  .object({
    id: z.string().uuid(),
    company_slug: slugSchema.nullable(),
    role_slug: slugSchema,
    role_family: z.string().min(2).max(160),
    country_code: z.string().regex(/^[A-Z]{2}$/),
    seniority: z.string().min(2).max(40),
    arrangement: z.string().min(2).max(40),
    currency: z.string().regex(/^[A-Z]{3}$/),
    gross_net: z.enum(["gross", "net", "unspecified"]),
    median_annual: amountSchema.positive(),
    percentile_25_annual: amountSchema.nullable(),
    percentile_75_annual: amountSchema.nullable(),
    sample_size: z.number().int().nonnegative().nullable(),
    submission_month_start: dateSchema,
    submission_month_end: dateSchema,
    confidence: z.enum(["low", "medium", "high"]),
    calculated_at: timestampSchema,
    evidence_lane: z.enum([
      "first_party_contributions",
      "verified_online_benchmark",
    ]),
    source_name: z.string().min(2).max(200),
    source_url: externalHttpsUrlSchema.nullable(),
    methodology_url: externalHttpsUrlSchema.nullable(),
    source_role_label: z.string().min(2).max(200).nullable(),
    source_pay_period: z.string().min(2).max(40).nullable(),
    source_median_amount: amountSchema.positive().nullable(),
    provenance_label: z.string().min(2).max(300),
  })
  .passthrough()
  .superRefine((row, context) => {
    if (row.submission_month_start > row.submission_month_end) {
      context.addIssue({
        code: "custom",
        path: ["submission_month_end"],
        message: "Evidence end month cannot precede its start month.",
      });
    }
    if (
      row.percentile_25_annual !== null &&
      row.percentile_25_annual > row.median_annual
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile_25_annual"],
        message: "The lower percentile cannot exceed the median.",
      });
    }
    if (
      row.percentile_75_annual !== null &&
      row.percentile_75_annual < row.median_annual
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentile_75_annual"],
        message: "The upper percentile cannot be below the median.",
      });
    }
    if (row.evidence_lane === "first_party_contributions") {
      if (row.sample_size === null || row.sample_size < 3) {
        context.addIssue({
          code: "custom",
          path: ["sample_size"],
          message: "First-party evidence must meet the privacy threshold.",
        });
      }
      if (row.source_url !== null) {
        context.addIssue({
          code: "custom",
          path: ["source_url"],
          message: "First-party evidence cannot claim an external source URL.",
        });
      }
      return;
    }
    for (const field of [
      "source_url",
      "source_role_label",
      "source_pay_period",
      "source_median_amount",
    ] as const) {
      if (row[field] === null) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Verified online evidence requires this source field.",
        });
      }
    }
  });

export interface PublicSalaryAggregate {
  id: string;
  companySlug: string | null;
  roleSlug: string;
  roleFamily: string;
  countryCode: string;
  seniority: string;
  arrangement: string;
  currency: string;
  grossNet: "gross" | "net" | "mixed";
  medianAnnual: number;
  percentile25Annual: number | null;
  percentile75Annual: number | null;
  sampleSize: number | null;
  submissionMonthStart: string;
  submissionMonthEnd: string;
  confidence: "low" | "medium" | "high";
  calculatedAt: string;
  evidenceLane: "first_party_contributions" | "verified_online_benchmark";
  sourceName: string;
  sourceUrl: string | null;
  methodologyUrl: string | null;
  sourceRoleLabel: string | null;
  sourcePayPeriod: string | null;
  sourceMedianAmount: number | null;
  provenanceLabel: string;
}

export type SalaryAggregateDecodeResult =
  | { ok: true; aggregate: PublicSalaryAggregate }
  | { ok: false; issuePaths: string[] };

export function decodePublicSalaryAggregate(
  value: unknown,
): SalaryAggregateDecodeResult {
  const parsed = aggregateRowSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issuePaths: [
        ...new Set(
          parsed.error.issues.map((issue) => issue.path.join(".") || "row"),
        ),
      ].toSorted(),
    };
  }
  const row = parsed.data;
  return {
    ok: true,
    aggregate: {
      id: row.id,
      companySlug: row.company_slug,
      roleSlug: row.role_slug,
      roleFamily: row.role_family,
      countryCode: row.country_code,
      seniority: row.seniority,
      arrangement: row.arrangement,
      currency: row.currency,
      grossNet: row.gross_net === "unspecified" ? "mixed" : row.gross_net,
      medianAnnual: row.median_annual,
      percentile25Annual: row.percentile_25_annual,
      percentile75Annual: row.percentile_75_annual,
      sampleSize: row.sample_size,
      submissionMonthStart: row.submission_month_start,
      submissionMonthEnd: row.submission_month_end,
      confidence: row.confidence,
      calculatedAt: row.calculated_at,
      evidenceLane: row.evidence_lane,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      methodologyUrl: row.methodology_url,
      sourceRoleLabel: row.source_role_label,
      sourcePayPeriod: row.source_pay_period,
      sourceMedianAmount: row.source_median_amount,
      provenanceLabel: row.provenance_label,
    },
  };
}
