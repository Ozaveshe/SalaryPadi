import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "../../src/lib/jobs/source-policy";

import {
  fetchPublishedRemotiveSnapshot,
  storeAlertJobCatalog,
} from "./_shared/jobs";
import {
  getRuntimeBoolean,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

const sourcePolicySchema = z
  .array(
    z.object({
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
      required_destination_kind: z.literal(REMOTIVE_REQUIRED_DESTINATION_KIND),
      refresh_interval_seconds: z.literal(43_200),
    }),
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
};

export async function runJobSourceSync(
  { signal }: WorkerExecution,
  dependencies: JobSourceSyncDependencies = {},
) {
  if (!getRuntimeBoolean("REMOTIVE_SOURCE_ENABLED", false)) {
    return workerSkipped("remotive_source_disabled");
  }

  const callRpc = dependencies.rpc ?? rpc;
  const fetchSnapshot =
    dependencies.fetchSnapshot ?? fetchPublishedRemotiveSnapshot;
  const storeCatalog = dependencies.storeCatalog ?? storeAlertJobCatalog;
  let fetchedCount = 0;
  try {
    const rawPolicy = await callRpc(
      "worker_get_job_source_policy",
      { p_adapter_key: REMOTIVE_ADAPTER_KEY },
      { signal },
    );
    const parsedPolicy = sourcePolicySchema.safeParse(rawPolicy);
    if (!parsedPolicy.success || parsedPolicy.data.length !== 1) {
      throw new OperationalError("remotive_source_policy_invalid");
    }
    const policy = parsedPolicy.data[0]!;
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

    const snapshot = await fetchSnapshot(signal);
    fetchedCount = snapshot.jobs.length;
    if (fetchedCount === 0) {
      throw new OperationalError("remotive_source_empty");
    }
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
    const importId = await callRpc(
      "worker_record_source_import",
      {
        p_adapter_key: REMOTIVE_ADAPTER_KEY,
        p_fetched_count: fetchedCount,
        p_status: "succeeded",
        p_error_code: null,
      },
      { signal },
    );
    if (!z.string().uuid().safeParse(importId).success) {
      throw new OperationalError("source_import_evidence_invalid");
    }
    return workerSucceeded({
      source: REMOTIVE_ADAPTER_KEY,
      fetched_count: fetchedCount,
      alert_catalog_count: catalogCount,
      persisted_descriptions: 0,
      import_recorded: true,
    });
  } catch (reason) {
    const code =
      reason instanceof OperationalError ? reason.code : "source_sync_failed";
    await callRpc(
      "worker_record_source_import",
      {
        p_adapter_key: REMOTIVE_ADAPTER_KEY,
        p_fetched_count: fetchedCount,
        p_status: "failed",
        p_error_code: code,
      },
      { signal },
    ).catch(() => undefined);
    throw new OperationalError(code, {
      source: REMOTIVE_ADAPTER_KEY,
      fetched_count: fetchedCount,
    });
  }
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("job_source_sync", request, context, runJobSourceSync);

export default handler;

export const config: Config = {
  schedule: "5 1,13 * * *",
};
