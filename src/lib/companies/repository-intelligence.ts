import "server-only";

import { z } from "zod";

import {
  benefitSchema,
  companyRatingThresholdSchema,
  employerResponseSchema,
  interviewSchema,
  ratingSchema,
  reviewSchema,
} from "@/lib/companies/contracts";
import {
  mapRepositoryResult,
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryIssue,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CompanyIntelligenceTable =
  | "company_reviews"
  | "interview_experiences"
  | "company_ratings"
  | "company_benefits"
  | "employer_responses";

async function readCompanyRowsResult<T>(
  table: CompanyIntelligenceTable,
  slug: string,
  schema: z.ZodType<T>,
  options: { maximumRows?: number; rejectOverflow?: boolean } = {},
): Promise<RepositoryResult<T[]>> {
  const operation = `companies.${table}`;
  const maximumRows = options.maximumRows ?? 100;
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        "company_intelligence_query_failed",
        clientAttempt.error,
      ),
    );
  }
  const supabase = clientAttempt.value;
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        operation,
        "not_configured",
        "company_intelligence_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from(table as never)
      .select("*")
      .eq("company_slug", slug)
      .limit(maximumRows + 1),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        "company_intelligence_query_failed",
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
        operation,
        error ? "query_failed" : "invalid_container",
        error
          ? "company_intelligence_query_failed"
          : "company_intelligence_invalid_container",
        error,
      ),
    );
  }
  const overflow = data.length > maximumRows;
  if (overflow && options.rejectOverflow) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        operation,
        "invalid_container",
        "company_intelligence_capacity_exceeded",
      ),
    );
  }
  const boundedData = data.slice(0, maximumRows);
  const decodedRows = boundedData.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const seenIds = new Set<string>();
  let duplicateRows = false;
  const rows = decodedRows.filter((row) => {
    if (
      typeof row !== "object" ||
      row === null ||
      !("id" in row) ||
      typeof row.id !== "string"
    ) {
      return true;
    }
    if (seenIds.has(row.id)) {
      duplicateRows = true;
      return false;
    }
    seenIds.add(row.id);
    return true;
  });
  const issues: RepositoryIssue[] = [];
  if (decodedRows.length !== boundedData.length) {
    issues.push(
      repositoryIssue(
        operation,
        "invalid_rows",
        "company_intelligence_invalid_rows",
      ),
    );
  }
  if (duplicateRows) {
    issues.push(
      repositoryIssue(
        operation,
        "invalid_rows",
        "company_intelligence_duplicate_rows",
      ),
    );
  }
  if (overflow) {
    issues.push(
      repositoryIssue(
        operation,
        "invalid_container",
        "company_intelligence_capacity_exceeded",
      ),
    );
  }
  return issues.length > 0
    ? repositoryDegraded(rows, issues)
    : repositoryReady(rows);
}

export async function getCompanyReviewsResult(slug: string) {
  return mapRepositoryResult(
    await readCompanyRowsResult("company_reviews", slug, reviewSchema),
    (rows) =>
      rows.toSorted(
        (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
      ),
  );
}

export async function getCompanyReviews(slug: string) {
  return (await getCompanyReviewsResult(slug)).data;
}

export async function getInterviewExperiencesResult(slug: string) {
  return mapRepositoryResult(
    await readCompanyRowsResult("interview_experiences", slug, interviewSchema),
    (rows) =>
      rows.toSorted(
        (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
      ),
  );
}

export async function getInterviewExperiences(slug: string) {
  return (await getInterviewExperiencesResult(slug)).data;
}

export async function getCompanyRatingResult(slug: string) {
  return mapRepositoryResult(
    await readCompanyRowsResult("company_ratings", slug, ratingSchema, {
      maximumRows: 1,
      rejectOverflow: true,
    }),
    (rows) => rows[0] ?? null,
  );
}

export async function getCompanyRating(slug: string) {
  return (await getCompanyRatingResult(slug)).data;
}

export async function getCompanyRatingMinimumSampleResult() {
  const operation = "companies.rating_threshold";
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        operation,
        "query_failed",
        "company_rating_threshold_query_failed",
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
        operation,
        "not_configured",
        "company_rating_threshold_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from("privacy_thresholds")
      .select("metric,min_distinct_contributors")
      .eq("metric", "company_overall_rating")
      .maybeSingle(),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        operation,
        "query_failed",
        "company_rating_threshold_query_failed",
        queryAttempt.error,
      ),
    );
  }
  const { data, error } = queryAttempt.value;
  if (error || !data) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        operation,
        error ? "query_failed" : "invalid_container",
        error
          ? "company_rating_threshold_query_failed"
          : "company_rating_threshold_missing",
        error,
      ),
    );
  }
  const parsed = companyRatingThresholdSchema.safeParse(data);
  if (!parsed.success) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        operation,
        "invalid_rows",
        "company_rating_threshold_invalid",
        parsed.error,
      ),
    );
  }
  return repositoryReady(parsed.data.min_distinct_contributors);
}

export async function getCompanyBenefitsResult(slug: string) {
  return readCompanyRowsResult("company_benefits", slug, benefitSchema);
}

export async function getCompanyBenefits(slug: string) {
  return (await getCompanyBenefitsResult(slug)).data;
}

export async function getEmployerResponsesResult(slug: string) {
  return mapRepositoryResult(
    await readCompanyRowsResult(
      "employer_responses",
      slug,
      employerResponseSchema,
    ),
    (rows) =>
      rows.toSorted(
        (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
      ),
  );
}

export async function getEmployerResponses(slug: string) {
  return (await getEmployerResponsesResult(slug)).data;
}
