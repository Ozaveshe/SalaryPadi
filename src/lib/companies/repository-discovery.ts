import "server-only";

import { companyEvidenceRowSchema } from "@/lib/companies/contracts";
import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryIssue,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const COMPANY_EVIDENCE_MAX_FUTURE_SKEW_MS = 5 * 60_000;

export interface CompanyPublishedEvidence {
  companySlug: string;
  lastModified: string | null;
}

type CompanyEvidenceTable =
  | "company_reviews"
  | "interview_experiences"
  | "company_ratings"
  | "company_benefits"
  | "salary_aggregates"
  | "employer_responses";

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

async function readCompanyEvidencePage(
  supabase: ServerSupabaseClient,
  table: CompanyEvidenceTable,
  from: number,
  to: number,
): Promise<{ data: unknown; error: unknown }> {
  const api = supabase.schema("api");
  switch (table) {
    case "company_reviews":
      return api
        .from("company_reviews")
        .select("id,company_slug,published_at")
        .order("id", { ascending: true })
        .range(from, to);
    case "interview_experiences":
      return api
        .from("interview_experiences")
        .select("id,company_slug,published_at")
        .order("id", { ascending: true })
        .range(from, to);
    case "company_ratings":
      return api
        .from("company_ratings")
        .select("id,company_slug,computed_at")
        .order("id", { ascending: true })
        .range(from, to);
    case "company_benefits":
      return api
        .from("company_benefits")
        .select("id,company_slug,last_verified_at,source_kind")
        .eq("source_kind", "community_reported")
        .order("id", { ascending: true })
        .range(from, to);
    case "salary_aggregates":
      return api
        .from("salary_aggregates")
        .select("id,company_slug,calculated_at")
        .not("company_slug", "is", null)
        .order("id", { ascending: true })
        .range(from, to);
    case "employer_responses":
      return api
        .from("employer_responses" as never)
        .select("id,company_slug,published_at")
        .order("id", { ascending: true })
        .range(from, to) as never;
  }
}

async function readAllCompanyEvidenceRows(
  supabase: ServerSupabaseClient,
  table: CompanyEvidenceTable,
) {
  const rows: unknown[] = [];
  const issues: RepositoryIssue[] = [];
  let hasValidPage = false;
  const pageSize = 1_000;
  const maximumPages = 40;
  for (let page = 0; page < maximumPages; page += 1) {
    const from = page * pageSize;
    const pageAttempt = await attemptRepositoryOperation(() =>
      readCompanyEvidencePage(supabase, table, from, from + pageSize - 1),
    );
    if (!pageAttempt.ok) {
      issues.push(
        repositoryIssue(
          `companies.discovery.${table}`,
          "query_failed",
          "company_discovery_query_failed",
          pageAttempt.error,
        ),
      );
      break;
    }
    const { data, error } = pageAttempt.value;
    if (error || !Array.isArray(data)) {
      issues.push(
        repositoryIssue(
          `companies.discovery.${table}`,
          error ? "query_failed" : "invalid_container",
          error
            ? "company_discovery_query_failed"
            : "company_discovery_invalid_container",
          error,
        ),
      );
      break;
    }
    hasValidPage = true;
    rows.push(...data);
    if (data.length < pageSize) break;
    if (page === maximumPages - 1) {
      issues.push(
        repositoryIssue(
          `companies.discovery.${table}`,
          "invalid_container",
          "company_discovery_capacity_exceeded",
        ),
      );
    }
  }
  return { rows, issues, hasValidPage };
}

function newerTimestamp(current: string | null, candidate: string | null) {
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

export async function getPublishedCompanyEvidenceResult(
  now = new Date(),
): Promise<RepositoryResult<CompanyPublishedEvidence[]>> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "companies.discovery",
        "query_failed",
        "company_discovery_query_failed",
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
        "companies.discovery",
        "not_configured",
        "company_discovery_backend_unconfigured",
      ),
    );
  }

  const tableResults = await Promise.all(
    [
      "company_reviews",
      "interview_experiences",
      "company_ratings",
      "company_benefits",
      "salary_aggregates",
      "employer_responses",
    ].map((table) =>
      readAllCompanyEvidenceRows(supabase, table as CompanyEvidenceTable),
    ),
  );
  const evidence = new Map<string, CompanyPublishedEvidence>();
  const issues = tableResults.flatMap((result) => result.issues);
  let rejected = 0;
  const nowValue = now.valueOf();
  for (const row of tableResults.flatMap((result) => result.rows)) {
    const parsed = companyEvidenceRowSchema.safeParse(row);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }
    const item = parsed.data;
    if (!item.company_slug) continue;
    if (
      item.source_kind !== undefined &&
      item.source_kind !== "community_reported"
    ) {
      continue;
    }
    const timestamp =
      item.published_at ??
      item.computed_at ??
      item.calculated_at ??
      item.last_verified_at ??
      null;
    if (
      !Number.isFinite(nowValue) ||
      (timestamp !== null &&
        Date.parse(timestamp) > nowValue + COMPANY_EVIDENCE_MAX_FUTURE_SKEW_MS)
    ) {
      rejected += 1;
      continue;
    }
    const current = evidence.get(item.company_slug);
    evidence.set(item.company_slug, {
      companySlug: item.company_slug,
      lastModified: newerTimestamp(current?.lastModified ?? null, timestamp),
    });
  }
  if (rejected > 0) {
    issues.push(
      repositoryIssue(
        "companies.discovery",
        "invalid_rows",
        "company_discovery_invalid_rows",
      ),
    );
  }
  const data = [...evidence.values()].toSorted((a, b) =>
    a.companySlug.localeCompare(b.companySlug),
  );
  if (
    issues.length > 0 &&
    tableResults.every((result) => !result.hasValidPage)
  ) {
    return { state: "unavailable", data, issues };
  }
  return issues.length > 0
    ? repositoryDegraded(data, issues)
    : repositoryReady(data);
}
