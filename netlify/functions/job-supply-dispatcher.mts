import type { Config } from "@netlify/functions";

import { rpc, runTrackedWorker, workerSucceeded } from "./_shared/runtime";

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
        await rpc<Record<string, unknown>>(
          "worker_dispatch_job_supply",
          {},
          { signal },
        ),
      ),
  );

export default handler;
export const config: Config = { schedule: "*/15 * * * *" };
