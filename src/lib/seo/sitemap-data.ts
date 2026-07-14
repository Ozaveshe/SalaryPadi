import "server-only";

import {
  getCompaniesResult,
  getPublishedCompanyEvidenceResult,
} from "@/lib/companies/repository";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { listPublishedSalaryAggregatesResult } from "@/lib/salaries/repository";

import { getAllJobLandingMetricsResults } from "./job-landing-repository";
import {
  evaluateJobLandingIndexability,
  getJobLandingDefinition,
} from "./job-landing-pages";
import {
  buildSitemapGroups,
  type SitemapGroups,
  type SitemapKind,
} from "./sitemap";

export type SitemapDataState = "ready" | "degraded" | "unavailable";

export interface SitemapDataResult {
  groups: SitemapGroups;
  states: Record<SitemapKind, SitemapDataState>;
}

function repositoryInventoryState(
  state: string,
  hasUsableData: boolean,
): SitemapDataState {
  if (state === "ready") return "ready";
  return hasUsableData ? "degraded" : "unavailable";
}

export async function loadSitemapData(): Promise<SitemapDataResult> {
  const jobFeedPromise = getLiveJobFeed();
  const [
    editorial,
    jobFeed,
    salaryAggregates,
    companies,
    companyEvidence,
    landingMetrics,
  ] = await Promise.all([
    getPublishedEditorialResult(),
    jobFeedPromise,
    listPublishedSalaryAggregatesResult(),
    getCompaniesResult(jobFeedPromise),
    getPublishedCompanyEvidenceResult(),
    getAllJobLandingMetricsResults(),
  ]);
  const landingPages = landingMetrics.flatMap((result) => {
    const metrics = result.data;
    if (!metrics) return [];
    const definition = getJobLandingDefinition(metrics.key);
    return definition
      ? [
          {
            path: definition.path,
            metrics,
            decision: evaluateJobLandingIndexability(definition, metrics),
          },
        ]
      : [];
  });
  const groups = buildSitemapGroups({
    origin: getAppOrigin(),
    editorial: editorial.data,
    jobFeed,
    salaryAggregates,
    companies,
    companyEvidence: companyEvidence.data,
    landingPages,
  });
  const jobFeedState: SitemapDataState =
    jobFeed.state === "live"
      ? landingMetrics.every((result) => result.state === "ready")
        ? "ready"
        : "degraded"
      : jobFeed.jobs.length > 0
        ? "degraded"
        : "unavailable";
  const editorialState = repositoryInventoryState(
    editorial.state,
    editorial.data.length > 0,
  );
  return {
    groups,
    states: {
      jobs: jobFeedState,
      companies:
        companyEvidence.state === "ready"
          ? repositoryInventoryState(companies.state, companies.data.length > 0)
          : companies.data.length > 0
            ? "degraded"
            : "unavailable",
      salaries: repositoryInventoryState(
        salaryAggregates.state,
        salaryAggregates.data.length > 0,
      ),
      tools: "ready",
      guides: editorialState,
      insights:
        editorial.state === "ready"
          ? "ready"
          : editorial.data.some(
                (article) => article.article_kind === "data_brief",
              )
            ? "degraded"
            : "unavailable",
    },
  };
}

export async function loadSitemapGroups() {
  return (await loadSitemapData()).groups;
}
