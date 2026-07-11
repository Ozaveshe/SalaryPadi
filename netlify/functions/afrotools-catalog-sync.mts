import type { Config } from "@netlify/functions";

import { fetchAfroToolsCatalog } from "../../src/lib/afrotools/catalog";
import {
  getStoredAfroToolsCatalog,
  storeAfroToolsCatalog,
} from "../../src/lib/afrotools/catalog-repository-runtime";
import { getAfroToolsApiBase } from "../../src/lib/integrations/urls";
import {
  getRuntimeEnvironment,
  getRuntimeSecret,
  runTrackedWorker,
  type WorkerExecution,
  workerSucceeded,
} from "./_shared/runtime";

export async function runAfroToolsCatalogSync({ signal }: WorkerExecution) {
  const baseUrl = getAfroToolsApiBase(
    getRuntimeEnvironment("AFROTOOLS_API_BASE_URL"),
  );
  const apiKey = getRuntimeSecret("AFROTOOLS_API_KEY");
  const previous = await getStoredAfroToolsCatalog();
  const result = await fetchAfroToolsCatalog(
    baseUrl,
    apiKey,
    fetch,
    signal,
    previous,
  );
  const count = await storeAfroToolsCatalog(result.snapshot);
  return workerSucceeded({
    source: result.snapshot.sourceUrl,
    schema_version: result.snapshot.schemaVersion,
    catalog_last_updated: result.snapshot.catalogLastUpdated,
    tool_count: count,
    source_http_status: result.httpStatus,
    etag_revalidated: result.notModified,
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
