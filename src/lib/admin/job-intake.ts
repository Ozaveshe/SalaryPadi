import "server-only";

import { z } from "zod";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const optional = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalUrl = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  externalHttpsUrlSchema.optional(),
);
const optionalMoney = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().nonnegative().max(10_000_000_000).optional(),
);

export const operatorJobIntakeSchema = z
  .object({
    company_name: z.string().trim().min(2).max(200),
    company_website: optionalUrl,
    title: z.string().trim().min(2).max(300),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    location: z.string().trim().min(2).max(200),
    work_mode: z.enum(["remote", "hybrid", "onsite"]),
    employment_type: z.enum([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "internship",
      "freelance",
    ]),
    arrangement: z.enum(["employee", "contractor", "freelance"]),
    experience_level: z.enum(["entry", "mid", "senior", "lead", "executive"]),
    eligibility_scope: z.enum([
      "worldwide",
      "africa",
      "emea",
      "nigeria",
      "named_countries",
      "restricted_region",
      "unclear",
    ]),
    eligibility_evidence: z.string().trim().min(5).max(2_000),
    included_countries: optional(1_000),
    excluded_countries: optional(1_000),
    timezone_overlap: optional(300),
    work_authorization: optional(500),
    visa_sponsorship: z.enum(["yes", "no", "unclear"]),
    salary_minimum: optionalMoney,
    salary_maximum: optionalMoney,
    currency: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
    ),
    pay_period: z.enum([
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "annual",
      "unknown",
    ]),
    gross_net: z.enum(["gross", "net", "unknown"]),
    description: z.string().trim().min(100).max(20_000),
    requirements: z.string().trim().min(20).max(10_000),
    benefits: optional(5_000),
    application_url: externalHttpsUrlSchema,
    deadline: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.string().date().optional(),
    ),
    source_url: externalHttpsUrlSchema,
    source_evidence: z.string().trim().min(10).max(2_000),
    authorization_evidence: z.string().trim().min(10).max(2_000),
    authorization_attestation: z.literal("on"),
    intake_reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.salary_minimum !== undefined &&
      value.salary_maximum !== undefined &&
      value.salary_maximum < value.salary_minimum
    ) {
      context.addIssue({
        code: "custom",
        path: ["salary_maximum"],
        message: "Maximum salary must be at least the minimum.",
      });
    }
    if (
      (value.salary_minimum !== undefined ||
        value.salary_maximum !== undefined) &&
      !value.currency
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency is required when salary is supplied.",
      });
    }
  });

const listRowSchema = z
  .object({
    id: z.uuid(),
    moderation_case_id: z.uuid(),
    title: z.string().trim().min(2).max(300),
    company_name: z.string().trim().min(2).max(200),
    source_url: z.url().max(2_000),
    status: z.enum([
      "draft",
      "pending",
      "in_review",
      "revision_requested",
      "approved",
      "rejected",
      "removed",
    ]),
    submitted_at: z.iso.datetime({ offset: true }),
    case_version: z.coerce.number().int().positive(),
  })
  .strict();

export type OperatorJobIntakeRow = z.infer<typeof listRowSchema>;

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const submissionSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(2).max(300),
    company_name: z.string().trim().min(2).max(200),
    company_website: z.url().max(2_000).nullable(),
    country_code: z.string().regex(/^[A-Z]{2}$/),
    location: z.string().trim().min(2).max(200),
    work_mode: z.string().min(1).max(80),
    employment_type: z.string().min(1).max(80),
    arrangement: z.string().min(1).max(80),
    experience_level: z.string().min(1).max(80),
    eligibility_scope: z.string().min(1).max(80),
    eligibility_evidence: z.string().trim().min(5).max(2_000),
    included_countries: nullableText(1_000),
    excluded_countries: nullableText(1_000),
    timezone_overlap: nullableText(300),
    work_authorization: nullableText(500),
    visa_sponsorship: z.boolean().nullable(),
    salary_minimum: z.coerce.number().nonnegative().nullable(),
    salary_maximum: z.coerce.number().nonnegative().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    pay_period: nullableText(80),
    gross_net: z.string().min(1).max(80),
    description: z.string().trim().min(100).max(20_000),
    requirements: z.string().trim().min(20).max(10_000),
    benefits: nullableText(5_000),
    application_url: z.url().max(2_000),
    deadline: z.string().date().nullable(),
    source_url: z.url().max(2_000),
    source_evidence: z.string().trim().min(10).max(2_000),
    authorization_evidence: z.string().trim().min(10).max(2_000),
    intake_reason: z.string().trim().min(3).max(500),
    status: z.string().min(1).max(80),
    submitted_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();
