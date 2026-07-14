import type { MetadataRoute } from "next";

import type {
  CompanyPublishedEvidence,
  CompanySummary,
} from "@/lib/companies/repository";
import {
  getCountryPack,
  isCountryPackIndexable,
} from "@/lib/country-packs/registry";
import { countryAlternates } from "@/lib/country-packs/routing";
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
import type {
  JobLandingIndexDecision,
  JobLandingMetrics,
} from "./job-landing-pages";
import { canIndexJobDetail } from "./job-posting";

export const SITEMAP_KINDS = [
  "jobs",
  "companies",
  "salaries",
  "tools",
  "guides",
  "insights",
] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];
export type SitemapGroups = Record<SitemapKind, MetadataRoute.Sitemap>;

const coreAndGuideRoutes = [
  {
    path: "",
    lastModified: "2026-07-13T23:37:27.399Z",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/about",
    lastModified: "2026-07-10T02:48:41.000Z",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/methodology",
    lastModified: "2026-07-10T02:48:41.000Z",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/trust-and-safety",
    lastModified: "2026-07-10T09:48:43.000Z",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/privacy",
    lastModified: "2026-07-13T23:37:27.399Z",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/terms",
    lastModified: "2026-07-10T09:48:43.000Z",
    changeFrequency: "monthly",
    priority: 0.5,
  },
] as const;

const toolRoutes = [
  {
    path: "/tools",
    lastModified: "2026-07-13T23:37:27.399Z",
  },
  {
    path: "/tools/take-home-pay",
    lastModified: "2026-07-11T08:54:25.000Z",
  },
  {
    path: "/tools/salary-converter",
    lastModified: "2026-07-11T08:54:25.000Z",
  },
  {
    path: "/tools/offer-compare",
    lastModified: "2026-07-11T08:54:25.000Z",
  },
  {
    path: "/tools/job-scam-checker",
    lastModified: "2026-07-11T08:54:25.000Z",
  },
] as const;

export interface SitemapLandingInput {
  path: string;
  metrics: JobLandingMetrics;
  decision: JobLandingIndexDecision;
}

