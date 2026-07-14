import type { Config } from "@netlify/functions";

import {
  rpc,
  rpcSummaryResultSchema,
  runTrackedWorker,
  workerSucceeded,
} from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("job_lifecycle", request, context, async ({ signal }) =>
    workerSucceeded(
      await rpc(
        "worker_run_job_lifecycle",
        rpcSummaryResultSchema,
        {},
        { signal },
      ),
    ),
  );

export default handler;
export const config: Config = { schedule: "*/15 * * * *" };