const moderationSchema = z
  .object({
    case_id: z.uuid(),
    state: z.string().min(1).max(80),
    priority: z.coerce.number().int().min(1).max(5),
    version: z.coerce.number().int().positive(),
    opened_at: z.iso.datetime({ offset: true }),
    closed_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
const detailSchema = z
  .object({
    submission_data: submissionSchema,
    moderation_data: moderationSchema,
  })
  .strict();

export type OperatorJobIntakeDetail = z.infer<typeof detailSchema>;

function failure<T>(
  operation: string,
  code: string,
  error: unknown,
  fallback: T,
) {
  return repositoryFailure(
    "unavailable",
    fallback,
    repositoryIssue(operation, "query_failed", code, error),
  );
}

export async function listOperatorJobIntakeResult(): Promise<
  RepositoryResult<OperatorJobIntakeRow[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok)
    return failure(
      "admin.job_intake.list",
      "job_intake_list_failed",
      clientAttempt.error,
      [],
    );
  if (!clientAttempt.value)
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "admin.job_intake.list",
        "not_configured",
        "job_intake_unconfigured",
      ),
    );
  const attempt = await attemptRepositoryOperation(() =>
    clientAttempt.value!.schema("api").rpc(
      "admin_list_job_intake" as never,
      {
        p_limit: 50,
      } as never,
    ),
  );
  if (!attempt.ok)
    return failure(
      "admin.job_intake.list",
      "job_intake_list_failed",
      attempt.error,
      [],
    );
  const { data, error } = attempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData))
    return failure(
      "admin.job_intake.list",
      "job_intake_list_failed",
      error,
      [],
    );
  const parsed = z.array(listRowSchema).max(50).safeParse(rawData);
  return parsed.success
    ? repositoryReady(parsed.data)
    : repositoryFailure(
        "invalid",
        [],
        repositoryIssue(
          "admin.job_intake.list",
          "invalid_rows",
          "job_intake_invalid_rows",
        ),
      );
}

export async function getOperatorJobIntakeDetailResult(
  id: string,
): Promise<RepositoryResult<OperatorJobIntakeDetail | null>> {
  if (!z.uuid().safeParse(id).success)
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.job_intake.detail",
        "invalid_rows",
        "job_intake_id_invalid",
      ),
    );
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok)
    return failure(
      "admin.job_intake.detail",
      "job_intake_detail_failed",
      clientAttempt.error,
      null,
    );
  if (!clientAttempt.value)
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        "admin.job_intake.detail",
        "not_configured",
        "job_intake_unconfigured",
      ),
    );
  const attempt = await attemptRepositoryOperation(() =>
    clientAttempt.value!.schema("api").rpc(
      "admin_get_job_intake_detail" as never,
      {
        p_submission_id: id,
      } as never,
    ),
  );
  if (!attempt.ok)
    return failure(
      "admin.job_intake.detail",
      "job_intake_detail_failed",
      attempt.error,
      null,
    );
  const { data, error } = attempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData))
    return failure(
      "admin.job_intake.detail",
      "job_intake_detail_failed",
      error,
      null,
    );
  if (rawData.length === 0) return repositoryReady(null);
  if (rawData.length !== 1)
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.job_intake.detail",
        "invalid_container",
        "job_intake_ambiguous",
      ),
    );
  const parsed = detailSchema.safeParse(rawData[0]);
  return parsed.success
    ? repositoryReady(parsed.data)
    : repositoryFailure(
        "invalid",
        null,
        repositoryIssue(
          "admin.job_intake.detail",
          "invalid_rows",
          "job_intake_invalid_detail",
        ),
      );
}
