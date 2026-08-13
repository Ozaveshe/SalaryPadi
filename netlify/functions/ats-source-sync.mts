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
  decodeRpcResult,
  getRuntimeBoolean,
  observeSecondaryOperation,
  OperationalError,
  rpc,
  rpcUuidResultSchema,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

/**
 * How many sources one invocation may claim.
 *
 * Sized against the measured run cost rather than guessed. Over 96 consecutive
 * production runs at one source per run the whole invocation averaged 4.2s,
 * p95 6.9s and peaked at 9.2s, including the registry read and the wasted
 * claim attempts on sources that were not due. The operation budget is 20s.
 *
 * This is a ceiling, not a target: `SOURCE_TIME_RESERVE_MS` decides how many
 * are actually started, and a run that stops early on time has done nothing
 * wrong.
 *
 * Raising this does not shorten any source's own cadence. Per-source interval,
 * request spacing and daily budget are all enforced inside
 * `api.worker_claim_authorized_ats_source`, which refuses a source that is not
 * yet due. The only thing that changes is how many *different* boards one run
 * may visit, which is what determines how quickly the registry is walked.
 */
const MAX_SOURCES_PER_RUN = 4;
// Provider payload schemas already reject snapshots above 2,000 rows. Keep
// that defensive ceiling here, but apply the tighter write ceiling only after
// the adapter and publication policy have removed irrelevant records. A large
// employer board can contain hundreds of non-African roles and only a small,
// publishable Africa subset; rejecting it before filtering loses that subset.
const MAX_PROVIDER_SNAPSHOT_RECORDS = 2_000;
const MAX_IMPORT_RECORDS = 400;
const MAX_BATCH_RECORDS = 200;
const MAX_BATCH_BYTES = 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 8_000;
// A near-cap batch can legitimately take longer than the shared 4s RPC
// default: production stored 149 Yassir rows in 6.8s, committed them, then the
// client timed out and falsely finalized the snapshot as partial. Keep this
// scoped to batch persistence and below the worker's 20s operation budget.
const STORE_BATCH_TIMEOUT_MS = 8_000;
const CLEANUP_TIMEOUT_MS = 3_000;

/**
 * Budget a source must have left before the loop will claim it.
 *
 * This was 6s, which is below what one source costs. The measured figures in
 * the comment above are 4.2s average and 6.9s p95 for a whole source, and the
 * fetch alone is allowed 8s — so roughly one start in twenty began work it
 * could not finish, and the run died mid-source. Production bore that out:
 * `ats_source_sync` failed 3-11 times a day for at least a week, always with
 * `ats_source_deadline_exceeded` on the last source claimed.
 *
 * The cost of that was not just a red health check. `worker_claim_authorized_
 * ats_source` writes the claim row *before* the fetch, and a claim blocks the
 * source for its whole fetch interval — two hours for most boards. A source
 * killed by the deadline therefore lost its slot without importing anything.
 * Refusing to start it is a throughput gain, not a sacrifice.
 *
 * Ten seconds covers the measured peak of 9.2s. The registry walk does not
 * suffer: most runs already end in `ats_sources_not_due`, so per-source
 * cadence, not claims per run, is what bounds how often a board is visited.
 */
const SOURCE_TIME_RESERVE_MS = 10_000;

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
const atsResultCountSchema = z.number().int().min(0).max(2_000);
const storeBatchResultSchema = z
  .object({
    accepted_count: z.number().int().min(1).max(MAX_BATCH_RECORDS),
    created_count: atsResultCountSchema,
    updated_count: atsResultCountSchema,
    unchanged_count: atsResultCountSchema,
  })
  .strict();
const finalizeResultSchema = z
  .object({
    outcome: z.enum(["complete", "quarantined", "partial", "failed"]),
    fetched_count: atsResultCountSchema,
    expected_record_count: atsResultCountSchema,
    filtered_count: atsResultCountSchema,
    created_count: atsResultCountSchema,
    updated_count: atsResultCountSchema,
    unchanged_count: atsResultCountSchema,
    expired_count: atsResultCountSchema,
    error_count: atsResultCountSchema,
  })
  .strict();
