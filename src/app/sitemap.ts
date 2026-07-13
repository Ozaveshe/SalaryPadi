import type { MetadataRoute } from "next";

import {
  getCompaniesResult,
  getPublishedCompanyEvidenceResult,
} from "@/lib/companies/repository";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { listPublishedSalaryAggregatesResult } from "@/lib/salaries/repository";
import { buildSitemapEntries } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobFeedPromise = getLiveJobFeed();
  const [editorial, jobFeed, salaryAggregates, companies, companyEvidence] =
    await Promise.all([
      getPublishedEditorialResult(),
      jobFeedPromise,
      listPublishedSalaryAggregatesResult(),
      getCompaniesResult(jobFeedPromise),
      getPublishedCompanyEvidenceResult(),
    ]);

  return buildSitemapEntries({
    origin: getAppOrigin(),
    editorial: editorial.data,
    jobFeed,
    salaryAggregates,
    companies,
    companyEvidence: companyEvidence.data,
  });
}
