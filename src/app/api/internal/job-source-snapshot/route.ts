import { unstable_rethrow } from "next/navigation";

import { getServerEnvironment } from "@/lib/env";
import { createAlertCatalog } from "@/lib/jobs/alert-catalog";
import { getRemotiveJobFeed } from "@/lib/jobs/repository";
import { isValidInternalBearer } from "@/lib/security/internal-bearer";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The scheduled worker calls this protected route to read or refresh the same
 * bounded Next data-cache entry that public job pages consume. A failed
 * provider refresh must not evict the last-known-good snapshot. Its output is
 * a description-free snapshot suitable for the alert Blob.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = getServerEnvironment().JOB_SOURCE_SYNC_TOKEN;
  if (!isValidInternalBearer(request, expected)) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }

  try {
    const source = await getRemotiveJobFeed();
    if (source.state !== "live" || source.jobs.length === 0) {
      return noStoreJson(
        {
          error: source.code ?? "job_source_unavailable",
          source_state: source.state,
        },
        503,
      );
    }

    return noStoreJson(createAlertCatalog(source.jobs, source.checkedAt));
  } catch (error) {
    unstable_rethrow(error);
    return noStoreJson({ error: "job_source_snapshot_failed" }, 503);
  }
}
