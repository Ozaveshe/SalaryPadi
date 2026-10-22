import { getStore } from "@netlify/blobs";
import { z } from "zod";
import { AFRICAN_APPLICANT_COUNTRIES } from "./eligibility";
import { readHimalayasPage } from "./himalayas-adapter";
import { fetchJobicyJobs } from "./jobicy-adapter";
import { isJobCurrentlyPublishable } from "./publication";
import type { Job } from "./types";

// Every country gets a turn before any country receives another page.
export const DISCOVERY_COUNTRIES = [
  "worldwide",
  "NG",
  "KE",
  "ZA",
  "GH",
  "EG",
  ...AFRICAN_APPLICANT_COUNTRIES.map(({ code }) => code).filter(
    (code) => !["NG", "KE", "ZA", "GH", "EG"].includes(code),
  ),
];
const checkpointSchema = z.object({
  version: z.literal(1),
  position: z.number().int().nonnegative(),
  pages: z.record(z.string(), z.number().int().positive()),
  headsCheckedAt: z.record(z.string(), z.string().datetime()).default({}),
  cursor: z.string().max(2048).nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type DiscoveryCheckpoint = z.infer<typeof checkpointSchema>;
export const initialDiscoveryCheckpoint = (): DiscoveryCheckpoint => ({
  version: 1,
  position: 0,
  pages: {},
  headsCheckedAt: {},
  cursor: null,
  completedAt: null,
});
const store = () =>
  getStore({ name: "salarypadi-discovery-progress", consistency: "strong" });
export async function readDiscoveryCheckpoint(source: string) {
  const value = await store().get(source, { type: "json" });
  return value == null
    ? initialDiscoveryCheckpoint()
    : checkpointSchema.parse(value);
}
export async function writeDiscoveryCheckpoint(
  source: string,
  checkpoint: DiscoveryCheckpoint,
) {
  await store().setJSON(source, checkpointSchema.parse(checkpoint));
}

export function mergeDiscoveryJobs(
  previous: Job[],
  incoming: Job[],
  now: Date,
) {
  const jobs = new Map(previous.map((job) => [job.id, job]));
  for (const job of incoming) jobs.set(job.id, job);
  return [...jobs.values()].filter(
    (job) =>
      isJobCurrentlyPublishable(job, now) &&
      job.eligibility.africa !== "not_eligible" &&
      now.valueOf() - Date.parse(job.lastCheckedAt) <= 24 * 60 * 60 * 1000,
  );
}

/** Bounded execution, unbounded traversal: progress survives the next cron run.
 * Never refresh the evidence timestamp of a job that was not fetched.
 */
export async function discoverSecondaryJobs(
  source: "jobicy" | "himalayas",
  checkpoint: DiscoveryCheckpoint,
  options: {
    signal?: AbortSignal;
    fetch?: typeof globalThis.fetch;
    now?: Date;
    pageDelayMs?: number;
  } = {},
) {
  const now = options.now ?? new Date();
  const next = structuredClone(checkpoint);
  const jobs: Job[] = [];
  let successfulRequests = 0;
  let partial = false;
  let checkedAt: string | null = null;
  if (
    source === "jobicy" &&
    next.completedAt &&
    now.valueOf() - Date.parse(next.completedAt) < 6 * 60 * 60 * 1000
  ) {
    return {
      jobs,
      checkpoint: next,
      checkedAt: now.toISOString(),
      skipped: true,
      partial,
      successfulRequests,
    };
  }
  const seenCursors = new Set<string>();
  for (let index = 0; index < (source === "jobicy" ? 4 : 6); index++) {
    if (options.signal?.aborted) {
      partial = true;
      break;
    }
    if (index)
      await new Promise((resolve) =>
        setTimeout(resolve, options.pageDelayMs ?? 1000),
      );
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)])
      : AbortSignal.timeout(6000);
    try {
      if (source === "jobicy") {
        if (next.cursor && seenCursors.has(next.cursor)) {
          partial = true;
          break;
        }
        if (next.cursor) seenCursors.add(next.cursor);
        const result = await fetchJobicyJobs({
          ...options,
          requestedAt: now,
          signal,
          cursor: next.cursor,
        });
        jobs.push(...result.jobs);
        checkedAt = result.checkedAt;
        successfulRequests++;
        next.cursor = result.nextCursor;
        if (!next.cursor) {
          next.completedAt = now.toISOString();
          break;
        }
      } else {
        const country =
          DISCOVERY_COUNTRIES[next.position % DISCOVERY_COUNTRIES.length]!;
        const refreshHead =
          !next.headsCheckedAt[country] ||
          now.valueOf() - Date.parse(next.headsCheckedAt[country]) >=
            6 * 60 * 60 * 1000;
        const page = refreshHead ? 1 : (next.pages[country] ?? 1);
        const query =
          country === "worldwide"
            ? "worldwide=true"
            : `country=${country}&exclude_worldwide=true`;
        const result = await readHimalayasPage(
          `https://himalayas.app/jobs/api/search?${query}&sort=recent&page=${page}`,
          { ...options, signal },
          now,
        );
        jobs.push(...result.jobs);
        checkedAt = result.checkedAt;
        successfulRequests++;
        // Short pages are not exhaustion: only an empty page resets this country.
        if (page === 1) next.headsCheckedAt[country] = now.toISOString();
        next.pages[country] =
          result.jobs.length === 0
            ? 1
            : refreshHead
              ? Math.max(next.pages[country] ?? 2, 2)
              : page + 1;
        next.position = (next.position + 1) % DISCOVERY_COUNTRIES.length;
      }
    } catch (reason) {
      partial = true;
      // Keep the failed country page for its next turn, without starving other countries.
      if (source === "himalayas") {
        if (
          reason &&
          typeof reason === "object" &&
          "status" in reason &&
          reason.status === 429
        )
          break;
        next.position = (next.position + 1) % DISCOVERY_COUNTRIES.length;
        continue;
      }
      if (
        source === "jobicy" &&
        next.cursor &&
        reason &&
        typeof reason === "object" &&
        "status" in reason &&
        reason.status === 400
      ) {
        next.cursor = null;
        next.completedAt = null;
        continue; // Provider-documented cursor expiry: restart once within this batch.
      }
      break;
    }
  }
  if (!successfulRequests) throw new Error(`${source}_discovery_unavailable`);
  return {
    jobs,
    checkpoint: next,
    checkedAt: checkedAt!,
    skipped: false,
    partial,
    successfulRequests,
  };
}
