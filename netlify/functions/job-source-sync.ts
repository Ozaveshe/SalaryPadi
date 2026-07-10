import type { Config } from "@netlify/functions";

import { fetchRemotiveJobs } from "./_shared/jobs";
import { OperationalError, rpc, runTrackedWorker } from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("job_source_sync", request, context, async () => {
    try {
      const jobs = await fetchRemotiveJobs();
      const importId = await rpc<string>("worker_record_source_import", {
        p_adapter_key: "remotive",
        p_fetched_count: jobs.length,
        p_status: "succeeded",
        p_error_code: null,
      });
      return {
        source: "remotive",
        fetched_count: jobs.length,
        persisted_descriptions: 0,
        import_recorded: Boolean(importId),
      };
    } catch (reason) {
      const code =
        reason instanceof OperationalError ? reason.code : "source_sync_failed";
      await rpc<string>("worker_record_source_import", {
        p_adapter_key: "remotive",
        p_fetched_count: 0,
        p_status: "failed",
        p_error_code: code,
      }).catch(() => undefined);
      throw new OperationalError(code, {
        source: "remotive",
        fetched_count: 0,
      });
    }
  });

export default handler;

export const config: Config = {
  schedule: "5 */3 * * *",
};
