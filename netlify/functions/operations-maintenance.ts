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
    async ({ signal }) => {
      const maintenance = await rpc(
        "worker_run_maintenance",
        rpcSummaryResultSchema,
        {},
        { signal },
      );
      const retention = await rpc(
        "worker_run_workspace_retention",
        rpcSummaryResultSchema,
        {},
        { signal },
      );
      return workerSucceeded({ ...maintenance, ...retention });
    },
  );

export default handler;

export const config: Config = {
  schedule: "45 2 * * *",
};
