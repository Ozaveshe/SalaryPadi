import type { Config } from "@netlify/functions";

import { rpc, runTrackedWorker, workerSucceeded } from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker(
    "source_rights_review",
    request,
    context,
    async ({ signal }) =>
      workerSucceeded(
        await rpc<Record<string, unknown>>(
          "worker_run_source_rights_review",
          {},
          { signal },
        ),
      ),
  );

export default handler;
export const config: Config = { schedule: "19 6 1 * *" };
