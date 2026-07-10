import "server-only";

import { getServerEnvironment } from "@/lib/env";

import { normalizeRemotiveJob } from "./normalize";
import { remotiveResponseSchema } from "./remotive-schema";
import { REMOTIVE_SOURCE_POLICY } from "./source-policy";
import type { JobFeedResult } from "./types";

const REMOTIVE_ENDPOINT = "https://remotive.com/api/remote-jobs";

export async function getLiveJobFeed(): Promise<JobFeedResult> {
  const checkedAt = new Date().toISOString();
  if (!getServerEnvironment().REMOTIVE_SOURCE_ENABLED) {
    return {
      jobs: [],
      state: "disabled",
      checkedAt,
      message: "The live Remotive source is disabled in this environment.",
    };
  }

  try {
    const response = await fetch(REMOTIVE_ENDPOINT, {
      headers: { Accept: "application/json" },
      next: { revalidate: REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok)
      throw new Error(`Source returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const parsed = remotiveResponseSchema.parse(payload);

    return {
      jobs: parsed.jobs.map((job) => normalizeRemotiveJob(job, checkedAt)),
      state: "live",
      checkedAt,
    };
  } catch {
    return {
      jobs: [],
      state: "unavailable",
      checkedAt,
      message:
        "The live source could not be reached or did not match its documented format. Try again later.",
    };
  }
}

export async function getJobBySlug(slug: string) {
  const feed = await getLiveJobFeed();
  return { feed, job: feed.jobs.find((job) => job.slug === slug) ?? null };
}
