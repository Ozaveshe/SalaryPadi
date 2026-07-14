import type { Config } from "@netlify/functions";

import { runGoogleIndexingNotifications } from "./_shared/google-indexing";
import { runTrackedWorker } from "./_shared/runtime";

const handler = (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker(
    "google_indexing_notifications",
    request,
    context,
    runGoogleIndexingNotifications,
  );

export default handler;
export const config: Config = { schedule: "*/15 * * * *" };
