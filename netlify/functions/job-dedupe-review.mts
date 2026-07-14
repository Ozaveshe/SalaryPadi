import type { Config } from "@netlify/functions";

import { rpc, runTrackedWorker, workerSucceeded } from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("job_dedupe_review", request, context, async ({ signal }) =>
    workerSucceeded(
      await rpc<Record<string, unknown>>(
        "worker_queue_fuzzy_job_duplicates",
        { p_limit: 500 },
        { signal },
      ),
    ),
  );

export default handler;
export const config: Config = { schedule: "13 3 * * *" };
