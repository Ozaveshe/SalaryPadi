import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getSupabasePublicConfig } from "@/lib/env";
import { readBoundedJson } from "@/lib/http/json";

import {
  JOB_LANDING_DEFINITIONS,
  type JobLandingKey,
  type JobLandingMetrics,
} from "./job-landing-pages";

const rowSchema = z.object({
  landing_key: z.enum(
    JOB_LANDING_DEFINITIONS.map((definition) => definition.key) as [
      JobLandingKey,
      ...JobLandingKey[],
    ],
  ),
  active_unique_jobs: z.number().int().nonnegative(),
  unique_jobs_seen_90_days: z.number().int().nonnegative(),
  company_count: z.number().int().nonnegative(),
  stable_demand_signal: z.boolean(),
  last_modified: z.string().nullable(),
  measured_at: z.string(),
});

function emptyMetrics(key: JobLandingKey): JobLandingMetrics {
  return {
    key,
    activeUniqueJobs: 0,
    uniqueJobsSeen90Days: 0,
    companyCount: 0,
    stableDemandSignal: false,
    lastModified: null,
    measuredAt: new Date().toISOString(),
  };
}

export async function getJobLandingMetrics(
  key: JobLandingKey,
): Promise<JobLandingMetrics> {
  const configuration = getSupabasePublicConfig();
  if (!configuration) return emptyMetrics(key);
  const endpoint = new URL(
    "/rest/v1/rpc/job_landing_page_metrics",
    configuration.url,
  );
  try {
    const response = await fetch(endpoint, {
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
    if (!response.ok) return emptyMetrics(key);
    const payload = await readBoundedJson(response, 32 * 1024);
    const candidate = Array.isArray(payload) ? payload[0] : payload;
    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) return emptyMetrics(key);
    return {
      key: parsed.data.landing_key,
      activeUniqueJobs: parsed.data.active_unique_jobs,
      uniqueJobsSeen90Days: parsed.data.unique_jobs_seen_90_days,
      companyCount: parsed.data.company_count,
      stableDemandSignal: parsed.data.stable_demand_signal,
      lastModified: parsed.data.last_modified,
      measuredAt: parsed.data.measured_at,
    };
  } catch (reason) {
    unstable_rethrow(reason);
    return emptyMetrics(key);
  }
}

export async function getAllJobLandingMetrics() {
  return Promise.all(
    JOB_LANDING_DEFINITIONS.map((definition) =>
      getJobLandingMetrics(definition.key),
    ),
  );
}
