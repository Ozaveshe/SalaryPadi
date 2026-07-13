import type { MetadataRoute } from "next";

import type {
  CompanyPublishedEvidence,
  CompanySummary,
} from "@/lib/companies/repository";
import type { RepositoryResult } from "@/lib/data/repository-result";
import type { EditorialArticle } from "@/lib/editorial/repository";
import type { JobFeedResult } from "@/lib/jobs/types";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

import {
  canIndexCompanyDetail,
  canIndexCompanyHub,
  canIndexSalaryDetail,
  canIndexSalaryHub,
  hasIndexableActiveJob,
} from "./indexability";
import { canIndexJobDetail } from "./job-posting";

const staticRoutes = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/methodology", changeFrequency: "monthly", priority: 0.7 },
  { path: "/trust-and-safety", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.5 },
] as const;

interface BuildSitemapInput {
  origin: string;
  editorial: EditorialArticle[];
  jobFeed: JobFeedResult;
  salaryAggregates: RepositoryResult<PublicSalaryAggregate[]>;
  companies: RepositoryResult<CompanySummary[]>;
  companyEvidence: CompanyPublishedEvidence[];
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function absoluteUrl(origin: string, path: string) {
  return `${normalizeOrigin(origin)}${path}`;
}

function normalizedTimestamp(value: string | null | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function newestTimestamp(values: Array<string | null | undefined>) {
  let newest: string | undefined;
  for (const value of values) {
    const normalized = normalizedTimestamp(value);
    if (
      normalized &&
      (!newest || Date.parse(normalized) > Date.parse(newest))
    ) {
      newest = normalized;
    }
  }
  return newest;
}

function sitemapEntry({
  url,
  lastModified,
  changeFrequency,
  priority,
}: {
  url: string;
  lastModified?: string;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  priority: number;
}): MetadataRoute.Sitemap[number] {
  return {
    url,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
  };
}

export function buildSitemapEntries({
  origin,
  editorial,
  jobFeed,
  salaryAggregates,
  companies,
  companyEvidence,
}: BuildSitemapInput): MetadataRoute.Sitemap {
  const evidenceByCompany = new Map(
    companyEvidence.map((evidence) => [evidence.companySlug, evidence]),
  );
  const guide = editorial.find(
    (article) =>
      article.article_kind === "cornerstone" &&
      article.slug === "remote-jobs-open-to-nigerians",
  );
  const briefs = editorial.filter(
    (article) => article.article_kind === "data_brief",
  );

  const jobs: MetadataRoute.Sitemap = jobFeed.jobs
    .filter(canIndexJobDetail)
    .map((job) =>
      sitemapEntry({
        url: absoluteUrl(origin, `/jobs/${job.slug}`),
        lastModified:
          normalizedTimestamp(job.postedAt) ??
          normalizedTimestamp(job.lastCheckedAt),
        changeFrequency: "daily",
        priority: 0.7,
      }),
    );

  const salaryPagesByPath = new Map<string, string | undefined>();
  if (canIndexSalaryDetail(salaryAggregates)) {
    for (const aggregate of salaryAggregates.data) {
      const path = `/salaries/${aggregate.countryCode.toLowerCase()}/${aggregate.roleSlug.toLowerCase()}`;
      salaryPagesByPath.set(
        path,
        newestTimestamp([salaryPagesByPath.get(path), aggregate.calculatedAt]),
      );
    }
  }
  const salaryPages: MetadataRoute.Sitemap = [...salaryPagesByPath].map(
    ([path, lastModified]) =>
      sitemapEntry({
        url: absoluteUrl(origin, path),
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
  );

  const companyPages: MetadataRoute.Sitemap = companies.data.flatMap(
    (company) => {
      const evidence = evidenceByCompany.get(company.slug);
      if (!canIndexCompanyDetail(company, Boolean(evidence))) return [];
      const indexableJobDates = hasIndexableActiveJob(company)
        ? company.activeJobs
            .filter((job) => job.status === "open" && canIndexJobDetail(job))
            .map((job) => job.postedAt)
        : [];
      return [
        sitemapEntry({
          url: absoluteUrl(origin, `/companies/${company.slug}`),
          lastModified: newestTimestamp([
            company.databaseId ? company.lastCheckedAt : null,
            evidence?.lastModified,
            ...indexableJobDates,
          ]),
          changeFrequency: "weekly",
          priority: 0.7,
        }),
      ];
    },
  );

  const insightPages: MetadataRoute.Sitemap = briefs.map((article) =>
    sitemapEntry({
      url: absoluteUrl(origin, `/insights/${article.slug}`),
      lastModified: newestTimestamp([article.updated_at, article.published_at]),
      changeFrequency: "daily",
      priority: 0.6,
    }),
  );
  const latestSalary = newestTimestamp(
    salaryAggregates.data.map((aggregate) => aggregate.calculatedAt),
  );
  const latestCompany = newestTimestamp(
    companyPages.map((entry) =>
      typeof entry.lastModified === "string"
        ? entry.lastModified
        : entry.lastModified?.toISOString(),
    ),
  );
  const latestInsight = newestTimestamp(
    briefs.flatMap((article) => [article.updated_at, article.published_at]),
  );
  const latestJob = newestTimestamp(
    jobFeed.jobs
      .filter(canIndexJobDetail)
      .map(
        (job) =>
          normalizedTimestamp(job.postedAt) ??
          normalizedTimestamp(job.lastCheckedAt),
      ),
  );
  const dynamicEntries: MetadataRoute.Sitemap = [
    ...(canIndexSalaryHub(salaryAggregates)
      ? [
          sitemapEntry({
            url: absoluteUrl(origin, "/salaries"),
            lastModified: latestSalary,
            changeFrequency: "weekly",
            priority: 0.8,
          }),
        ]
      : []),
    ...(canIndexCompanyHub(companies)
      ? [
          sitemapEntry({
            url: absoluteUrl(origin, "/companies"),
            lastModified: latestCompany,
            changeFrequency: "weekly",
            priority: 0.8,
          }),
        ]
      : []),
  ];
  const staticEntries = staticRoutes.map((route) =>
    sitemapEntry({
      url: absoluteUrl(origin, route.path),
      lastModified:
        route.path === ""
          ? newestTimestamp([
              latestJob,
              latestSalary,
              latestCompany,
              latestInsight,
              guide?.updated_at,
            ])
          : undefined,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }),
  );
  const editorialEntries: MetadataRoute.Sitemap = [
    sitemapEntry({
      url: absoluteUrl(origin, "/guides/remote-jobs-open-to-nigerians"),
      lastModified: newestTimestamp([guide?.updated_at, guide?.published_at]),
      changeFrequency: "weekly",
      priority: 0.7,
    }),
    sitemapEntry({
      url: absoluteUrl(origin, "/insights"),
      lastModified: latestInsight,
      changeFrequency: "daily",
      priority: 0.7,
    }),
    ...insightPages,
  ];

  return [
    ...staticEntries,
    ...dynamicEntries,
    ...jobs,
    ...salaryPages,
    ...companyPages,
    ...editorialEntries,
  ];
}
