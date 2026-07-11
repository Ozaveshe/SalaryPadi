import type { Config } from "@netlify/functions";
import { runEditorialOperation } from "./_shared/editorial";
import { runTrackedWorker } from "./_shared/runtime";
const handler = (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("editorial_live_blocks", request, context, (execution) =>
    runEditorialOperation("editorial_live_blocks", execution),
  );
export default handler;
export const config: Config = { schedule: "10 */6 * * *" };
