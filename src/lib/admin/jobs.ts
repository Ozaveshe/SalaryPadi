import "server-only";

import { z } from "zod";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const jobAdminStatuses = [
  "draft",
  "pending",
  "published",
  "expired",
  "removed",
  "rejected",
] as const;

const enumText = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_]+$/);
const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable();
const nullableDate = z.iso.datetime({ offset: true }).nullable();
const nullableAmount = z.coerce.number().finite().nonnegative().nullable();

const searchRowSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(2).max(300),
    company_name: z.string().trim().min(2).max(200),
    source_name: z.string().trim().min(1).max(200),
    source_adapter: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(120),
    external_source_id: z.string().trim().min(1).max(500),
    slug: z.string().trim().min(1).max(400),
    status: z.enum(jobAdminStatuses),
    updated_at: z.iso.datetime({ offset: true }),
    version: z.coerce.number().int().positive(),
    open_report_count: z.coerce.number().int().nonnegative(),
  })
  .strict();

export type AdminJobSearchRow = z.infer<typeof searchRowSchema>;

const jobSchema = z
  .object({
    id: z.uuid(),
    version: z.coerce.number().int().positive(),
    canonical_job_id: z.uuid().nullable(),
    external_source_id: z.string().trim().min(1).max(500),
    slug: z.string().trim().min(1).max(400),
    status: z.enum(jobAdminStatuses),
    title: z.string().trim().min(2).max(300),
    description: z.string().trim().min(20).max(100_000),
    requirements: nullableText(100_000),
    benefits: nullableText(100_000),
    work_arrangement: enumText,
    employment_type: enumText,
    engagement_type: enumText,
    experience_level: enumText,
    salary_min: nullableAmount,
    salary_max: nullableAmount,
    currency_code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    pay_period: enumText.nullable(),
    gross_net: enumText,
    bonus_text: nullableText(5_000),
    application_url: z.url().max(2_000),
    source_url: z.url().max(2_000),
    original_employer_url: z.url().max(2_000).nullable(),
    posted_at: nullableDate,
    valid_through: nullableDate,
    last_seen_at: z.iso.datetime({ offset: true }),
    last_checked_at: z.iso.datetime({ offset: true }),
    last_verified_at: nullableDate,
    content_sanitized_at: nullableDate,
    dedup_fingerprint: nullableText(500),
    is_fixture: z.boolean(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    lifecycle_state: enumText,
    lifecycle_reason: nullableText(500),
    manual_reconfirmed_at: nullableDate,
    apply_link_state: enumText,
    apply_link_checked_at: nullableDate,
    public_ready_until: nullableDate,
    application_destination_kind: nullableText(80),
  })
  .strict();

const companySchema = z
  .object({
    id: z.uuid(),
    slug: z.string().trim().min(1).max(200),
    display_name: z.string().trim().min(2).max(200),
    website_url: z.url().max(2_000).nullable(),
    website_domain: nullableText(255),
    verification_status: enumText,
    record_status: enumText,
  })
  .strict();

const sourceSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    adapter_key: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(120),
    source_type: enumText,
    status: enumText,
    authority: enumText,
    policy_state: enumText,
    terms_url: z.string().trim().min(1).max(2_000),
    terms_reviewed_at: nullableDate,
    terms_version: nullableText(500),
    allow_public_listing: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    may_email_jobs: z.boolean(),
    authorization_basis: nullableText(500),
    authorization_evidence_ref: nullableText(2_000),
    authorization_reviewed_at: nullableDate,
    authorization_expires_at: nullableDate,
    authorization_revoked_at: nullableDate,
  })
  .strict();

const locationSchema = z
  .object({
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    city: nullableText(160),
    region: nullableText(160),
    is_primary: z.boolean(),
    source_location_text: nullableText(500),
  })
  .strict();

const eligibilitySchema = z
  .object({
    scope: enumText,
    required_timezone_overlap: nullableText(500),
    work_authorization_requirement: nullableText(2_000),
    visa_sponsorship: z.boolean().nullable(),
    relocation_support: z.boolean().nullable(),
    evidence_text: nullableText(5_000),
    provenance: enumText,
    confidence: z.coerce.number().min(0).max(1).nullable(),
    last_verified_at: nullableDate,
    region_wording: nullableText(2_000),
    physical_location_requirement: nullableText(2_000),
    arrangement_evidence: nullableText(5_000),
  })
  .strict();

