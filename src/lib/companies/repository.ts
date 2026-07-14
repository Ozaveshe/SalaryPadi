import "server-only";

import { z } from "zod";

import {
  benefitSchema,
  companyEvidenceRowSchema,
  companyLocationSchema,
  companyRatingThresholdSchema,
  companyRowSchema,
  employerResponseSchema,
  interviewSchema,
  ratingSchema,
  reviewSchema,
  type CompanyAlias,
  type CompanyCitation,
  type CompanyLegalEntity,
  type CompanyOfficialDomain,
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
import { getLiveJobFeed } from "@/lib/jobs/repository";
import type { Job, JobFeedResult } from "@/lib/jobs/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type {
  CompanyBenefit,
  CompanyRating,
  CompanyReview,
  EmployerResponse,
  InterviewExperience,
} from "@/lib/companies/contracts";

export interface CompanyPublishedEvidence {
  companySlug: string;
  lastModified: string | null;
}

export interface CompanySummary {
  databaseId: string | null;
  name: string;
  slug: string;
  websiteUrl: string | null;
  industry: string | null;
  sizeBand: string | null;
  description: string | null;
  headquartersCountry: string | null;
  legalEntities: CompanyLegalEntity[];
  aliases: CompanyAlias[];
  officialDomains: CompanyOfficialDomain[];
  citations: CompanyCitation[];
  activeJobs: Job[];
  categories: string[];
  remoteLocations: string[];
  verification: "source_listed" | "employer_verified" | "unverified";
  lastCheckedAt: string;
}

function mapVerification(value: string): CompanySummary["verification"] {
  return value === "domain_verified" || value === "organization_verified"
    ? "employer_verified"
    : "unverified";
}

function formatCompanyLocation(
  location: z.infer<typeof companyLocationSchema>,
) {
  return [location.city, location.region, location.country_code]
    .filter(Boolean)
    .join(", ");
}

async function getDatabaseCompaniesResult(): Promise<
  RepositoryResult<CompanySummary[]>
> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(
        "companies.list",
        "not_configured",
        "companies_backend_unconfigured",
      ),
    );
  }
  const { data, error } = await supabase
    .schema("api")
    .from("companies")
    .select("*")
    .order("display_name")
    .limit(500);
  if (error || !Array.isArray(data)) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "companies.list",
        error ? "query_failed" : "invalid_container",
        error ? "companies_query_failed" : "companies_invalid_container",
        error,
      ),
    );
  }
  const companies = data.flatMap((row) => {
    const parsed = companyRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const company = parsed.data;
    return [
      {
        databaseId: company.id,
        name: company.display_name,
        slug: company.slug,
        websiteUrl: company.website_url,
        industry: company.industry,
        sizeBand: company.size_band,
        description: company.description,
        headquartersCountry: company.headquarters_country,
        legalEntities: company.legal_entities,
        aliases: company.aliases,
        officialDomains: company.official_domains,
        citations: company.citations,
        activeJobs: [],
        categories: [],
        remoteLocations: company.locations
          .map(formatCompanyLocation)
          .filter(Boolean),
        verification: mapVerification(company.verification_status),
        lastCheckedAt: company.updated_at,
      } satisfies CompanySummary,
    ];
  });
  if (companies.length !== data.length) {
    return repositoryDegraded(companies, [
      repositoryIssue(
        "companies.list",
        "invalid_rows",
        "companies_invalid_rows",
      ),
    ]);
  }
  return repositoryReady(companies);
}

