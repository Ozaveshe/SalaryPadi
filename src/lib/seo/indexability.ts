import type { RepositoryResult } from "@/lib/data/repository-result";
import type { CompanySummary } from "@/lib/companies/repository";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

import { canIndexJobDetail } from "./job-posting";

function hasReadableData<T>(result: RepositoryResult<T[]>): boolean {
  return (
    (result.state === "ready" || result.state === "degraded") &&
    result.data.length > 0
  );
}

export function canIndexSalaryHub(
  result: RepositoryResult<PublicSalaryAggregate[]>,
): boolean {
  return hasReadableData(result);
}

export function canIndexSalaryDetail(
  result: RepositoryResult<PublicSalaryAggregate[]>,
): boolean {
  return result.state === "ready" && result.data.length > 0;
}

export function hasIndexableActiveJob(company: CompanySummary): boolean {
  return company.activeJobs.some(
    (job) => job.status === "open" && canIndexJobDetail(job),
  );
}

export function canIndexCompanyDetail(
  company: CompanySummary,
  hasPublishedCommunityEvidence: boolean,
): boolean {
  return hasIndexableActiveJob(company) || hasPublishedCommunityEvidence;
}

export function canIndexCompanyHub(
  result: RepositoryResult<CompanySummary[]>,
): boolean {
  return (
    hasReadableData(result) &&
    result.data.some(
      (company) =>
        company.databaseId !== null || hasIndexableActiveJob(company),
    )
  );
}
