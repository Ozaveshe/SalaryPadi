import type { Config } from "@netlify/functions";

import { fetchRemotiveJobs, storeAlertJobCatalog } from "./_shared/jobs";
import {
  getRuntimeBoolean,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

export async function runJobSourceSync({ signal }: WorkerExecution) {
  if (!getRuntimeBoolean("REMOTIVE_SOURCE_ENABLED", true)) {
    return workerSkipped("remotive_source_disabled");
  }

  try {
    const jobs = await fetchRemotiveJobs(signal);
    const catalogCount = await storeAlertJobCatalog(jobs, signal);
    const importId = await rpc<string>(
      "worker_record_source_import",
      {
        p_adapter_key: "remotive",
        p_fetched_count: jobs.length,
        p_status: "succeeded",
        p_error_code: null,
      },
      { signal },
    );
    return workerSucceeded({
      source: "remotive",
      fetched_count: jobs.length,
      alert_catalog_count: catalogCount,
      persisted_descriptions: 0,
      import_recorded: Boolean(importId),
    });
  } catch (reason) {
    const code =
      reason instanceof OperationalError ? reason.code : "source_sync_failed";
    await rpc<string>(
      "worker_record_source_import",
      {
        p_adapter_key: "remotive",
        p_fetched_count: 0,
        p_status: "failed",
        p_error_code: code,
      },
      { signal },
    ).catch(() => undefined);
    throw new OperationalError(code, {
      source: "remotive",
      fetched_count: 0,
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
