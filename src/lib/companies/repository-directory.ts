import "server-only";

import { z } from "zod";

import {
  companyLocationSchema,
  companyRowSchema,
  type CompanyAlias,
  type CompanyCitation,
  type CompanyLegalEntity,
  type CompanyOfficialDomain,
} from "@/lib/companies/contracts";
import {
  getAfricanCompanyCatalogEntry,
  getAfricanCompanySelection,
  type AfricanCompanyCatalogEntry,
} from "@/lib/companies/catalog";
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
import { getLiveJobFeed } from "@/lib/jobs/repository";
import type { Job, JobFeedResult } from "@/lib/jobs/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  catalog?:
    | (Pick<
        AfricanCompanyCatalogEntry,
        "rank" | "marketCountryCode" | "marketCountry" | "region"
      > & {
        selectionTitle: string;
        selectionUrl: string;
        dataAsOf: string;
      })
    | null;
  activeJobs: Job[];
  categories: string[];
  remoteLocations: string[];
  verification: "source_listed" | "employer_verified" | "unverified";
  lastCheckedAt: string;
}

function mapVerification(
  value: string,
  citations: CompanyCitation[],
): CompanySummary["verification"] {
  if (value === "domain_verified" || value === "organization_verified") {
    return "employer_verified";
  }
  return citations.length > 0 ? "source_listed" : "unverified";
}

function formatCompanyLocation(
  location: z.infer<typeof companyLocationSchema>,
) {
  return [location.city, location.region, location.country_code]
    .filter(Boolean)
    .join(", ");
}

function getCatalogMetadata(slug: string): CompanySummary["catalog"] {
  const entry = getAfricanCompanyCatalogEntry(slug);
  if (!entry) return null;
  const selection = getAfricanCompanySelection();
  return {
    rank: entry.rank,
    marketCountryCode: entry.marketCountryCode,
    marketCountry: entry.marketCountry,
    region: entry.region,
    selectionTitle: selection.title,
    selectionUrl: selection.url,
    dataAsOf: selection.dataAsOf,
  };
}

async function getDatabaseCompaniesResult(): Promise<
  RepositoryResult<CompanySummary[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "companies.list",
        "query_failed",
        "companies_query_failed",
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
        "companies.list",
        "not_configured",
        "companies_backend_unconfigured",
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    supabase
      .schema("api")
      .from("companies")
      .select("*")
      .order("display_name")
      .limit(501),
  );
  if (!queryAttempt.ok) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "companies.list",
        "query_failed",
        "companies_query_failed",
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
        "companies.list",
        error ? "query_failed" : "invalid_container",
        error ? "companies_query_failed" : "companies_invalid_container",
        error,
      ),
    );
  }
  const overflow = data.length > 500;
  const boundedData = data.slice(0, 500);
  const decodedCompanies = boundedData.flatMap((row) => {
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
        catalog: getCatalogMetadata(company.slug),
        activeJobs: [],
        categories: [],
        remoteLocations: company.locations
          .map(formatCompanyLocation)
          .filter(Boolean),
        verification: mapVerification(
          company.verification_status,
          company.citations,
        ),
        lastCheckedAt: company.updated_at,
      } satisfies CompanySummary,
    ];
  });
  const companiesBySlug = new Map<string, CompanySummary>();
  let duplicateSlugs = false;
  for (const company of decodedCompanies) {
    if (companiesBySlug.has(company.slug)) {
      duplicateSlugs = true;
      continue;
    }
    companiesBySlug.set(company.slug, company);
  }
  const companies = [...companiesBySlug.values()];
  const issues: RepositoryIssue[] = [];
  if (decodedCompanies.length !== boundedData.length) {
    issues.push(
      repositoryIssue(
        "companies.list",
        "invalid_rows",
        "companies_invalid_rows",
      ),
    );
  }
  if (duplicateSlugs) {
    issues.push(
      repositoryIssue(
        "companies.list",
        "invalid_rows",
        "companies_duplicate_slugs",
      ),
    );
  }
  if (overflow) {
    issues.push(
      repositoryIssue(
        "companies.list",
        "invalid_container",
        "companies_capacity_exceeded",
      ),
    );
  }
  return issues.length > 0
    ? repositoryDegraded(companies, issues)
    : repositoryReady(companies);
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
      catalog: getCatalogMetadata(job.company.slug),
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
