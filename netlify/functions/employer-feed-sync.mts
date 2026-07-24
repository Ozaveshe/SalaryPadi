import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  loadRunnableEmployerFeeds,
  runEmployerFeed,
  type FeedFetchResult,
  type FeedRunMetrics,
} from "../../src/lib/jobs/feeds/runtime";
import { MAX_FEED_PAYLOAD_BYTES } from "../../src/lib/jobs/feeds/types";

import { createSupabaseFeedRunStore } from "./_shared/employer-feed-store";
import {
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

/**
 * Scheduled sync for employer-authorized generic feeds (XML/JSON).
 *
 * The employer feed registry is currently EMPTY and the global source policy
 * for generic feeds is disabled, so `loadRunnableEmployerFeeds` returns no
 * feeds and this worker performs no network request and no database write.
 * That no-op is the expected, correct behaviour until a real employer
 * authorization exists.
 *
 * CSV imports are NOT handled here: they arrive through the authenticated
 * operator upload boundary, not a schedule.
 */

/** Feeds processed per invocation, so one run cannot monopolise the budget. */
const MAX_FEEDS_PER_RUN = 3;
/** Per-feed wall-clock budget inside the worker's overall budget. */
const FEED_TIME_BUDGET_MS = 20_000;

/**
 * Bounded streaming fetcher. Reads at most MAX_FEED_PAYLOAD_BYTES and reports
 * truncation explicitly, so an over-long body can never masquerade as a
 * complete snapshot.
 */
function createBoundedFetcher(signal: AbortSignal) {
  return async (url: string): Promise<FeedFetchResult> => {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: {
        Accept: "application/xml, text/xml, application/json;q=0.9",
        "User-Agent": "SalaryPadi/1.0 (+https://salarypadi.com/about)",
      },
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(FEED_TIME_BUDGET_MS),
      ]),
    });
    if (!response.ok || !response.body) return { ok: false, text: "" };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_PAYLOAD_BYTES) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      ok: true,
      truncated,
      text: Buffer.concat(chunks).toString("utf8"),
    };
  };
}

/** Only transient transport failures are worth a later retry. */
function isRetryable(reason: string | undefined): boolean {
  return reason === "fetch_failed";
}

export async function runEmployerFeedSync(execution: WorkerExecution) {
  const now = new Date();
  const feeds = loadRunnableEmployerFeeds(now);
  if (feeds.length === 0) {
    // No authorized feed: nothing fetched, nothing written, nothing closed.
    return workerSkipped("no_authorized_employer_feeds");
  }

  const fetcher = createBoundedFetcher(execution.signal);
  const callRpc = (name: string, args: Record<string, unknown>) =>
    rpc(name, z.unknown(), args, {
      signal: execution.signal,
    }) as Promise<unknown>;

  const results: FeedRunMetrics[] = [];
  const failures: string[] = [];
  const retryable: string[] = [];

  for (const feed of feeds.slice(0, MAX_FEEDS_PER_RUN)) {
    if (execution.signal.aborted) break;
    // XML/JSON only; CSV arrives through the authenticated upload boundary.
    if (feed.kind === "csv") continue;
    try {
      const outcome = await runEmployerFeed(feed, {
        now,
        fetcher,
        store: createSupabaseFeedRunStore({
          callRpc,
          adapterKey: feed.feedKey,
        }),
      });
      if (outcome.metrics) results.push(outcome.metrics);
      else if (outcome.reason) {
        failures.push(`${feed.feedKey}:${outcome.reason}`);
        if (isRetryable(outcome.reason)) retryable.push(feed.feedKey);
      }
    } catch (reason) {
      failures.push(
        `${feed.feedKey}:${reason instanceof Error ? reason.name : "unknown"}`,
      );
    }
  }

  // Durable terminal outcome: the per-snapshot rows are written by the store
  // through the ATS snapshot RPCs; this summary lands on the worker run.
  return workerSucceeded({
    considered_feeds: feeds.length,
    processed_feeds: results.length,
    complete_snapshots: results.filter((r) => r.snapshotComplete).length,
    partial_snapshots: results.filter((r) => !r.snapshotComplete).length,
    accepted_records: results.reduce((s, r) => s + r.acceptedRecords, 0),
    filtered_records: results.reduce((s, r) => s + r.filteredRecords, 0),
    quarantined_records: results.reduce((s, r) => s + r.quarantinedRecords, 0),
    destination_dropped: results.reduce((s, r) => s + r.destinationDropped, 0),
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    updated: results.reduce((s, r) => s + r.updated, 0),
    unchanged: results.reduce((s, r) => s + r.unchanged, 0),
    closed: results.reduce((s, r) => s + r.closed, 0),
    error_codes: [...new Set(results.flatMap((r) => r.errorCodes))],
    failures,
    retryable_feeds: retryable,
  });
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("employer_feed_sync", request, context, runEmployerFeedSync);

export default handler;

export const config: Config = { schedule: "40 1,7,13,19 * * *" };
