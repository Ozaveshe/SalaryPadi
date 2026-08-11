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

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable();
const nullableDate = z.iso.datetime({ offset: true }).nullable();
const nullableAmount = z.coerce.number().finite().nonnegative().nullable();
const enumText = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_]+$/);

const jobSideShape = {
  source_job_id: z.uuid(),
  job_id: z.uuid(),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().min(20).max(100_000),
  company_name: z.string().trim().min(2).max(200),
  status: enumText,
  slug: z.string().min(1).max(400),
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
  application_url: z.url().max(2_000),
  source_url: z.url().max(2_000),
  posted_at: nullableDate,
  valid_through: nullableDate,
  last_seen_at: z.iso.datetime({ offset: true }),
  last_verified_at: nullableDate,
  locations: nullableText(1_000),
  eligibility_scope: enumText.nullable(),
  eligibility_evidence: nullableText(5_000),
  eligibility_provenance: enumText.nullable(),
  source_name: z.string().trim().min(1).max(200),
  source_adapter: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(120),
  source_authority: enumText,
  source_terms_url: z.string().trim().min(1).max(2_000),
  source_terms_reviewed_at: nullableDate,
};

const duplicateDetailRowSchema = z
  .object({
    candidate_id: z.uuid(),
    candidate_status: enumText,
    candidate_version: z.coerce.number().int().positive(),
    title_similarity: z.coerce.number().min(0.9).max(1),
    detection_reason: nullableText(500),
    left_application_host: nullableText(255),
    right_application_host: nullableText(255),
    candidate_created_at: z.iso.datetime({ offset: true }),
    candidate_reviewed_at: nullableDate,
    resolution_reason: nullableText(500),
    canonical_job_id: z.uuid().nullable(),
    ...Object.fromEntries(
      Object.entries(jobSideShape).map(([key, schema]) => [
        `first_${key}`,
        schema,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(jobSideShape).map(([key, schema]) => [
        `second_${key}`,
        schema,
      ]),
    ),
  })
  .strict();

type DuplicateDetailRow = z.infer<typeof duplicateDetailRowSchema>;

export interface DuplicateJobSide {
  sourceJobId: string;
  jobId: string;
  title: string;
  description: string;
  companyName: string;
  status: string;
  slug: string;
  workArrangement: string;
  employmentType: string;
  engagementType: string;
  experienceLevel: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currencyCode: string | null;
  payPeriod: string | null;
  applicationUrl: string;
  sourceUrl: string;
  postedAt: string | null;
  validThrough: string | null;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  locations: string | null;
  eligibilityScope: string | null;
  eligibilityEvidence: string | null;
  eligibilityProvenance: string | null;
  sourceName: string;
  sourceAdapter: string;
  sourceAuthority: string;
  sourceTermsUrl: string;
  sourceTermsReviewedAt: string | null;
}

export interface DuplicateCandidateDetail {
  id: string;
  status: string;
  version: number;
  titleSimilarity: number;
  detectionReason: string | null;
  firstApplicationHost: string | null;
  secondApplicationHost: string | null;
  createdAt: string;
  reviewedAt: string | null;
  resolutionReason: string | null;
  canonicalJobId: string | null;
  first: DuplicateJobSide;
  second: DuplicateJobSide;
}

function mapSide(row: DuplicateDetailRow, prefix: "first" | "second") {
  const field = <Key extends keyof DuplicateJobSide>(
    key: Key,
    databaseKey: string,
  ): DuplicateJobSide[Key] =>
    row[
      `${prefix}_${databaseKey}` as keyof DuplicateDetailRow
    ] as DuplicateJobSide[Key];
  return {
    sourceJobId: field("sourceJobId", "source_job_id"),
    jobId: field("jobId", "job_id"),
    title: field("title", "title"),
    description: field("description", "description"),
    companyName: field("companyName", "company_name"),
    status: field("status", "status"),
    slug: field("slug", "slug"),
    workArrangement: field("workArrangement", "work_arrangement"),
    employmentType: field("employmentType", "employment_type"),
    engagementType: field("engagementType", "engagement_type"),
    experienceLevel: field("experienceLevel", "experience_level"),
    salaryMin: field("salaryMin", "salary_min"),
    salaryMax: field("salaryMax", "salary_max"),
    currencyCode: field("currencyCode", "currency_code"),
    payPeriod: field("payPeriod", "pay_period"),
    applicationUrl: field("applicationUrl", "application_url"),
    sourceUrl: field("sourceUrl", "source_url"),
    postedAt: field("postedAt", "posted_at"),
    validThrough: field("validThrough", "valid_through"),
    lastSeenAt: field("lastSeenAt", "last_seen_at"),
    lastVerifiedAt: field("lastVerifiedAt", "last_verified_at"),
    locations: field("locations", "locations"),
    eligibilityScope: field("eligibilityScope", "eligibility_scope"),
    eligibilityEvidence: field("eligibilityEvidence", "eligibility_evidence"),
    eligibilityProvenance: field(
      "eligibilityProvenance",
      "eligibility_provenance",
    ),
    sourceName: field("sourceName", "source_name"),
    sourceAdapter: field("sourceAdapter", "source_adapter"),
    sourceAuthority: field("sourceAuthority", "source_authority"),
    sourceTermsUrl: field("sourceTermsUrl", "source_terms_url"),
    sourceTermsReviewedAt: field(
      "sourceTermsReviewedAt",
      "source_terms_reviewed_at",
    ),
  } satisfies DuplicateJobSide;
}

function mapDetail(row: DuplicateDetailRow): DuplicateCandidateDetail {
  return {
    id: row.candidate_id,
    status: row.candidate_status,
    version: row.candidate_version,
    titleSimilarity: row.title_similarity,
    detectionReason: row.detection_reason,
    firstApplicationHost: row.left_application_host,
    secondApplicationHost: row.right_application_host,
    createdAt: row.candidate_created_at,
    reviewedAt: row.candidate_reviewed_at,
    resolutionReason: row.resolution_reason,
    canonicalJobId: row.canonical_job_id,
    first: mapSide(row, "first"),
    second: mapSide(row, "second"),
  };
}

export async function getDuplicateCandidateDetailResult(
  candidateId: string,
): Promise<RepositoryResult<DuplicateCandidateDetail | null>> {
  if (!z.uuid().safeParse(candidateId).success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "invalid_rows",
        "duplicate_candidate_id_invalid",
      ),
    );
  }
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "query_failed",
        "duplicate_candidate_query_failed",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "not_configured",
        "duplicate_candidate_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc(
      "admin_get_duplicate_candidate" as never,
      {
        p_candidate_id: candidateId,
      } as never,
    ),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "query_failed",
        "duplicate_candidate_query_failed",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  const rawData: unknown = data;
  if (error || !Array.isArray(rawData)) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        error ? "query_failed" : "invalid_container",
        error
          ? "duplicate_candidate_query_failed"
          : "duplicate_candidate_invalid_container",
        error,
      ),
    );
  }
  if (rawData.length === 0) return repositoryReady(null);
  if (rawData.length !== 1) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "invalid_container",
        "duplicate_candidate_ambiguous",
      ),
    );
  }
  const parsed = duplicateDetailRowSchema.safeParse(rawData[0]);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        "admin.duplicate_detail",
        "invalid_rows",
        "duplicate_candidate_invalid_row",
      ),
    );
  }
  return repositoryReady(mapDetail(parsed.data));
}
