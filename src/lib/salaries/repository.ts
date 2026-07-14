import "server-only";

import { unstable_rethrow } from "next/navigation";

import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryIssue,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import {
  decodePublicSalaryAggregate,
  type PublicSalaryAggregate,
} from "@/lib/salaries/aggregate-row";
import {
  parseSalaryCellProgress,
  type SalaryCellProgress,
} from "@/lib/salaries/progress";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type { PublicSalaryAggregate } from "@/lib/salaries/aggregate-row";

function mapAggregateRows(rows: unknown[]) {
  const seenIds = new Set<string>();
  let rejected = 0;
  let duplicates = 0;
  const mapped = rows.flatMap((row) => {
    const decoded = decodePublicSalaryAggregate(row);
    if (!decoded.ok) {
      rejected += 1;
      return [];
    }
    if (seenIds.has(decoded.aggregate.id)) {
      duplicates += 1;
      return [];
    }
    seenIds.add(decoded.aggregate.id);
    return [decoded.aggregate];
  });
  return { mapped, rejected, duplicates };
}

async function captureSalaryRead<T>({
  operation,
  code,
  fallback,
  read,
}: {
  operation: string;
  code: string;
  fallback: T;
  read: () => Promise<RepositoryResult<T>>;
}): Promise<RepositoryResult<T>> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    return repositoryFailure(
      "unavailable",
      fallback,
      repositoryIssue(operation, "query_failed", code, error),
    );
  }
}

function normalizeRoleSlug(role: string): string {
  return role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

interface SalaryCellProgressFilters {
  role: string;
  country: string;
}

async function getSalaryCellProgressResultUnchecked({
  role,
  country,
}: SalaryCellProgressFilters): Promise<
  RepositoryResult<SalaryCellProgress | null>
> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure<SalaryCellProgress | null>(
      "unconfigured",
      null,
      repositoryIssue(
        "salaries.progress",
        "not_configured",
        "salary_progress_backend_unconfigured",
      ),
    );
  }

  const { data, error } = await supabase
    .schema("api")
    .rpc("get_salary_cell_progress", {
      p_role_slug: normalizeRoleSlug(role),
      p_country_code: country.trim().toUpperCase(),
    });
  if (error || !Array.isArray(data)) {
    return repositoryFailure<SalaryCellProgress | null>(
      "unavailable",
      null,
      repositoryIssue(
        "salaries.progress",
        error ? "query_failed" : "invalid_container",
        error
          ? "salary_progress_query_failed"
          : "salary_progress_invalid_container",
        error,
      ),
    );
  }
  if (data.length === 0)
    return repositoryReady<SalaryCellProgress | null>(null);
  if (data.length !== 1) {
    return repositoryFailure<SalaryCellProgress | null>(
      "invalid",
      null,
      repositoryIssue(
        "salaries.progress",
        "invalid_rows",
        "salary_progress_invalid_rows",
      ),
    );
  }
  const progress = parseSalaryCellProgress(data[0]);
  if (!progress) {
    return repositoryFailure<SalaryCellProgress | null>(
      "invalid",
      null,
      repositoryIssue(
        "salaries.progress",
        "invalid_rows",
        "salary_progress_privacy_gate_rejected",
      ),
    );
  }
  return repositoryReady<SalaryCellProgress | null>(progress);
}

export function getSalaryCellProgressResult(
  filters: SalaryCellProgressFilters,
): Promise<RepositoryResult<SalaryCellProgress | null>> {
  return captureSalaryRead({
    operation: "salaries.progress",
    code: "salary_progress_query_failed",
    fallback: null,
    read: () => getSalaryCellProgressResultUnchecked(filters),
  });
}

export interface SalaryAggregateFilters {
  role?: string;
  country?: string;
  company?: string;
}

