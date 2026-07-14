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
    "source_health_digest",
    request,
    context,
    async ({ signal }) =>
      workerSucceeded(
        await rpc(
          "worker_build_source_health_digest",
          rpcSummaryResultSchema,
          {},
          { signal },
        ),
      ),
  );

export default handler;
export const config: Config = { schedule: "7 5 * * *" };
