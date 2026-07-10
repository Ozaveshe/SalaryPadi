import type { Config } from "@netlify/functions";

import { rpc, runTrackedWorker } from "./_shared/runtime";

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("operations_maintenance", request, context, async () =>
    rpc<Record<string, unknown>>("worker_run_maintenance"),
  );

export default handler;

export const config: Config = {
  schedule: "45 2 * * *",
};
