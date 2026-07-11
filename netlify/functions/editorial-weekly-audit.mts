import type { Config } from "@netlify/functions";
import { runEditorialOperation } from "./_shared/editorial";
import { runTrackedWorker } from "./_shared/runtime";
const handler = (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("editorial_weekly_audit", request, context, (execution) =>
    runEditorialOperation("editorial_weekly_audit", execution),
  );
export default handler;
export const config: Config = { schedule: "45 22 * * 0" };