const detailRowSchema = z
  .object({
    job_data: jobSchema,
    company_data: companySchema,
    source_data: sourceSchema,
    locations_data: z.array(locationSchema).max(100),
    eligibility_data: eligibilitySchema.nullable(),
    publication_blockers: z.array(enumText).max(20),
    open_report_count: z.coerce.number().int().nonnegative(),
    report_count: z.coerce.number().int().nonnegative(),
    duplicate_candidate_count: z.coerce.number().int().nonnegative(),
  })
  .strict();

export type AdminJobDetail = z.infer<typeof detailRowSchema>;

const searchInputSchema = z
  .object({
    query: z.string().trim().max(200).default(""),
    status: z.enum(jobAdminStatuses).nullable().default(null),
  })
  .refine((value) => value.query.length !== 1, {
    message: "Enter at least two characters.",
    path: ["query"],
  });

export type AdminJobSearchInput = z.infer<typeof searchInputSchema>;

export function parseAdminJobSearch(raw: {
  q?: string | string[];
  status?: string | string[];
}) {
  return searchInputSchema.safeParse({
    query: typeof raw.q === "string" ? raw.q : "",
    status:
      typeof raw.status === "string" && raw.status !== "" ? raw.status : null,
  });
}

function readFailure<T>(
  operation: string,
  code: string,
  error?: unknown,
  data: T = null as T,
) {
  return repositoryFailure(
    "unavailable",
    data,
    repositoryIssue(operation, "query_failed", code, error),
  );
}

export async function searchAdminJobsResult(
  input: AdminJobSearchInput,
): Promise<RepositoryResult<AdminJobSearchRow[]>> {
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.jobs.search",
        "invalid_rows",
        "admin_job_search_invalid",
      ),
    );
  }
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok)
    return readFailure(
      "admin.jobs.search",
      "admin_job_search_failed",
      clientAttempt.error,
      [],
    );
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "admin.jobs.search",
        "not_configured",
        "admin_job_search_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc(
      "admin_search_jobs" as never,
      {
        p_query: parsedInput.data.query,
        p_status: parsedInput.data.status,
        p_limit: 50,
      } as never,
    ),
  );
  if (!queryAttempt.ok)
    return readFailure(
      "admin.jobs.search",
      "admin_job_search_failed",
      queryAttempt.error,
      [],
    );
  const { data, error } = queryAttempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData)) {
    return readFailure(
      "admin.jobs.search",
      error ? "admin_job_search_failed" : "admin_job_search_invalid_container",
      error,
      [],
    );
  }
  if (rawData.length > 50) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.jobs.search",
        "invalid_container",
        "admin_job_search_capacity_exceeded",
      ),
    );
  }
  const rows = rawData.flatMap((row) => {
    const parsed = searchRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  if (rows.length !== rawData.length) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.jobs.search",
        "invalid_rows",
        "admin_job_search_invalid_rows",
      ),
    );
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "admin.jobs.search",
        "invalid_rows",
        "admin_job_search_duplicate_rows",
      ),
    );
  }
  return repositoryReady(rows);
}

export async function getAdminJobDetailResult(
  jobId: string,
): Promise<RepositoryResult<AdminJobDetail | null>> {
  if (!z.uuid().safeParse(jobId).success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.jobs.detail",
        "invalid_rows",
        "admin_job_id_invalid",
      ),
    );
  }
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok)
    return readFailure(
      "admin.jobs.detail",
      "admin_job_detail_failed",
      clientAttempt.error,
    );
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        "admin.jobs.detail",
        "not_configured",
        "admin_job_detail_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc(
      "admin_get_job_detail" as never,
      {
        p_job_id: jobId,
      } as never,
    ),
  );
  if (!queryAttempt.ok)
    return readFailure(
      "admin.jobs.detail",
      "admin_job_detail_failed",
      queryAttempt.error,
    );
  const { data, error } = queryAttempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData)) {
    return readFailure(
      "admin.jobs.detail",
      error ? "admin_job_detail_failed" : "admin_job_detail_invalid_container",
      error,
    );
  }
  if (rawData.length === 0) return repositoryReady(null);
  if (rawData.length !== 1) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.jobs.detail",
        "invalid_container",
        "admin_job_detail_ambiguous",
      ),
    );
  }
  const parsed = detailRowSchema.safeParse(rawData[0]);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.jobs.detail",
        "invalid_rows",
        "admin_job_detail_invalid_row",
      ),
    );
  }
  return repositoryReady(parsed.data);
}
