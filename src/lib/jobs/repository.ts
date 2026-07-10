import "server-only";

import { getServerEnvironment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { mapDatabaseJobRow } from "./database";
import { normalizeRemotiveJob } from "./normalize";
import { remotiveResponseSchema } from "./remotive-schema";
import { REMOTIVE_SOURCE_POLICY } from "./source-policy";
import type { JobFeedResult } from "./types";

const REMOTIVE_ENDPOINT = "https://remotive.com/api/remote-jobs";

async function getRemotiveJobFeed(): Promise<JobFeedResult> {
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

async function getDatabaseJobs() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .schema("api")
    .from("jobs")
    .select("*")
    .order("posted_at", { ascending: false })
    .limit(500);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => mapDatabaseJobRow(row))
    .filter((job): job is NonNullable<typeof job> => job !== null);
}

function sourcePriority(job: JobFeedResult["jobs"][number]) {
  if (job.source.type === "employer") return 4;
  if (job.source.type === "partner") return 3;
  if (job.source.type === "manual") return 2;
  return 1;
}

export async function getLiveJobFeed(): Promise<JobFeedResult> {
  const [remotive, databaseJobs] = await Promise.all([
    getRemotiveJobFeed(),
    getDatabaseJobs(),
  ]);
  const jobsByFingerprint = new Map<string, JobFeedResult["jobs"][number]>();
  for (const job of [...remotive.jobs, ...databaseJobs]) {
    const current = jobsByFingerprint.get(job.fingerprint);
    if (!current || sourcePriority(job) > sourcePriority(current)) {
      jobsByFingerprint.set(job.fingerprint, job);
    }
  }
  const jobs = [...jobsByFingerprint.values()];
  return {
    jobs,
    state: jobs.length > 0 ? "live" : remotive.state,
    checkedAt: remotive.checkedAt,
    message: remotive.message,
  };
}

export async function getJobBySlug(slug: string) {
  const feed = await getLiveJobFeed();
  return { feed, job: feed.jobs.find((job) => job.slug === slug) ?? null };
}
