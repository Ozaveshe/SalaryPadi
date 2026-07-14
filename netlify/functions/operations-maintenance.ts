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
    "operations_maintenance",
    request,
    context,
    async ({ signal }) =>
      workerSucceeded(
        await rpc(
          "worker_run_maintenance",
          rpcSummaryResultSchema,
          {},
          { signal },
        ),
      ),
  );

export default handler;

export const config: Config = {
  schedule: "45 2 * * *",
};
