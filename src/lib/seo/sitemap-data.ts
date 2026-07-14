import "server-only";

import {
  getCompaniesResult,
  getPublishedCompanyEvidenceResult,
} from "@/lib/companies/repository";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { listPublishedSalaryAggregatesResult } from "@/lib/salaries/repository";

import { getAllJobLandingMetrics } from "./job-landing-repository";
import {
  evaluateJobLandingIndexability,
  getJobLandingDefinition,
} from "./job-landing-pages";
import { buildSitemapGroups } from "./sitemap";

export async function loadSitemapGroups() {
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
    getAllJobLandingMetrics(),
  ]);
  const landingPages = landingMetrics.flatMap((metrics) => {
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
  return buildSitemapGroups({
    origin: getAppOrigin(),
    editorial: editorial.data,
    jobFeed,
    salaryAggregates,
    companies,
    companyEvidence: companyEvidence.data,
    landingPages,
  });
}