export async function getCompaniesResult(
  suppliedFeed?: JobFeedResult | Promise<JobFeedResult>,
): Promise<RepositoryResult<CompanySummary[]>> {
  const [feed, databaseResult] = await Promise.all([
    suppliedFeed ?? getLiveJobFeed(),
    getDatabaseCompaniesResult(),
  ]);
  const databaseCompanies = databaseResult.data;
  const grouped = new Map(
    databaseCompanies.map((company) => [company.slug, company]),
  );

  for (const job of feed.jobs) {
    const current = grouped.get(job.company.slug);
    if (current) {
      current.activeJobs.push(job);
      if (job.category && !current.categories.includes(job.category))
        current.categories.push(job.category);
      if (!current.remoteLocations.includes(job.locationDisplay))
        current.remoteLocations.push(job.locationDisplay);
      if (Date.parse(job.lastCheckedAt) > Date.parse(current.lastCheckedAt))
        current.lastCheckedAt = job.lastCheckedAt;
      if (job.company.verification === "employer_verified")
        current.verification = "employer_verified";
      continue;
    }

    grouped.set(job.company.slug, {
      databaseId: null,
      name: job.company.name,
      slug: job.company.slug,
      websiteUrl: null,
      industry: null,
      sizeBand: null,
      description: null,
      headquartersCountry: null,
      legalEntities: [],
      aliases: [],
      officialDomains: [],
      citations: [],
      activeJobs: [job],
      categories: job.category ? [job.category] : [],
      remoteLocations: [job.locationDisplay],
      verification: job.company.verification,
      lastCheckedAt: job.lastCheckedAt,
    });
  }

  const companies = [...grouped.values()].toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );
  const issues: RepositoryIssue[] = [...databaseResult.issues];
  if (feed.state === "unavailable" || feed.state === "degraded") {
    issues.push(
      repositoryIssue(
        "companies.jobs",
        "upstream_unavailable",
        feed.sources.find(
          (source) =>
            source.state === "unavailable" || source.state === "degraded",
        )?.code ?? "companies_job_feed_degraded",
      ),
    );
  }
  if (issues.length === 0) return repositoryReady(companies);
  if (companies.length > 0) return repositoryDegraded(companies, issues);
  const onlyUnconfigured = issues.every(
    (issue) => issue.kind === "not_configured",
  );
  return {
    state: onlyUnconfigured ? "unconfigured" : "unavailable",
    data: companies,
    issues,
  };
}

export async function getCompanies(): Promise<CompanySummary[]> {
  return (await getCompaniesResult()).data;
}

export async function getCompany(slug: string) {
  return (await getCompanyResult(slug)).data;
}

export async function getCompanyResult(slug: string) {
  return mapRepositoryResult(
    await getCompaniesResult(),
    (companies) => companies.find((company) => company.slug === slug) ?? null,
  );
}

async function readCompanyRowsResult<T>(
  table:
    | "company_reviews"
    | "interview_experiences"
    | "company_ratings"
    | "company_benefits"
    | "employer_responses",
  slug: string,
  schema: z.ZodType<T>,
): Promise<RepositoryResult<T[]>> {
  const supabase = await createServerSupabaseClient();
  const operation = `companies.${table}`;
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
  const { data, error } = await supabase
    .schema("api")
    .from(table as never)
    .select("*")
    .eq("company_slug", slug)
    .limit(100);
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
  const rows = data.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  if (rows.length !== data.length) {
    return repositoryDegraded(rows, [
      repositoryIssue(
        operation,
        "invalid_rows",
        "company_intelligence_invalid_rows",
      ),
    ]);
  }
  return repositoryReady(rows);
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
    await readCompanyRowsResult("company_ratings", slug, ratingSchema),
    (rows) => rows[0] ?? null,
  );
}

export async function getCompanyRating(slug: string) {
  return (await getCompanyRatingResult(slug)).data;
}

export async function getCompanyRatingMinimumSampleResult() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        "companies.rating_threshold",
        "not_configured",
        "company_rating_threshold_backend_unconfigured",
      ),
    );
  }
  const { data, error } = await supabase
    .schema("api")
    .from("privacy_thresholds")
    .select("metric,min_distinct_contributors")
    .eq("metric", "company_overall_rating")
    .maybeSingle();
  if (error || !data) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "companies.rating_threshold",
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
        "companies.rating_threshold",
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
  const pageSize = 1_000;
  const maximumPages = 40;
  for (let page = 0; page < maximumPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await readCompanyEvidencePage(
      supabase,
      table,
      from,
      from + pageSize - 1,
    );
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
  return { rows, issues };
}

function newerTimestamp(current: string | null, candidate: string | null) {
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return current;
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

export async function getPublishedCompanyEvidenceResult(): Promise<
  RepositoryResult<CompanyPublishedEvidence[]>
> {
  const supabase = await createServerSupabaseClient();
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
  return issues.length > 0
    ? repositoryDegraded(data, issues)
    : repositoryReady(data);
}
