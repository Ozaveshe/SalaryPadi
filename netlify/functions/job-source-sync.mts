import { randomUUID } from "node:crypto";

import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "../../src/lib/jobs/source-policy";
import { openSupplyAdapter } from "../../src/lib/jobs/supply/adapters";
import { AdapterPolicyError } from "../../src/lib/jobs/supply/policy";

import {
  fetchPublishedRemotiveSnapshot,
  mergeAlertJobCatalogs,
  storeAlertJobCatalog,
} from "./_shared/jobs";
import {
  decodeRpcResult,
  getRuntimeBoolean,
  observeSecondaryOperation,
  OperationalError,
  rpc,
  rpcBooleanResultSchema,
  rpcUuidResultSchema,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

const sourcePolicySchema = z
  .array(
    z
      .object({
        adapter_key: z.literal(REMOTIVE_ADAPTER_KEY),
        source_type: z.literal(REMOTIVE_SOURCE_POLICY.type),
        status: z.enum(["draft", "active", "paused", "disabled"]),
        terms_url: z.literal(REMOTIVE_SOURCE_POLICY.termsUrl),
        terms_reviewed_at: z.string().datetime({ offset: true }).nullable(),
        terms_version: z.literal(REMOTIVE_TERMS_VERSION),
        allow_public_listing: z.boolean(),
        attribution_required: z.boolean(),
        may_store_full_description: z.boolean(),
        may_index_jobs: z.boolean(),
        may_emit_jobposting_schema: z.boolean(),
        required_destination_kind: z.literal(
          REMOTIVE_REQUIRED_DESTINATION_KIND,
        ),
        refresh_interval_seconds: z.literal(
          REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds,
        ),
      })
      .strict(),
  )
  .max(1);

type SourceSyncRpc = (
  functionName: string,
  parameters?: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<unknown>;

type JobSourceSyncDependencies = {
  rpc?: SourceSyncRpc;
  fetchSnapshot?: typeof fetchPublishedRemotiveSnapshot;
  storeCatalog?: typeof storeAlertJobCatalog;
  randomUuid?: () => string;
};

const rpcShapeErrorCodes: Record<string, string> = {
  worker_get_job_source_policy: "remotive_source_policy_invalid",
  worker_claim_remotive_fetch: "remotive_fetch_claim_invalid",
  worker_record_source_import_v2: "source_import_evidence_invalid",
};

function validatedRpc(dependency?: SourceSyncRpc): typeof rpc {
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

export async function runJobSourceSync(
  { signal }: WorkerExecution,
  dependencies: JobSourceSyncDependencies = {},
) {
  const startedAt = new Date().toISOString();
  if (!getRuntimeBoolean("REMOTIVE_SOURCE_ENABLED", false)) {
    return workerSkipped("remotive_source_disabled");
  }
  try {
    openSupplyAdapter("remotive", new Date(startedAt));
  } catch (reason) {
    const code =
      reason instanceof AdapterPolicyError
        ? `remotive_${reason.code}`
        : "remotive_policy_invalid";
    return workerSkipped(code);
  }

  const callRpc = validatedRpc(dependencies.rpc);
  const fetchSnapshot =
    dependencies.fetchSnapshot ?? fetchPublishedRemotiveSnapshot;
  const storeCatalog = dependencies.storeCatalog ?? storeAlertJobCatalog;
  const createRequestKey = dependencies.randomUuid ?? randomUUID;
  let fetchedCount = 0;
  let acceptedCount = 0;
  let duplicateCount = 0;
  let nigeriaLocalCount = 0;
  let explicitEligibleCount = 0;
  let unclearEligibilityCount = 0;
  let sourceCheckedAt: string | null = null;
  try {
    const parsedPolicy = await callRpc(
      "worker_get_job_source_policy",
      sourcePolicySchema,
      { p_adapter_key: REMOTIVE_ADAPTER_KEY },
      { signal },
    );
    if (parsedPolicy.length !== 1) {
      throw new OperationalError("remotive_source_policy_invalid");
    }
    const policy = parsedPolicy[0]!;
    if (policy.status !== "active") {
      return workerSkipped(`remotive_source_${policy.status}`);
    }
    if (
      !policy.allow_public_listing ||
      !policy.attribution_required ||
      !policy.terms_reviewed_at ||
      policy.may_store_full_description ||
      policy.may_index_jobs ||
      policy.may_emit_jobposting_schema
    ) {
      throw new OperationalError("remotive_source_policy_mismatch");
    }

    const requestKey = createRequestKey();
    if (!z.string().uuid().safeParse(requestKey).success) {
      throw new OperationalError("remotive_request_key_invalid");
    }
    const claimed = await callRpc(
      "worker_claim_remotive_fetch",
      rpcBooleanResultSchema,
      { p_request_key: requestKey, p_purpose: "scheduled_sync" },
      { signal },
    );
    if (claimed !== true) return workerSkipped("remotive_fetch_not_due");

    const snapshot = await fetchSnapshot(signal);
    sourceCheckedAt = snapshot.checkedAt;
    fetchedCount = snapshot.jobs.length;
    if (fetchedCount === 0) {
      throw new OperationalError("remotive_source_empty");
    }
    const canonicalJobs = mergeAlertJobCatalogs([], snapshot.jobs);
    acceptedCount = canonicalJobs.length;
    duplicateCount = fetchedCount - acceptedCount;
    nigeriaLocalCount = canonicalJobs.filter(
      (job) =>
        job.workMode !== "remote" && /\bnigeria\b/i.test(job.locationDisplay),
    ).length;
    explicitEligibleCount = canonicalJobs.filter(
      (job) =>
        job.eligibility.nigeria === "eligible" ||
        job.eligibility.africa === "eligible",
    ).length;
    unclearEligibilityCount = canonicalJobs.filter(
      (job) =>
        job.eligibility.nigeria === "unclear" &&
        job.eligibility.africa === "unclear",
    ).length;
    const catalogCount = await storeCatalog(
      snapshot.jobs,
      signal,
      snapshot.checkedAt,
    );
    if (catalogCount !== fetchedCount) {
      throw new OperationalError("job_catalog_count_mismatch", {
        fetched_count: fetchedCount,
        catalog_count: catalogCount,
      });
    }
    await callRpc(
      "worker_record_source_import_v2",
      rpcUuidResultSchema,
      {
        p_adapter_key: REMOTIVE_ADAPTER_KEY,
        p_started_at: startedAt,
        p_source_checked_at: sourceCheckedAt,
        p_fetched_count: fetchedCount,
        p_accepted_count: acceptedCount,
        p_duplicate_count: duplicateCount,
        p_rejected_count: 0,
        p_nigeria_local_count: nigeriaLocalCount,
        p_explicit_eligible_count: explicitEligibleCount,
        p_unclear_eligibility_count: unclearEligibilityCount,
        p_status: "succeeded",
        p_error_code: null,
      },
      { signal },
    );
    return workerSucceeded({
      source: REMOTIVE_ADAPTER_KEY,
      source_checked_at: sourceCheckedAt,
      fetched_count: fetchedCount,
      accepted_count: acceptedCount,
      new_canonical_jobs: 0,
      updated_count: 0,
      duplicate_count: duplicateCount,
      rejected_count: 0,
      closed_count: 0,
      nigeria_local_count: nigeriaLocalCount,
      explicit_nigeria_africa_eligible_count: explicitEligibleCount,
      unclear_eligibility_count: unclearEligibilityCount,
      error_count: 0,
      alert_catalog_count: catalogCount,
      persisted_descriptions: 0,
      import_recorded: true,
    });
  } catch (reason) {
    const code =
      reason instanceof OperationalError ? reason.code : "source_sync_failed";
    const secondaryFailure = await observeSecondaryOperation(
      "remotive_record_failed_import",
      callRpc(
        "worker_record_source_import_v2",
        rpcUuidResultSchema,
        {
          p_adapter_key: REMOTIVE_ADAPTER_KEY,
          p_started_at: startedAt,
          p_source_checked_at: sourceCheckedAt,
          p_fetched_count: fetchedCount,
          p_accepted_count: acceptedCount,
          p_duplicate_count: duplicateCount,
          p_rejected_count: 0,
          p_nigeria_local_count: nigeriaLocalCount,
          p_explicit_eligible_count: explicitEligibleCount,
          p_unclear_eligibility_count: unclearEligibilityCount,
          p_status: "failed",
          p_error_code: code,
        },
        { signal },
      ),
    );
    throw new OperationalError(code, {
      source: REMOTIVE_ADAPTER_KEY,
      fetched_count: fetchedCount,
      accepted_count: acceptedCount,
      duplicate_count: duplicateCount,
      rejected_count: 0,
      nigeria_local_count: nigeriaLocalCount,
      explicit_nigeria_africa_eligible_count: explicitEligibleCount,
      unclear_eligibility_count: unclearEligibilityCount,
      failure_evidence_state: secondaryFailure ? "unavailable" : "recorded",
      secondary_failure_codes: secondaryFailure ? [secondaryFailure.code] : [],
    });
  }
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("job_source_sync", request, context, runJobSourceSync);

export default handler;

export const config: Config = {
  schedule: "5 1,7,13,19 * * *",
};
