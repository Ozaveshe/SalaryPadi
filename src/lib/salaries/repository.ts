import "server-only";

import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  sampleSize: number;
  submissionMonthStart: string;
  submissionMonthEnd: string;
  confidence: "low" | "medium" | "high";
  calculatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapAggregate(row: unknown): PublicSalaryAggregate | null {
  if (
    !isRecord(row) ||
    typeof row.id !== "string" ||
    typeof row.role_slug !== "string" ||
    typeof row.role_family !== "string" ||
    typeof row.country_code !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.median_annual !== "number" ||
    typeof row.sample_size !== "number" ||
    row.sample_size < 3
  )
    return null;

  return {
    id: row.id,
    companySlug: typeof row.company_slug === "string" ? row.company_slug : null,
    roleSlug: row.role_slug,
    roleFamily: row.role_family,
    countryCode: row.country_code,
    seniority: typeof row.seniority === "string" ? row.seniority : "all",
    arrangement: typeof row.arrangement === "string" ? row.arrangement : "all",
    currency: row.currency,
    grossNet:
      row.gross_net === "gross" || row.gross_net === "net"
        ? row.gross_net
        : "mixed",
    medianAnnual: row.median_annual,
    percentile25Annual:
      typeof row.percentile_25_annual === "number"
        ? row.percentile_25_annual
        : null,
    percentile75Annual:
      typeof row.percentile_75_annual === "number"
        ? row.percentile_75_annual
        : null,
    sampleSize: row.sample_size,
    submissionMonthStart:
      typeof row.submission_month_start === "string"
        ? row.submission_month_start
        : "Unknown",
    submissionMonthEnd:
      typeof row.submission_month_end === "string"
        ? row.submission_month_end
        : "Unknown",
    confidence:
      row.confidence === "high" || row.confidence === "medium"
        ? row.confidence
        : "low",
    calculatedAt:
      typeof row.calculated_at === "string"
        ? row.calculated_at
        : new Date(0).toISOString(),
  };
}

export async function searchSalaryAggregatesResult({
  role,
  country,
  company,
}: {
  role?: string;
  country?: string;
  company?: string;
}) {
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
    .limit(50);
  if (role) query = query.ilike("role_family", `%${role}%`);
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
  const mapped = data
    .map((row) => mapAggregate(row))
    .filter((row): row is PublicSalaryAggregate => row !== null);
  if (mapped.length !== data.length) {
    return repositoryDegraded(mapped, [
      repositoryIssue(
        "salaries.search",
        "invalid_rows",
        "salaries_invalid_rows",
      ),
    ]);
  }
  return repositoryReady(mapped);
}

export async function searchSalaryAggregates(
  filters: Parameters<typeof searchSalaryAggregatesResult>[0],
): Promise<PublicSalaryAggregate[]> {
  return (await searchSalaryAggregatesResult(filters)).data;
}