interface BuildSitemapInput {
  origin: string;
  editorial: EditorialArticle[];
  jobFeed: JobFeedResult;
  salaryAggregates: RepositoryResult<PublicSalaryAggregate[]>;
  companies: RepositoryResult<CompanySummary[]>;
  companyEvidence: CompanyPublishedEvidence[];
  landingPages?: SitemapLandingInput[];
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function absoluteUrl(origin: string, path: string) {
  return `${normalizeOrigin(origin)}${path}`;
}

export function normalizedTimestamp(value: string | null | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

export function newestTimestamp(values: Array<string | null | undefined>) {
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
  const parsedUrl = new URL(url);
  const alternates = countryAlternates(parsedUrl.origin, parsedUrl.pathname);
  return {
    url,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: { languages: alternates.languages },
  };
}

export function buildSitemapGroups({
  origin,
  editorial,
  jobFeed,
  salaryAggregates,
  companies,
  companyEvidence,
  landingPages = [],
}: BuildSitemapInput): SitemapGroups {
  const evidenceByCompany = new Map(
    companyEvidence.map((evidence) => [evidence.companySlug, evidence]),
  );
  const cornerstones = editorial.filter(
    (article) => article.article_kind === "cornerstone",
  );
  const briefs = editorial.filter(
    (article) => article.article_kind === "data_brief",
  );

  const jobs = jobFeed.jobs
    .filter((job) => canIndexJobDetail(job))
    .map((job) =>
      sitemapEntry({
        url: absoluteUrl(origin, `/jobs/${job.slug}`),
        lastModified: newestTimestamp([job.postedAt, job.lastCheckedAt]),
        changeFrequency: "daily",
        priority: 0.7,
      }),
    );
  for (const landing of landingPages) {
    if (!landing.decision.indexable) continue;
    jobs.push(
      sitemapEntry({
        url: absoluteUrl(origin, landing.path),
        lastModified: normalizedTimestamp(landing.metrics.lastModified),
        changeFrequency: "daily",
        priority: 0.8,
      }),
    );
  }

  const salaryPagesByPath = new Map<string, string | undefined>();
  if (canIndexSalaryDetail(salaryAggregates)) {
    for (const aggregate of salaryAggregates.data) {
      const countryPack = getCountryPack(aggregate.countryCode);
      if (!countryPack || !isCountryPackIndexable(countryPack)) continue;
      const path = `/salaries/${aggregate.countryCode.toLowerCase()}/${aggregate.roleSlug.toLowerCase()}`;
      salaryPagesByPath.set(
        path,
        newestTimestamp([salaryPagesByPath.get(path), aggregate.calculatedAt]),
      );
    }
  }
  const salaries: MetadataRoute.Sitemap = [...salaryPagesByPath].map(
    ([path, lastModified]) =>
      sitemapEntry({
        url: absoluteUrl(origin, path),
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
  );
  if (canIndexSalaryHub(salaryAggregates)) {
    salaries.unshift(
      sitemapEntry({
        url: absoluteUrl(origin, "/salaries"),
        lastModified: newestTimestamp(
          salaryAggregates.data.map((aggregate) => aggregate.calculatedAt),
        ),
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    );
  }

  const companyPages: MetadataRoute.Sitemap = companies.data.flatMap(
    (company) => {
      const evidence = evidenceByCompany.get(company.slug);
      if (!canIndexCompanyDetail(company, Boolean(evidence))) return [];
      const indexableJobDates = hasIndexableActiveJob(company)
        ? company.activeJobs
            .filter((job) => canIndexJobDetail(job))
            .flatMap((job) => [job.postedAt, job.lastCheckedAt])
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
  if (canIndexCompanyHub(companies)) {
    companyPages.unshift(
      sitemapEntry({
        url: absoluteUrl(origin, "/companies"),
        lastModified: newestTimestamp(
          companyPages.map((entry) =>
            typeof entry.lastModified === "string"
              ? entry.lastModified
              : entry.lastModified?.toISOString(),
          ),
        ),
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    );
  }

  const latestProductChange = newestTimestamp([
    ...jobFeed.jobs
      .filter((job) => canIndexJobDetail(job))
      .flatMap((job) => [job.postedAt, job.lastCheckedAt]),
    ...salaryAggregates.data.map((aggregate) => aggregate.calculatedAt),
    ...companyEvidence.map((evidence) => evidence.lastModified),
    ...editorial.flatMap((article) => [
      article.updated_at,
      article.published_at,
    ]),
  ]);
  const guides: MetadataRoute.Sitemap = [
    ...coreAndGuideRoutes.map((route) =>
      sitemapEntry({
        url: absoluteUrl(origin, route.path),
        lastModified: newestTimestamp([
          route.lastModified,
          route.path === "" ? latestProductChange : undefined,
        ]),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      }),
    ),
    ...cornerstones.map((article) =>
      sitemapEntry({
        url: absoluteUrl(origin, `/guides/${article.slug}`),
        lastModified: newestTimestamp([
          article.updated_at,
          article.published_at,
        ]),
        changeFrequency: "monthly",
        priority: 0.7,
      }),
    ),
  ];

  const insights: MetadataRoute.Sitemap = briefs.length
    ? [
        sitemapEntry({
          url: absoluteUrl(origin, "/insights"),
          lastModified: newestTimestamp(
            briefs.flatMap((article) => [
              article.updated_at,
              article.published_at,
            ]),
          ),
          changeFrequency: "daily",
          priority: 0.7,
        }),
        ...briefs.map((article) =>
          sitemapEntry({
            url: absoluteUrl(origin, `/insights/${article.slug}`),
            lastModified: newestTimestamp([
              article.updated_at,
              article.published_at,
            ]),
            changeFrequency: "daily",
            priority: 0.6,
          }),
        ),
      ]
    : [];

  return {
    jobs,
    companies: companyPages,
    salaries,
    tools: toolRoutes.map((route) =>
      sitemapEntry({
        url: absoluteUrl(origin, route.path),
        lastModified: route.lastModified,
        changeFrequency: "monthly",
        priority: route.path === "/tools" ? 0.8 : 0.7,
      }),
    ),
    guides,
    insights,
  };
}

/** Compatibility helper for tests and tooling that need a flat inventory. */
export function buildSitemapEntries(
  input: BuildSitemapInput,
): MetadataRoute.Sitemap {
  const groups = buildSitemapGroups(input);
  return SITEMAP_KINDS.flatMap((kind) => groups[kind]);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderSitemapXml(entries: MetadataRoute.Sitemap) {
  const containsAlternates = entries.some(
    (entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0,
  );
  const urls = entries
    .map((entry) => {
      const lastModified =
        typeof entry.lastModified === "string"
          ? entry.lastModified
          : entry.lastModified?.toISOString();
      return [
        "<url>",
        `<loc>${escapeXml(entry.url)}</loc>`,
        ...Object.entries(entry.alternates?.languages ?? {}).flatMap(
          ([language, href]) =>
            typeof href === "string"
              ? [
                  `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}"/>`,
                ]
              : [],
        ),
        lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : "",
        entry.changeFrequency
          ? `<changefreq>${entry.changeFrequency}</changefreq>`
          : "",
        entry.priority === undefined
          ? ""
          : `<priority>${entry.priority}</priority>`,
        "</url>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");
  const xhtmlNamespace = containsAlternates
    ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtmlNamespace}>${urls}</urlset>`;
}

export function renderSitemapIndexXml(origin: string, groups: SitemapGroups) {
  const normalizedOrigin = normalizeOrigin(origin);
  const sitemaps = SITEMAP_KINDS.map((kind) => {
    const lastModified = newestTimestamp(
      groups[kind].map((entry) =>
        typeof entry.lastModified === "string"
          ? entry.lastModified
          : entry.lastModified?.toISOString(),
      ),
    );
    return `<sitemap><loc>${escapeXml(`${normalizedOrigin}/sitemaps/${kind}.xml`)}</loc>${
      lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ""
    }</sitemap>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}</sitemapindex>`;
}
