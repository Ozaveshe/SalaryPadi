import { randomUUID } from "node:crypto";

import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  AtsAdapterError,
  fetchAtsSourceRecords,
  type AtsFetchResult,
  type AtsFetchOptions,
  type AtsSourceConfig,
} from "../../src/lib/jobs/ats";
import {
  normalizeAtsImportRecords,
  type AtsImportJob,
} from "../../src/lib/jobs/ats-import";
import { fullJitterDelayMs } from "../../src/lib/jobs/supply/schedules";

import {
  parseAuthorizedAtsRuntimePolicies,
  parseClaimedAuthorizedAtsRuntimePolicy,
} from "./_shared/ats-source-policy";
import {
  boundedSignal,
  getRuntimeBoolean,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

const MAX_SOURCES_PER_RUN = 1;
const MAX_PROVIDER_RECORDS = 400;
const MAX_BATCH_RECORDS = 200;
const MAX_BATCH_BYTES = 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 8_000;
const CLEANUP_TIMEOUT_MS = 3_000;

type AtsSourceSyncRpc = (
  functionName: string,
  parameters?: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<unknown>;

type AtsSourceSyncDependencies = {
  rpc?: AtsSourceSyncRpc;
  fetchSource?: typeof fetchAtsSourceRecords;
  now?: () => Date;
  randomUuid?: () => string;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const uuidSchema = z.string().uuid();
const beginResultSchema = z
  .array(
    z
      .object({
        import_run_id: z.string().uuid(),
        should_run: z.boolean(),
      })
      .strict(),
  )
  .length(1);
const resultObjectSchema = z.record(z.string(), z.unknown());

function safeErrorCode(reason: unknown): string {
  if (reason instanceof AtsAdapterError) return reason.code;
  if (
    reason instanceof OperationalError &&
    /^[a-z0-9_]{2,80}$/.test(reason.code)
  ) {
    return reason.code;
  }
  if (
    reason instanceof DOMException &&
    (reason.name === "AbortError" || reason.name === "TimeoutError")
  ) {
    return "ats_source_deadline_exceeded";
  }
  return "ats_source_sync_failed";
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function chunkAtsImportRecords(
  records: readonly AtsImportJob[],
  maxBytes = MAX_BATCH_BYTES,
  maxRecords = MAX_BATCH_RECORDS,
): AtsImportJob[][] {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1024 ||
    !Number.isSafeInteger(maxRecords) ||
    maxRecords < 1
  ) {
    throw new OperationalError("ats_batch_limit_invalid");
  }

  const batches: AtsImportJob[][] = [];
  let batch: AtsImportJob[] = [];
  let batchBytes = 2;

  for (const record of records) {
    const recordBytes = jsonByteLength(record);
    if (recordBytes + 2 > maxBytes) {
      throw new OperationalError("ats_import_record_too_large");
    }
    const separatorBytes = batch.length > 0 ? 1 : 0;
    if (
      batch.length >= maxRecords ||
      batchBytes + separatorBytes + recordBytes > maxBytes
    ) {
      batches.push(batch);
      batch = [];
      batchBytes = 2;
    }
    batch.push(record);
    batchBytes += (batch.length > 1 ? 1 : 0) + recordBytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function providerSnapshotIsComplete(result: AtsFetchResult): boolean {
  const reportedTotal = result.snapshot.providerReportedTotal;
  return (
    result.snapshot.status === "complete" &&
    result.invalidRecords.length === 0 &&
    (reportedTotal === null ||
      reportedTotal === result.snapshot.providerRecordCount)
  );
}

function retryableAtsFailure(reason: unknown) {
  return (
    reason instanceof AtsAdapterError &&
    (reason.code === "ats_request_failed" ||
      (reason.code === "ats_http_error" &&
        reason.status !== null &&
        ([408, 425, 429].includes(reason.status) || reason.status >= 500)))
  );
}

export async function fetchAtsWithRetry(
  fetchSource: typeof fetchAtsSourceRecords,
  source: AtsSourceConfig,
  options: AtsFetchOptions,
  dependencies: Pick<AtsSourceSyncDependencies, "random" | "sleep"> = {},
) {
  const random = dependencies.random ?? Math.random;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchSource(source, options);
    } catch (reason) {
      if (
        attempt === 2 ||
        options.signal.aborted ||
        !retryableAtsFailure(reason)
      ) {
        throw reason;
      }
      await sleep(fullJitterDelayMs(attempt, 200, 1_000, random));
    }
  }
  throw new OperationalError("ats_retry_unreachable");
}

async function recordPreImportFailure(
  callRpc: AtsSourceSyncRpc,
  adapterKey: string,
  fetchedCount: number,
  code: string,
  signal: AbortSignal,
) {
  await callRpc(
    "worker_record_source_import",
    {
      p_adapter_key: adapterKey,
      p_fetched_count: fetchedCount,
      p_status: "failed",
      p_error_code: code,
    },
    { signal },
  ).catch(() => undefined);
}

export async function runAtsSourceSync(
  execution: WorkerExecution,
  dependencies: AtsSourceSyncDependencies = {},
) {
  if (!getRuntimeBoolean("ATS_SOURCE_SYNC_ENABLED", false)) {
    return workerSkipped("ats_source_sync_disabled");
  }

  const callRpc = dependencies.rpc ?? rpc;
  const fetchSource = dependencies.fetchSource ?? fetchAtsSourceRecords;
  const now = dependencies.now ?? (() => new Date());
  const createRequestKey = dependencies.randomUuid ?? randomUUID;
  const listedPolicies = parseAuthorizedAtsRuntimePolicies(
    await callRpc(
      "worker_list_authorized_ats_sources",
      {},
      { signal: execution.signal },
    ),
    now(),
  );
  if (listedPolicies.length === 0) {
    return workerSkipped("no_authorized_ats_sources");
  }

  let claimedSources = 0;
  let completedSources = 0;
  let duplicateSources = 0;
  let partialSources = 0;
  let failedSources = 0;
  let providerRecords = 0;
  let storedRecords = 0;
  let quarantinedRecords = 0;

  for (const listedPolicy of listedPolicies) {
    if (
      claimedSources >= MAX_SOURCES_PER_RUN ||
      execution.remainingMs() < 6_000
    ) {
      break;
    }

    const requestKey = createRequestKey();
    if (!uuidSchema.safeParse(requestKey).success) {
      throw new OperationalError("ats_request_key_invalid");
    }
    const claimed = parseClaimedAuthorizedAtsRuntimePolicy(
      await callRpc(
        "worker_claim_authorized_ats_source",
        {
          p_adapter_key: listedPolicy.source.key,
          p_request_key: requestKey,
          p_purpose: "scheduled_sync",
        },
        { signal: execution.signal },
      ),
      now(),
    );
    if (!claimed.claimed) continue;
    const policy = claimed.policy;
    if (policy.source.key !== listedPolicy.source.key) {
      throw new OperationalError("ats_source_claim_mismatch");
    }
    claimedSources += 1;

    let importRunId: string | null = null;
    let fetchedCount = 0;
    try {
      const sourceSignal = boundedSignal(
        execution.signal,
        Math.min(
          SOURCE_FETCH_TIMEOUT_MS,
          Math.max(1_000, execution.remainingMs() - 4_000),
        ),
      );
      const result = await fetchAtsWithRetry(
        fetchSource,
        policy.source,
        {
          signal: sourceSignal,
          requestedAt: now(),
        },
        dependencies,
      );
      fetchedCount = result.snapshot.providerRecordCount;
      providerRecords += fetchedCount;
      if (
        fetchedCount > MAX_PROVIDER_RECORDS ||
        result.records.length > MAX_PROVIDER_RECORDS
      ) {
        throw new OperationalError("ats_source_record_limit_exceeded", {
          limit: MAX_PROVIDER_RECORDS,
          provider_records: fetchedCount,
        });
      }

      const normalized = normalizeAtsImportRecords(result.records, {
        sourceKey: policy.source.key,
        employerName: policy.source.employerName,
        mayStoreFullDescription: policy.mayStoreFullDescription,
      });
      const adapterQuarantines = result.invalidRecords.length;
      const totalQuarantines = adapterQuarantines + normalized.quarantinedCount;
      quarantinedRecords += totalQuarantines;

      const totalMatches =
        result.snapshot.providerReportedTotal === null ||
        result.snapshot.providerReportedTotal ===
          result.snapshot.providerRecordCount;
      const complete =
        providerSnapshotIsComplete(result) && normalized.quarantinedCount === 0;
      const errorCodes = new Set<string>();
      if (adapterQuarantines > 0) errorCodes.add("ats_invalid_records");
      if (normalized.quarantinedCount > 0) {
        errorCodes.add("ats_import_quarantine");
      }
      if (!totalMatches) errorCodes.add("ats_provider_total_mismatch");

      const rawBegin = await callRpc(
        "worker_begin_ats_snapshot",
        {
          p_adapter_key: policy.source.key,
          p_checked_at: result.checkedAt,
          p_provider_count: result.snapshot.providerRecordCount,
          p_expected_record_count: normalized.jobs.length,
        },
        { signal: execution.signal },
      );
      const begun = beginResultSchema.safeParse(rawBegin);
      if (!begun.success) {
        throw new OperationalError("ats_import_begin_invalid");
      }
      importRunId = begun.data[0]!.import_run_id;
      if (!begun.data[0]!.should_run) {
        importRunId = null;
        duplicateSources += 1;
        continue;
      }

      for (const batch of chunkAtsImportRecords(normalized.jobs)) {
        const batchResult = await callRpc(
          "worker_store_ats_snapshot_batch",
          { p_import_run_id: importRunId, p_records: batch },
          { signal: execution.signal },
        );
        if (!resultObjectSchema.safeParse(batchResult).success) {
          throw new OperationalError("ats_import_batch_invalid");
        }
      }

      const finalResult = await callRpc(
        "worker_finalize_ats_snapshot",
        {
          p_import_run_id: importRunId,
          p_complete: complete,
          p_quarantined_count: totalQuarantines,
          p_error_codes: [...errorCodes],
        },
        { signal: execution.signal },
      );
      if (!resultObjectSchema.safeParse(finalResult).success) {
        throw new OperationalError("ats_import_finalize_invalid");
      }

      storedRecords += normalized.jobs.length;
      if (complete) completedSources += 1;
      else partialSources += 1;
    } catch (reason) {
      failedSources += 1;
      const code = safeErrorCode(reason);
      // The operation signal can already be aborted here. The tracked worker
      // reserves four seconds after its operation budget, so use an independent
      // bounded signal to record a terminal snapshot/source failure safely.
      const cleanupSignal = boundedSignal(undefined, CLEANUP_TIMEOUT_MS);
      if (importRunId) {
        await callRpc(
          "worker_finalize_ats_snapshot",
          {
            p_import_run_id: importRunId,
            p_complete: false,
            p_quarantined_count: 0,
            p_error_codes: [code],
          },
          { signal: cleanupSignal },
        ).catch(() => undefined);
      } else {
        await recordPreImportFailure(
          callRpc,
          policy.source.key,
          fetchedCount,
          code,
          cleanupSignal,
        );
      }
    }
  }

  const summary = {
    configured_sources: listedPolicies.length,
    claimed_sources: claimedSources,
    completed_sources: completedSources,
    duplicate_sources: duplicateSources,
    partial_sources: partialSources,
    failed_sources: failedSources,
    provider_records: providerRecords,
    stored_records: storedRecords,
    quarantined_records: quarantinedRecords,
  };
  if (claimedSources === 0) return workerSkipped("ats_sources_not_due");
  if (failedSources > 0 || partialSources > 0) {
    throw new OperationalError("ats_source_sync_incomplete", summary);
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("ats_source_sync", request, context, runAtsSourceSync);

export default handler;

export const config: Config = {
  // Seventeen minutes is a deterministic per-worker jitter inside the allowed
  // 0-20 minute window. Per-source database claims still enforce stricter terms.
  schedule: "17 */2 * * *",
};
