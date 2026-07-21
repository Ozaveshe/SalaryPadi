import type { Config } from "@netlify/functions";
import { z } from "zod";

import { fetchHimalayasJobs } from "../../src/lib/jobs/himalayas-adapter";
import { fetchJobicyJobs } from "../../src/lib/jobs/jobicy-adapter";
import {
  readSecondaryFeedSnapshot,
  storeSecondaryFeedSnapshot,
  type SecondaryFeedKey,
  type SecondaryFeedSnapshotResult,
} from "../../src/lib/jobs/secondary-feed-store";
import {
  HIMALAYAS_ADAPTER_KEY,
  HIMALAYAS_REQUIRED_DESTINATION_KIND,
  HIMALAYAS_SOURCE_POLICY,
  HIMALAYAS_TERMS_VERSION,
  JOBICY_ADAPTER_KEY,
  JOBICY_REQUIRED_DESTINATION_KIND,
  JOBICY_SOURCE_POLICY,
  JOBICY_TERMS_VERSION,
} from "../../src/lib/jobs/source-policy";
import { openSupplyAdapter } from "../../src/lib/jobs/supply/adapters";
import { AdapterPolicyError } from "../../src/lib/jobs/supply/policy";
import type { Job } from "../../src/lib/jobs/types";

import {
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

/**
 * Fetches the secondary public feeds (Jobicy, Himalayas) on a schedule and
 * persists the redacted alert-catalog projection, so request-time rendering
 * reads a snapshot instead of calling the provider. The existing snapshot's
 * own checkedAt is the polling ledger: a source is fetched only when its
 * snapshot is at least the reviewed minimum poll interval old, which keeps
 * this worker inside each provider's request budget even across retries.
 */

const sourcePolicyRowSchema = z
  .object({
    adapter_key: z.string().min(1).max(80),
    source_type: z.string().min(1).max(40),
    status: z.enum(["draft", "active", "paused", "disabled"]),
    terms_url: z.string().min(1),
    terms_reviewed_at: z.string().datetime({ offset: true }).nullable(),
    terms_version: z.string().min(1).max(160),
    allow_public_listing: z.boolean(),
    attribution_required: z.boolean(),
    may_store_full_description: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    required_destination_kind: z.string().min(1).max(40),
    refresh_interval_seconds: z.number().int().positive(),
  })
  .strict();

const sourcePolicySchema = z.array(sourcePolicyRowSchema).max(1);

/** Cron jitter must not push a due fetch past its slot. */
const POLL_TOLERANCE_MS = 15 * 60 * 1_000;

type FeedFetchResult = { jobs: Job[]; checkedAt: string };

type SecondarySource = {
  key: SecondaryFeedKey;
  adapterKey: string;
  reviewedPolicy: typeof JOBICY_SOURCE_POLICY | typeof HIMALAYAS_SOURCE_POLICY;
  termsVersion: string;
  requiredDestinationKind: string;
  minimumPollMs: number;
  fetchJobs: (signal: AbortSignal | undefined) => Promise<FeedFetchResult>;
};

const SECONDARY_SOURCES: SecondarySource[] = [
  {
    key: "jobicy",
    adapterKey: JOBICY_ADAPTER_KEY,
    reviewedPolicy: JOBICY_SOURCE_POLICY,
    termsVersion: JOBICY_TERMS_VERSION,
    requiredDestinationKind: JOBICY_REQUIRED_DESTINATION_KIND,
    minimumPollMs: JOBICY_SOURCE_POLICY.refreshIntervalSeconds * 1_000,
    fetchJobs: (signal) =>
      fetchJobicyJobs({ signal: signal ?? AbortSignal.timeout(10_000) }),
  },
  {
    key: "himalayas",
    adapterKey: HIMALAYAS_ADAPTER_KEY,
    reviewedPolicy: HIMALAYAS_SOURCE_POLICY,
    termsVersion: HIMALAYAS_TERMS_VERSION,
    requiredDestinationKind: HIMALAYAS_REQUIRED_DESTINATION_KIND,
    minimumPollMs: HIMALAYAS_SOURCE_POLICY.refreshIntervalSeconds * 1_000,
    fetchJobs: (signal) =>
      fetchHimalayasJobs({ signal: signal ?? AbortSignal.timeout(12_000) }),
  },
];

type SecondaryFeedSyncDependencies = {
  rpc?: (
    functionName: string,
    parameters?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<unknown>;
  readSnapshot?: (
    source: SecondaryFeedKey,
  ) => Promise<SecondaryFeedSnapshotResult>;
  storeSnapshot?: typeof storeSecondaryFeedSnapshot;
  fetchJobs?: (
    source: SecondaryFeedKey,
    signal: AbortSignal | undefined,
  ) => Promise<FeedFetchResult>;
  now?: () => number;
};

type SourceOutcome = {
  source: SecondaryFeedKey;
  outcome: "stored" | "skipped" | "failed";
  code?: string;
  stored_count?: number;
  checked_at?: string;
  snapshot_age_ms?: number;
};

function deployContextAllowsWrites(): boolean {
  const netlify = (
    globalThis as {
      Netlify?: { context?: { deploy?: { context?: string } } };
    }
  ).Netlify;
  // Scheduled functions only run in production; a preview invocation must
  // never overwrite the production snapshot. Local test runs (no Netlify
  // global) inject their own store.
  return !netlify || netlify.context?.deploy?.context === "production";
}

async function syncSource(
  source: SecondarySource,
  { signal }: WorkerExecution,
  dependencies: SecondaryFeedSyncDependencies,
): Promise<SourceOutcome> {
  const now = dependencies.now ?? Date.now;
  const readSnapshot = dependencies.readSnapshot ?? readSecondaryFeedSnapshot;
  const storeSnapshot =
    dependencies.storeSnapshot ?? storeSecondaryFeedSnapshot;

  try {
    openSupplyAdapter(source.key, new Date(now()));
  } catch (reason) {
    const code =
      reason instanceof AdapterPolicyError
        ? `${source.key}_${reason.code}`
        : `${source.key}_policy_invalid`;
    return { source: source.key, outcome: "skipped", code };
  }

  let rows: z.infer<typeof sourcePolicySchema>;
  try {
    if (dependencies.rpc) {
      rows = sourcePolicySchema.parse(
        await dependencies.rpc(
          "worker_get_job_source_policy",
          { p_adapter_key: source.adapterKey },
          { signal },
        ),
      );
    } else {
      rows = await rpc(
        "worker_get_job_source_policy",
        sourcePolicySchema,
        { p_adapter_key: source.adapterKey },
        { signal },
      );
    }
  } catch {
    return {
      source: source.key,
      outcome: "failed",
      code: `${source.key}_source_policy_invalid`,
    };
  }
  const row = rows[0];
  if (!row) {
    return {
      source: source.key,
      outcome: "skipped",
      code: `${source.key}_policy_disabled`,
    };
  }
  if (row.status !== "active") {
    return {
      source: source.key,
      outcome: "skipped",
      code: `${source.key}_source_${row.status}`,
    };
  }
  if (
    row.adapter_key !== source.adapterKey ||
    row.source_type !== source.reviewedPolicy.type ||
    row.terms_url !== source.reviewedPolicy.termsUrl ||
    row.terms_version !== source.termsVersion ||
    !row.terms_reviewed_at ||
    !row.attribution_required ||
    !row.allow_public_listing ||
    row.may_store_full_description !==
      source.reviewedPolicy.canStoreFullDescription ||
    row.may_index_jobs !== source.reviewedPolicy.canIndex ||
    row.may_emit_jobposting_schema !==
      source.reviewedPolicy.canUseJobPostingStructuredData ||
    row.required_destination_kind !== source.requiredDestinationKind ||
    row.refresh_interval_seconds !==
      source.reviewedPolicy.refreshIntervalSeconds
  ) {
    return {
      source: source.key,
      outcome: "failed",
      code: `${source.key}_policy_mismatch`,
    };
  }

  const existing = await readSnapshot(source.key);
  if (existing.state === "ready") {
    const ageMs = now() - Date.parse(existing.catalog.checkedAt);
    if (
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs < source.minimumPollMs - POLL_TOLERANCE_MS
    ) {
      return {
        source: source.key,
        outcome: "skipped",
        code: `${source.key}_fetch_not_due`,
        snapshot_age_ms: Math.round(ageMs),
      };
    }
  }

  let result: FeedFetchResult;
  try {
    result = dependencies.fetchJobs
      ? await dependencies.fetchJobs(source.key, signal)
      : await source.fetchJobs(signal);
  } catch (reason) {
    return {
      source: source.key,
      outcome: "failed",
      code:
        reason instanceof Error && reason.message
          ? reason.message.slice(0, 120)
          : `${source.key}_fetch_failed`,
    };
  }
  if (result.jobs.length === 0) {
    // An empty result is treated as a provider fault: the previous snapshot
    // keeps serving rather than wiping the public listing.
    return {
      source: source.key,
      outcome: "failed",
      code: `${source.key}_source_empty`,
    };
  }

  try {
    const storedCount = await storeSnapshot(
      source.key,
      result.jobs,
      result.checkedAt,
    );
    return {
      source: source.key,
      outcome: "stored",
      stored_count: storedCount,
      checked_at: result.checkedAt,
    };
  } catch {
    return {
      source: source.key,
      outcome: "failed",
      code: `${source.key}_snapshot_store_failed`,
    };
  }
}

export async function runSecondaryFeedSync(
  execution: WorkerExecution,
  dependencies: SecondaryFeedSyncDependencies = {},
) {
  if (!deployContextAllowsWrites()) {
    return workerSkipped("secondary_feed_production_only");
  }

  const outcomes: SourceOutcome[] = [];
  for (const source of SECONDARY_SOURCES) {
    outcomes.push(await syncSource(source, execution, dependencies));
  }

  // The operational summary only admits scalar fields, so per-source
  // outcomes are flattened into `<source>_*` keys.
  const summary: Record<string, unknown> = {
    stored_count: outcomes.filter((o) => o.outcome === "stored").length,
    skipped_count: outcomes.filter((o) => o.outcome === "skipped").length,
    failed_count: outcomes.filter((o) => o.outcome === "failed").length,
  };
  for (const outcome of outcomes) {
    summary[`${outcome.source}_outcome`] = outcome.outcome;
    if (outcome.code) summary[`${outcome.source}_code`] = outcome.code;
    if (outcome.stored_count !== undefined) {
      summary[`${outcome.source}_stored_count`] = outcome.stored_count;
    }
    if (outcome.checked_at) {
      summary[`${outcome.source}_checked_at`] = outcome.checked_at;
    }
    if (outcome.snapshot_age_ms !== undefined) {
      summary[`${outcome.source}_snapshot_age_ms`] = outcome.snapshot_age_ms;
    }
  }

  const failedCount = summary.failed_count as number;
  if (failedCount > 0 && failedCount === outcomes.length) {
    throw new OperationalError("secondary_feed_sync_failed", summary);
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker(
    "secondary_feed_sync",
    request,
    context,
    runSecondaryFeedSync,
  );

export default handler;

export const config: Config = { schedule: "20 0,6,12,18 * * *" };
