import type { Config } from "@netlify/functions";

import { runEmployerFeed } from "../../src/lib/jobs/feeds/runtime";
import { loadRunnableEmployerFeeds } from "../../src/lib/jobs/feeds/runtime";
import type { EmployerFeedConfig } from "../../src/lib/jobs/feeds/types";
import { openSupplyAdapter } from "../../src/lib/jobs/supply/adapters";
import { fetchEmployerFeed } from "./_shared/feed-fetcher";
import {
  recordFeedRunMetrics,
  SupabaseFeedRunStore,
} from "./_shared/feed-run-store";
import {
  boundedSignal,
  observeSecondaryOperation,
  OperationalError,
  rpc,
  runTrackedWorker,
  workerSkipped,
  workerSucceeded,
  type WorkerExecution,
} from "./_shared/runtime";

/**
 * Scheduled generic employer-feed worker.
 *
 * It is deliberately unremarkable: every safety decision already lives in
 * runEmployerFeed (both authorization gates, one completeness contract) and in
 * SupabaseFeedRunStore (shared snapshot lifecycle, partial snapshots close
 * nothing). This worker only decides WHICH feeds to attempt, within what
 * budget, and makes sure every attempt leaves a durable terminal record.
 *
 * Today `config/employer-feed-registry.json` is empty and both global source
 * policies are disabled, so every invocation reports an honest `skipped` with
 * no eligible feed and makes no network request. That is a real outcome, not a
 * success — claiming otherwise is exactly the overstatement this codebase's
 * audits keep catching.
 */

/** Feeds attempted per invocation; the rest wait for the next tick. */
const MAX_FEEDS_PER_INVOCATION = 3;
/** Leave room for terminal metrics after the last feed. */
const FEED_RESERVE_MS = 6_000;
const FEED_FETCH_TIMEOUT_MS = 10_000;

/**
 * Rotates the eligible set so no feed is permanently starved when there are
 * more feeds than one invocation can attempt. Deterministic for a given tick,
 * so a retry of the same tick attempts the same feeds.
 */
export function selectDueFeeds(
  feeds: readonly EmployerFeedConfig[],
  now: Date,
  limit = MAX_FEEDS_PER_INVOCATION,
): EmployerFeedConfig[] {
  if (feeds.length <= limit) return [...feeds];
  const ordered = [...feeds].toSorted((a, b) =>
    a.feedKey.localeCompare(b.feedKey),
  );
  const tick = Math.floor(now.valueOf() / 900_000); // one 15-minute tick
  const offset = ((tick % ordered.length) + ordered.length) % ordered.length;
  return Array.from(
    { length: limit },
    (_, index) => ordered[(offset + index) % ordered.length]!,
  );
}

const POLICY_ADAPTER_BY_KIND = {
  xml: "employer_xml_json_feeds",
  json: "employer_xml_json_feeds",
  csv: "employer_csv_import",
} as const;

/** Maps a run outcome onto the durable metrics vocabulary. */
function outcomeFor(
  ran: boolean,
  reason: string | undefined,
  snapshotComplete: boolean | undefined,
): string {
  if (!ran) return reason ?? "skipped";
  if (reason === "fetch_failed") return "fetch_failed";
  if (reason === "feed_error") return "parse_failed";
  if (reason === "payload_too_large") return "payload_too_large";
  return snapshotComplete ? "complete" : "partial";
}

