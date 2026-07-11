import type { Config } from "@netlify/functions";

import { fetchAfroToolsCatalog } from "../../src/lib/afrotools/catalog";
import { storeAfroToolsCatalog } from "../../src/lib/afrotools/catalog-repository-runtime";
import { getAfroToolsApiBase } from "../../src/lib/integrations/urls";
import {
  getRuntimeEnvironment,
  runTrackedWorker,
  type WorkerExecution,
  workerSucceeded,
} from "./_shared/runtime";

export async function runAfroToolsCatalogSync({ signal }: WorkerExecution) {
  const baseUrl = getAfroToolsApiBase(
    getRuntimeEnvironment("AFROTOOLS_API_BASE_URL"),
  );
  const snapshot = await fetchAfroToolsCatalog(baseUrl, fetch, signal);
  const count = await storeAfroToolsCatalog(snapshot);
  return workerSucceeded({
    source: snapshot.sourceUrl,
    catalog_last_updated: snapshot.catalogLastUpdated,
    tool_count: count,
  });
}

const handler = (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker(
    "afrotools_catalog_sync",
    request,
    context,
    runAfroToolsCatalogSync,
  );

export default handler;
export const config: Config = { schedule: "5 */6 * * *" };
