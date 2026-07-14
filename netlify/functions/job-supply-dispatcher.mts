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
  runTrackedWorker(
    "job_supply_dispatcher",
    request,
    context,
    async ({ signal }) =>
      workerSucceeded(
        await rpc(
          "worker_dispatch_job_supply",
          rpcSummaryResultSchema,
          {},
          { signal },
        ),
      ),
  );

export default handler;
export const config: Config = { schedule: "*/15 * * * *" };
