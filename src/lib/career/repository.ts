import "server-only";

import { z } from "zod";

import {
  mapRepositoryResult,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { jobAlertSearchSpecSchema } from "@/lib/jobs/search";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const timestampSchema = z.string().datetime({ offset: true });
const nonnegativeAmountSchema = z.coerce.number().finite().nonnegative();
const MAX_CAREER_ROWS = 1_000;
const careerRowsSchema = <T extends { id: string }>(
  rowSchema: z.ZodType<T>,
  timestampField: keyof T,
) =>
  z
    .array(rowSchema)
    .max(MAX_CAREER_ROWS)
    .superRefine((rows, context) => {
      const ids = new Set<string>();
      let previousTimestamp = Number.POSITIVE_INFINITY;
      for (const [index, row] of rows.entries()) {
        if (ids.has(row.id)) {
          context.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "Career record IDs must be unique.",
          });
        }
        ids.add(row.id);

        const value = row[timestampField];
        const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
        if (timestamp > previousTimestamp) {
          context.addIssue({
            code: "custom",
            path: [index, timestampField as string],
            message: "Career records must retain newest-first ordering.",
          });
        }
        previousTimestamp = timestamp;
      }
    });
const savedJobSchema = z
  .object({
    id: z.uuid(),
    job_slug: z
      .string()
      .min(1)
      .max(240)
      .regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(1).max(300),
    company_name: z.string().trim().min(1).max(300),
    source_name: z.string().trim().min(1).max(300),
    saved_at: timestampSchema,
  })
  .strict();

const applicationSchema = z
  .object({
    id: z.uuid(),
    job_slug: z
      .string()
      .min(1)
      .max(240)
      .regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(1).max(300),
    company_name: z.string().trim().min(1).max(300),
    status: z.enum([
      "saved",
      "applied",
      "assessment",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
    ]),
    private_notes: z.string().max(10_000).nullable(),
    next_action_at: timestampSchema.nullable(),
    updated_at: timestampSchema,
  })
  .strict();

const alertSchema = z
  .object({
    id: z.uuid(),
    query: jobAlertSearchSpecSchema,
    cadence: z.enum(["daily", "weekly"]),
    active: z.boolean(),
    created_at: timestampSchema,
  })
  .strict();

/**
 * Every field is the account owner's own claim about themselves. `attested_at`
 * is when they last confirmed it; a profile that has never been saved reads back
 * as null rather than as an empty set of claims.
 */
const candidateProfileSchema = z
  .object({
    headline: z.string().trim().min(2).max(160).nullable(),
    summary: z.string().max(5_000).nullable(),
    years_experience: z.number().int().min(0).max(60).nullable(),
    experience_level: z.enum([
      "entry",
      "junior",
      "mid",
      "senior",
      "lead",
      "executive",
      "unspecified",
    ]),
    desired_work_arrangement: z.enum([
      "remote",
      "hybrid",
      "onsite",
      "unspecified",
    ]),
    desired_salary_min: nonnegativeAmountSchema.nullable(),
    desired_salary_max: nonnegativeAmountSchema.nullable(),
    desired_currency_code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    desired_pay_period: z
      .enum(["hourly", "daily", "weekly", "monthly", "annual"])
      .nullable(),
    location_country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    open_to_relocation: z.boolean(),
    attested_at: timestampSchema.nullable(),
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.desired_salary_min !== null &&
      row.desired_salary_max !== null &&
      row.desired_salary_max < row.desired_salary_min
    ) {
      context.addIssue({
        code: "custom",
        path: ["desired_salary_max"],
        message: "Maximum pay expectation cannot be below the minimum.",
      });
    }
    // A pay expectation without units cannot be compared against a job, so it
    // must never reach the scorer as if it were interpretable.
    const hasAmount =
      row.desired_salary_min !== null || row.desired_salary_max !== null;
    if (
      hasAmount &&
      (row.desired_currency_code === null || row.desired_pay_period === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["desired_currency_code"],
        message: "A pay expectation requires both a currency and a pay period.",
      });
    }
  });

export type CandidateProfileRow = z.infer<typeof candidateProfileSchema>;

type CareerRpcName =
  | "get_my_saved_jobs"
  | "get_my_applications"
  | "get_my_job_alerts"
  | "get_my_candidate_profile";

async function readCareerRows<T>(
  name: CareerRpcName,
  schema: z.ZodType<T[]>,
): Promise<RepositoryResult<T[]>> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        name,
        "query_failed",
        "career_rpc_error",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(name, "not_configured", "career_backend_unconfigured"),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .rpc(name)
      .limit(MAX_CAREER_ROWS + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        name,
        "query_failed",
        "career_rpc_error",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        name,
        error ? "query_failed" : "invalid_container",
        error ? "career_rpc_error" : "career_invalid_container",
        error,
      ),
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        name,
        "invalid_rows",
        "career_invalid_rows",
        parsed.error,
      ),
    );
  }

  return repositoryReady(parsed.data);
}

export async function getSavedJobs() {
  return readCareerRows(
    "get_my_saved_jobs",
    careerRowsSchema(savedJobSchema, "saved_at"),
  );
}

export async function getApplications() {
  return readCareerRows(
    "get_my_applications",
    careerRowsSchema(applicationSchema, "updated_at"),
  );
}

export async function getAlerts() {
  return readCareerRows(
    "get_my_job_alerts",
    careerRowsSchema(alertSchema, "created_at"),
  );
}

/**
 * Reads the signed-in account's attested candidate profile. Resolves to null
 * when the owner has never saved one — distinct from a failed read, which
 * carries a non-ready state and an issue.
 */
export async function getCandidateProfile(): Promise<
  RepositoryResult<CandidateProfileRow | null>
> {
  const result = await readCareerRows(
    "get_my_candidate_profile",
    z.array(candidateProfileSchema).max(1),
  );
  return mapRepositoryResult(result, (rows) => rows[0] ?? null);
}