type StoreBatchResult = z.infer<typeof storeBatchResultSchema>;
type FinalizeResult = z.infer<typeof finalizeResultSchema>;

export function assertAtsBatchAcknowledgement(
  stored: StoreBatchResult,
  expectedRecordCount: number,
) {
  if (
    stored.accepted_count !== expectedRecordCount ||
    stored.created_count + stored.updated_count + stored.unchanged_count !==
      expectedRecordCount
  ) {
    throw new OperationalError("ats_import_batch_ack_mismatch");
  }
}

export function assertAtsFinalizeAcknowledgement(
  finalized: FinalizeResult,
  expected: {
    complete: boolean;
    providerRecordCount: number;
    expectedRecordCount: number;
    errorCount: number;
  },
) {
  if (
    (expected.complete
      ? finalized.outcome !== "complete"
      : finalized.outcome === "complete") ||
    finalized.fetched_count !== expected.providerRecordCount ||
    finalized.expected_record_count !== expected.expectedRecordCount ||
    finalized.filtered_count !==
      expected.providerRecordCount - expected.expectedRecordCount ||
    finalized.created_count +
      finalized.updated_count +
      finalized.unchanged_count !==
      expected.expectedRecordCount ||
    finalized.error_count !== expected.errorCount
  ) {
    throw new OperationalError("ats_import_finalize_ack_mismatch");
  }
}
// Bounds the registry the worker will read, NOT how much it does per run --
// MAX_SOURCES_PER_RUN caps the claims. The cap was 50, which silently failed
// every run with `ats_source_registry_invalid` once the authorized board count
// passed it, so it is sized well clear of the current roster while still
// refusing an implausibly large registry.
const authorizedPoliciesEnvelopeSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(400);
const claimedPolicyEnvelopeSchema = z.record(z.string(), z.unknown());
const rpcShapeErrorCodes: Record<string, string> = {
  worker_list_authorized_ats_sources: "ats_source_registry_invalid",
  worker_list_due_authorized_ats_sources: "ats_due_source_registry_invalid",
  worker_claim_authorized_ats_source: "ats_source_claim_invalid",
  worker_begin_ats_snapshot: "ats_import_begin_invalid",
  worker_store_ats_snapshot_batch: "ats_import_batch_invalid",
  worker_finalize_ats_snapshot: "ats_import_finalize_invalid",
  worker_record_source_import: "source_import_evidence_invalid",
};

function validatedRpc(dependency?: AtsSourceSyncRpc): typeof rpc {
  return async <T,>(
    functionName: string,
    resultSchema: z.ZodType<T>,
    parameters: Record<string, unknown> = {},
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ) => {
    try {
      if (!dependency) {
        return await rpc(functionName, resultSchema, parameters, options);
      }
      return decodeRpcResult(
        functionName,
        resultSchema,
        await dependency(functionName, parameters, options),
      );
    } catch (reason) {
      if (
        reason instanceof OperationalError &&
        reason.code === "supabase_rpc_invalid_shape" &&
        rpcShapeErrorCodes[functionName]
      ) {
        throw new OperationalError(rpcShapeErrorCodes[functionName]);
      }
      throw reason;
    }
  };
}

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
  callRpc: typeof rpc,
  adapterKey: string,
  fetchedCount: number,
  code: string,
  signal: AbortSignal,
) {
  return observeSecondaryOperation(
    "ats_record_pre_import_failure",
    callRpc(
      "worker_record_source_import",
      rpcUuidResultSchema,
      {
        p_adapter_key: adapterKey,
        p_fetched_count: fetchedCount,
        p_status: "failed",
        p_error_code: code,
      },
      { signal },
    ),
  );
}

