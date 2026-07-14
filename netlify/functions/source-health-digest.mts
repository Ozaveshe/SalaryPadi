import type { Config } from "@netlify/functions";

import { rpc, runTrackedWorker, workerSucceeded } from "./_shared/runtime";

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
        await rpc<Record<string, unknown>>(
          "worker_build_source_health_digest",
          {},
          { signal },
        ),
      ),
  );

export default handler;
export const config: Config = { schedule: "7 5 * * *" };
