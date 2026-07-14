import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getSupabasePublicConfig } from "@/lib/env";
import { discardResponseBody } from "@/lib/http/body";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { readBoundedJson } from "@/lib/http/json";

import {
  JOB_LANDING_DEFINITIONS,
  type JobLandingKey,
  type JobLandingMetrics,
} from "./job-landing-pages";

const MAX_JOB_LANDING_COUNT = 1_000_000;
const rowSchema = z
  .object({
    landing_key: z.enum(
      JOB_LANDING_DEFINITIONS.map((definition) => definition.key) as [
        JobLandingKey,
        ...JobLandingKey[],
      ],
    ),
    active_unique_jobs: z.number().int().min(0).max(MAX_JOB_LANDING_COUNT),
    unique_jobs_seen_90_days: z
      .number()
      .int()
      .min(0)
      .max(MAX_JOB_LANDING_COUNT),
    company_count: z.number().int().min(0).max(MAX_JOB_LANDING_COUNT),
    stable_demand_signal: z.boolean(),
    last_modified: z.string().datetime({ offset: true }).nullable(),
    measured_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.company_count > row.active_unique_jobs ||
      (row.active_unique_jobs > 0 && row.company_count === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["company_count"],
        message: "Company coverage must agree with active job coverage.",
      });
    }
    if (
      (row.active_unique_jobs === 0) !== (row.last_modified === null) ||
      (row.last_modified !== null &&
        Date.parse(row.last_modified) >
          Date.parse(row.measured_at) + 5 * 60_000)
    ) {
      context.addIssue({
        code: "custom",
        path: ["last_modified"],
        message: "Landing modification evidence is inconsistent.",
      });
    }
  });

export async function getJobLandingMetricsResult(
  key: JobLandingKey,
  now = new Date(),
): Promise<RepositoryResult<JobLandingMetrics | null>> {
  const operation = `seo.job_landing.${key}`;
  const configuration = getSupabasePublicConfig();
  if (!configuration) {
    return repositoryFailure(
      "unconfigured",
      null,
      repositoryIssue(
        operation,
        "not_configured",
        "job_landing_metrics_unconfigured",
      ),
    );
  }
  const endpoint = new URL(
    "/rest/v1/rpc/job_landing_page_metrics",
    configuration.url,
  );
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "api",
        "Content-Profile": "api",
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${configuration.publishableKey}`,
      },
      body: JSON.stringify({ p_landing_key: key }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
  } catch (reason) {
    unstable_rethrow(reason);
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        operation,
        "query_failed",
        "job_landing_metrics_query_failed",
        reason,
      ),
    );
  }
  if (!response.ok) {
    await discardResponseBody(response);
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        operation,
        "query_failed",
        `job_landing_metrics_${response.status}`,
      ),
    );
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, 32 * 1024);
  } catch (reason) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        operation,
        "invalid_container",
        "job_landing_metrics_invalid_json",
        reason,
      ),
    );
  }
  const candidate = Array.isArray(payload)
    ? payload.length === 1
      ? payload[0]
      : undefined
    : payload;
  const parsed = rowSchema.safeParse(candidate);
  if (
    !parsed.success ||
    parsed.data.landing_key !== key ||
    !Number.isFinite(now.valueOf()) ||
    Date.parse(parsed.data.measured_at) > now.valueOf() + 5 * 60_000
  ) {
    return repositoryFailure(
      "invalid",
      null,
      repositoryIssue(
        operation,
        "invalid_rows",
        "job_landing_metrics_invalid_row",
        parsed.success ? undefined : parsed.error,
      ),
    );
  }
  return repositoryReady({
    key: parsed.data.landing_key,
    activeUniqueJobs: parsed.data.active_unique_jobs,
    uniqueJobsSeen90Days: parsed.data.unique_jobs_seen_90_days,
    companyCount: parsed.data.company_count,
    stableDemandSignal: parsed.data.stable_demand_signal,
    lastModified: parsed.data.last_modified,
    measuredAt: parsed.data.measured_at,
  });
}

export async function getAllJobLandingMetricsResults(now = new Date()) {
  return Promise.all(
    JOB_LANDING_DEFINITIONS.map((definition) =>
      getJobLandingMetricsResult(definition.key, now),
    ),
  );
}