export async function runAtsSourceSync(
  execution: WorkerExecution,
  dependencies: AtsSourceSyncDependencies = {},
) {
  if (!getRuntimeBoolean("ATS_SOURCE_SYNC_ENABLED", false)) {
    return workerSkipped("ats_source_sync_disabled");
  }

  const callRpc = validatedRpc(dependencies.rpc);
  const fetchSource = dependencies.fetchSource ?? fetchAtsSourceRecords;
  const now = dependencies.now ?? (() => new Date());
  const createRequestKey = dependencies.randomUuid ?? randomUUID;
  const listedPolicies = parseAuthorizedAtsRuntimePolicies(
    await callRpc(
      "worker_list_due_authorized_ats_sources",
      authorizedPoliciesEnvelopeSchema,
      {},
      { signal: execution.signal },
    ),
    now(),
  );
  if (listedPolicies.length === 0) {
    /*
     * An empty due list normally means the cadence guards are doing their job.
     * Distinguish that from a completely empty authorized registry with one
     * bounded fallback read; the common productive path still uses one list
     * RPC, while an idle run no longer spends its budget on one claim RPC per
     * non-due board.
     */
    const authorizedPolicies = parseAuthorizedAtsRuntimePolicies(
      await callRpc(
        "worker_list_authorized_ats_sources",
        authorizedPoliciesEnvelopeSchema,
        {},
        { signal: execution.signal },
      ),
      now(),
    );
    return workerSkipped(
      authorizedPolicies.length === 0
        ? "no_authorized_ats_sources"
        : "ats_sources_not_due",
    );
  }

  let claimedSources = 0;
  let inspectedSources = 0;
  let completedSources = 0;
  let duplicateSources = 0;
  let partialSources = 0;
  /** Sources that offered records and had every one of them rejected. */
  let quarantinedSources = 0;
  let failedSources = 0;
  /** Sources the worker's own budget cut short. Not the source's fault. */
  let interruptedSources = 0;
  /** The most any one source in this run has cost, for the claim reserve. */
  let slowestSourceMs = 0;
  let providerRecords = 0;
  let storedRecords = 0;
  let filteredRecords = 0;
  let quarantinedRecords = 0;
  const failureCodes = new Set<string>();
  let secondaryFailureCount = 0;
  const secondaryFailureCodes = new Set<string>();
  let inspectionStopped: "completed" | "claim_limit" | "time_budget" =
    "completed";

  for (const listedPolicy of listedPolicies) {
    if (claimedSources >= MAX_SOURCES_PER_RUN) {
      inspectionStopped = "claim_limit";
      break;
    }
    /*
     * The reserve rises to whatever this run has actually seen a source cost.
     * A fixed number is a guess about every board at once; boards differ by an
     * order of magnitude, and the slow ones are exactly the ones that overran.
     * Measuring from the remaining budget rather than a clock keeps this
     * honest under an injected time source in tests.
     */
    const reserveMs = Math.max(SOURCE_TIME_RESERVE_MS, slowestSourceMs + 1_000);
    if (execution.remainingMs() < reserveMs) {
      inspectionStopped = "time_budget";
      break;
    }
    inspectedSources += 1;

    const requestKey = createRequestKey();
    if (!uuidSchema.safeParse(requestKey).success) {
      throw new OperationalError("ats_request_key_invalid");
    }
    const claimed = parseClaimedAuthorizedAtsRuntimePolicy(
      await callRpc(
        "worker_claim_authorized_ats_source",
        claimedPolicyEnvelopeSchema,
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
    const remainingBeforeSource = execution.remainingMs();
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
        fetchedCount > MAX_PROVIDER_SNAPSHOT_RECORDS ||
        result.records.length > MAX_PROVIDER_SNAPSHOT_RECORDS
      ) {
        throw new OperationalError("ats_source_record_limit_exceeded", {
          limit: MAX_PROVIDER_SNAPSHOT_RECORDS,
          provider_records: fetchedCount,
        });
      }

      const normalized = normalizeAtsImportRecords(result.records, {
        sourceKey: policy.source.key,
        employerName: policy.source.employerName,
        mayStoreFullDescription: policy.mayStoreFullDescription,
      });
      if (normalized.jobs.length > MAX_IMPORT_RECORDS) {
        throw new OperationalError("ats_source_import_limit_exceeded", {
          limit: MAX_IMPORT_RECORDS,
          import_records: normalized.jobs.length,
          provider_records: fetchedCount,
        });
      }
      const adapterQuarantines = result.invalidRecords.length;
      const totalQuarantines = adapterQuarantines + normalized.quarantinedCount;
      filteredRecords +=
        result.snapshot.filteredRecordCount + normalized.filteredCount;
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

      const begun = await callRpc(
        "worker_begin_ats_snapshot",
        beginResultSchema,
        {
          p_adapter_key: policy.source.key,
          p_checked_at: result.checkedAt,
          p_provider_count: result.snapshot.providerRecordCount,
          p_expected_record_count: normalized.jobs.length,
        },
        { signal: execution.signal },
      );
      importRunId = begun[0]!.import_run_id;
      if (!begun[0]!.should_run) {
        importRunId = null;
        duplicateSources += 1;
        continue;
      }

      for (const batch of chunkAtsImportRecords(normalized.jobs)) {
        const stored = await callRpc(
          "worker_store_ats_snapshot_batch",
          storeBatchResultSchema,
          { p_import_run_id: importRunId, p_records: batch },
          { signal: execution.signal, timeoutMs: STORE_BATCH_TIMEOUT_MS },
        );
        assertAtsBatchAcknowledgement(stored, batch.length);
      }

      const finalized = await callRpc(
        "worker_finalize_ats_snapshot",
        finalizeResultSchema,
        {
          p_import_run_id: importRunId,
          p_complete: complete,
          p_quarantined_count: totalQuarantines,
          p_error_codes: [...errorCodes],
        },
        { signal: execution.signal },
      );
      assertAtsFinalizeAcknowledgement(finalized, {
        complete,
        providerRecordCount: result.snapshot.providerRecordCount,
        expectedRecordCount: normalized.jobs.length,
        errorCount: totalQuarantines + errorCodes.size,
      });
      storedRecords += normalized.jobs.length;
      /*
       * Three outcomes, not two. A snapshot that stored nothing at all because
       * every record it offered was rejected is a different event from one that
       * stored most of them and rejected a few, and only the first says
       * something is wrong with the import itself.
       *
       * A board that genuinely publishes no roles is `complete` above — this
       * branch is only reached when the snapshot was not complete, so reaching
       * it with nothing stored means everything on offer was unusable.
       */
      if (complete) completedSources += 1;
      else if (normalized.jobs.length > 0) partialSources += 1;
      else quarantinedSources += 1;
    } catch (reason) {
      const code = safeErrorCode(reason);
      /*
       * Whose deadline ended this source decides whether it is a fault.
       *
       * A source that exceeded its own fetch timeout is slow, and that is the
       * board's problem to report. A source cut off because the *worker* ran
       * out of budget is not: the run simply walked further than it had time
       * for. Both arrive here as an AbortError, and the only thing that tells
       * them apart is whether the operation signal is the one that fired.
       *
       * Counting the second as a source failure is what kept this worker red.
       * Runs that imported dozens of records across three boards were filed as
       * failures because the clock stopped them partway through a fourth.
       */
      if (execution.signal.aborted) {
        interruptedSources += 1;
        inspectionStopped = "time_budget";
      } else {
        failedSources += 1;
      }
      failureCodes.add(code);
      // The operation signal can already be aborted here. The tracked worker
      // reserves four seconds after its operation budget, so use an independent
      // bounded signal to record a terminal snapshot/source failure safely.
      const cleanupSignal = boundedSignal(undefined, CLEANUP_TIMEOUT_MS);
      let secondaryFailure;
      if (importRunId) {
        secondaryFailure = await observeSecondaryOperation(
          "ats_finalize_failed_snapshot",
          callRpc(
            "worker_finalize_ats_snapshot",
            finalizeResultSchema,
            {
              p_import_run_id: importRunId,
              p_complete: false,
              p_quarantined_count: 0,
              p_error_codes: [code],
            },
            { signal: cleanupSignal },
          ),
        );
      } else {
        secondaryFailure = await recordPreImportFailure(
          callRpc,
          policy.source.key,
          fetchedCount,
          code,
          cleanupSignal,
        );
      }
      if (secondaryFailure) {
        secondaryFailureCount += 1;
        secondaryFailureCodes.add(secondaryFailure.code);
      }
    } finally {
      slowestSourceMs = Math.max(
        slowestSourceMs,
        Math.max(0, remainingBeforeSource - execution.remainingMs()),
      );
    }
  }

  const summary = {
    due_sources: listedPolicies.length,
    inspected_sources: inspectedSources,
    deferred_sources: listedPolicies.length - inspectedSources,
    inspection_stopped: inspectionStopped,
    claimed_sources: claimedSources,
    completed_sources: completedSources,
    duplicate_sources: duplicateSources,
    partial_sources: partialSources,
    quarantined_sources: quarantinedSources,
    failed_sources: failedSources,
    interrupted_sources: interruptedSources,
    provider_records: providerRecords,
    stored_records: storedRecords,
    filtered_records: filteredRecords,
    quarantined_records: quarantinedRecords,
    failure_codes: [...failureCodes].sort(),
    secondary_failure_count: secondaryFailureCount,
    secondary_failure_codes: [...secondaryFailureCodes].sort(),
  };
  /*
   * A partial import is a property of the data, not a fault in the run.
   *
   * A board that offers two hundred roles and has six rejected has been
   * imported: the good records landed, the bad ones are quarantined, and both
   * counts are in the summary and on the import run. Failing the whole
   * invocation for that made the worker permanently unhealthy the moment the
   * registry walk started reaching boards for the first time — most runs touch
   * a new board, most new boards reject something, so the signal went red and
   * stayed red while hundreds of records were importing correctly. An alert
   * that is always on is not an alert.
   *
   * A source that offered records and had every one rejected is the opposite:
   * nothing was importable, which points at the adapter or the board rather
   * than at a few bad rows. The lane fails when every claimed source ends in
   * that state or throws; mixed runs preserve each source failure below.
   */
  const productiveSources =
    completedSources + partialSources + duplicateSources;
  /*
   * Worker health describes the acquisition lane, not the availability of
   * every individual board. A mixed run can import hundreds of valid records
   * while one provider times out. The failed board already has durable source
   * import evidence and remains visible in this summary; failing the whole
   * worker would discard the truthful distinction and page operations for a
   * lane that made progress.
   *
   * Fail closed when no claimed source produced a usable or duplicate
   * snapshot. That is a lane-wide failure and must still degrade health.
   */
  if (
    (failedSources > 0 || quarantinedSources > 0) &&
    productiveSources === 0
  ) {
    throw new OperationalError("ats_source_sync_incomplete", summary);
  }
  /*
   * An interrupted source is the same kind of event as stopping on the claim
   * limit: the run went as far as its budget allowed. It fails only when the
   * budget bought nothing, which would mean the very first source overran and
   * something is wrong with the reserve rather than with the schedule.
   */
  if (interruptedSources > 0 && productiveSources === 0) {
    throw new OperationalError("ats_source_sync_interrupted", summary);
  }
  /*
   * Running out of time is only a fault when the run achieved nothing with it.
   *
   * With one claim per run the loop always stopped at `claim_limit`, so hitting
   * the time budget meant the invocation had burned its whole budget without
   * claiming a single source — a real failure. Claiming several makes stopping
   * on time an ordinary outcome: the run walked as far as its budget allowed
   * and completed every source it started. Treating that as a failure would
   * mark most healthy runs failed and push the worker's freshness to degraded
   * for doing exactly what it is asked to do.
   *
   * `inspection_stopped` is in the summary either way, so a run that ended on
   * time rather than on the claim limit is still visible to anyone reading it.
   */
  if (claimedSources === 0) {
    if (inspectionStopped === "time_budget") {
      throw new OperationalError(
        "ats_source_sync_time_budget_exhausted",
        summary,
      );
    }
    return workerSkipped("ats_sources_not_due");
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("ats_source_sync", request, context, runAtsSourceSync);

export default handler;

export const config: Config = {
  // One bounded source is claimed every fifteen minutes. Per-source database
  // claims still enforce the reviewed two-hour (or stricter) source cadence.
  // This removes the old twelve-source-claims/day global throughput ceiling.
  schedule: "2,17,32,47 * * * *",
};