export async function runEmployerFeedSync(
  execution: WorkerExecution,
  dependencies: {
    now?: () => number;
    callRpc?: typeof rpc;
    fetchFeed?: typeof fetchEmployerFeed;
    loadFeeds?: typeof loadRunnableEmployerFeeds;
  } = {},
) {
  const now = dependencies.now ?? Date.now;
  const callRpc = dependencies.callRpc ?? rpc;
  const fetchFeed = dependencies.fetchFeed ?? fetchEmployerFeed;
  const loadFeeds = dependencies.loadFeeds ?? loadRunnableEmployerFeeds;

  const runAt = new Date(now());
  // Both gates are applied here: a feed appears only when its global source
  // policy is runnable AND its own authorization is current.
  const eligible = loadFeeds(runAt);

  if (eligible.length === 0) {
    // Honest no-op. No feed is authorized, so nothing ran and nothing is
    // claimed. No network request is made.
    return workerSkipped("no_eligible_feed");
  }

  const due = selectDueFeeds(eligible, runAt);
  let attempted = 0;
  let completed = 0;
  let partial = 0;
  let failed = 0;
  let accepted = 0;
  let closed = 0;
  const reasons = new Set<string>();

  for (const config of due) {
    if (execution.remainingMs() <= FEED_RESERVE_MS) {
      reasons.add("worker_budget_exhausted");
      break;
    }
    attempted += 1;

    let mayStoreFullDescription = false;
    try {
      const adapter = openSupplyAdapter(
        POLICY_ADAPTER_BY_KIND[config.kind],
        runAt,
      );
      mayStoreFullDescription = adapter.policy.fullDescriptionPermission;
    } catch {
      // The gate already ran inside loadFeeds; reaching here means the policy
      // changed mid-invocation. Fail this feed closed, keep the others.
      reasons.add("policy_blocked");
      await observeSecondaryOperation(
        "feed_metrics_policy_blocked",
        recordFeedRunMetrics(
          callRpc,
          {
            feed_key: config.feedKey,
            run_at: runAt.toISOString(),
            outcome: "policy_blocked",
          },
          boundedSignal(undefined, 4_000),
        ),
      );
      failed += 1;
      continue;
    }

    const store = new SupabaseFeedRunStore({
      rpc: callRpc,
      config,
      mayStoreFullDescription,
      signal: execution.signal,
    });

    let outcome: string;
    let metrics: Record<string, unknown> = {};
    try {
      const result = await runEmployerFeed(config, {
        now: runAt,
        store,
        mayStoreFullDescription,
        fetcher:
          config.kind === "csv"
            ? undefined
            : (url) =>
                fetchFeed(url, {
                  signal: execution.signal,
                  timeoutMs: Math.min(
                    FEED_FETCH_TIMEOUT_MS,
                    Math.max(1_000, execution.remainingMs() - FEED_RESERVE_MS),
                  ),
                }),
      });

      outcome = outcomeFor(
        result.ran,
        result.reason,
        result.metrics?.snapshotComplete,
      );
      if (result.reason) reasons.add(result.reason);
      if (outcome === "complete") completed += 1;
      else if (outcome === "partial") partial += 1;
      accepted += result.metrics?.accepted ?? 0;
      closed += result.metrics?.closed ?? 0;

      metrics = {
        feed_key: config.feedKey,
        run_at: runAt.toISOString(),
        outcome,
        import_run_id: store.lastResult?.importRunId ?? null,
        snapshot_complete: result.metrics?.snapshotComplete ?? false,
        fetched_count: result.metrics?.fetched ?? 0,
        accepted_count: result.metrics?.accepted ?? 0,
        filtered_count: result.metrics?.filtered ?? 0,
        quarantined_count: result.metrics?.quarantined ?? 0,
        destination_dropped_count: result.metrics?.destinationDropped ?? 0,
        invalid_record_count: result.metrics?.invalidRecords ?? 0,
        inserted_count: result.metrics?.inserted ?? 0,
        updated_count: store.lastResult?.updated ?? 0,
        unchanged_count: store.lastResult?.unchanged ?? 0,
        closed_count: result.metrics?.closed ?? 0,
        truncated: result.metrics?.truncated ?? false,
        incompleteness_reasons: result.metrics?.incompletenessReasons ?? [],
      };
    } catch (reason) {
      failed += 1;
      const code =
        reason instanceof OperationalError ? reason.code : "feed_run_failed";
      reasons.add(code);
      metrics = {
        feed_key: config.feedKey,
        run_at: runAt.toISOString(),
        outcome: "database_failed",
        import_run_id: store.lastResult?.importRunId ?? null,
        error_code: code,
      };
    }

    // Every attempt leaves a durable terminal record, including the failures.
    await observeSecondaryOperation(
      "feed_metrics",
      recordFeedRunMetrics(callRpc, metrics, boundedSignal(undefined, 4_000)),
    );
  }

  const summary = {
    eligible_feeds: eligible.length,
    attempted_feeds: attempted,
    completed_snapshots: completed,
    partial_snapshots: partial,
    failed_feeds: failed,
    accepted_records: accepted,
    closed_records: closed,
    reasons: [...reasons].toSorted(),
  };

  if (failed > 0) {
    throw new OperationalError("employer_feed_sync_failed", summary);
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("employer_feed_sync", request, context, (execution) =>
    runEmployerFeedSync(execution),
  );

export default handler;
// Every six hours. The schedule row in private.worker_schedules stays disabled
// until a feed is authorized, so /api/health reports this worker as a parked
// schedule rather than expecting fresh successful runs from it.
export const config: Config = { schedule: "19 */6 * * *" };