async function searchSalaryAggregatesResultUnchecked({
  role,
  country,
  company,
}: SalaryAggregateFilters): Promise<RepositoryResult<PublicSalaryAggregate[]>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "salaries.search",
        "not_configured",
        "salaries_backend_unconfigured",
      ),
    );
  }
  let query = supabase
    .schema("api")
    .from("salary_aggregates")
    .select("*")
    .order("calculated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(51);
  if (role) {
    query = query.ilike("role_family", `%${escapeLikePattern(role)}%`);
  }
  if (country) query = query.eq("country_code", country.toUpperCase());
  if (company) query = query.eq("company_slug", company);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "salaries.search",
        error ? "query_failed" : "invalid_container",
        error ? "salaries_query_failed" : "salaries_invalid_container",
        error,
      ),
    );
  }
  const overflow = data.length > 50;
  const { mapped, rejected, duplicates } = mapAggregateRows(data.slice(0, 50));
  const issues: RepositoryIssue[] = [];
  if (rejected > 0) {
    issues.push(
      repositoryIssue(
        "salaries.search",
        "invalid_rows",
        "salaries_invalid_rows",
      ),
    );
  }
  if (duplicates > 0) {
    issues.push(
      repositoryIssue(
        "salaries.search",
        "invalid_rows",
        "salaries_duplicate_rows",
      ),
    );
  }
  if (overflow) {
    issues.push(
      repositoryIssue(
        "salaries.search",
        "invalid_container",
        "salaries_capacity_exceeded",
      ),
    );
  }
  return issues.length > 0
    ? repositoryDegraded(mapped, issues)
    : repositoryReady(mapped);
}

export function searchSalaryAggregatesResult(
  filters: SalaryAggregateFilters,
): Promise<RepositoryResult<PublicSalaryAggregate[]>> {
  return captureSalaryRead({
    operation: "salaries.search",
    code: "salaries_query_failed",
    fallback: [],
    read: () => searchSalaryAggregatesResultUnchecked(filters),
  });
}

async function listPublishedSalaryAggregatesResultUnchecked(): Promise<
  RepositoryResult<PublicSalaryAggregate[]>
> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "salaries.sitemap",
        "not_configured",
        "salaries_backend_unconfigured",
      ),
    );
  }

  const rows: unknown[] = [];
  const pageSize = 1_000;
  const maximumPages = 40;
  for (let page = 0; page < maximumPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .schema("api")
      .from("salary_aggregates")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data)) {
      return repositoryFailure(
        "unavailable",
        [],
        repositoryIssue(
          "salaries.sitemap",
          error ? "query_failed" : "invalid_container",
          error
            ? "salary_sitemap_query_failed"
            : "salary_sitemap_invalid_container",
          error,
        ),
      );
    }
    rows.push(...data);
    if (data.length < pageSize) break;
    if (page === maximumPages - 1) {
      return repositoryFailure(
        "invalid",
        [],
        repositoryIssue(
          "salaries.sitemap",
          "invalid_container",
          "salary_sitemap_capacity_exceeded",
        ),
      );
    }
  }

  const { mapped, rejected, duplicates } = mapAggregateRows(rows);
  const issues: RepositoryIssue[] = [];
  if (rejected > 0) {
    issues.push(
      repositoryIssue(
        "salaries.sitemap",
        "invalid_rows",
        "salary_sitemap_invalid_rows",
      ),
    );
  }
  if (duplicates > 0) {
    issues.push(
      repositoryIssue(
        "salaries.sitemap",
        "invalid_rows",
        "salary_sitemap_duplicate_rows",
      ),
    );
  }
  return issues.length > 0
    ? repositoryDegraded(mapped, issues)
    : repositoryReady(mapped);
}

export function listPublishedSalaryAggregatesResult(): Promise<
  RepositoryResult<PublicSalaryAggregate[]>
> {
  return captureSalaryRead({
    operation: "salaries.sitemap",
    code: "salary_sitemap_query_failed",
    fallback: [],
    read: listPublishedSalaryAggregatesResultUnchecked,
  });
}

export async function searchSalaryAggregates(
  filters: Parameters<typeof searchSalaryAggregatesResult>[0],
): Promise<PublicSalaryAggregate[]> {
  return (await searchSalaryAggregatesResult(filters)).data;
}
