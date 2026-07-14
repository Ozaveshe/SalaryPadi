import type { Config } from "@netlify/functions";
import { z } from "zod";

import { checkApplyLink } from "./_shared/apply-link-check";
import {
  rpc,
  runTrackedWorker,
  workerSucceeded,
  type WorkerExecution,
} from "./_shared/runtime";

const claimSchema = z.array(
  z.object({
    job_id: z.string().uuid(),
    application_url: z.string().url(),
  }),
);

export async function runApplyLinkChecks(execution: WorkerExecution) {
  const claims = claimSchema.parse(
    await rpc(
      "worker_claim_apply_link_checks",
      { p_limit: 10 },
      { signal: execution.signal },
    ),
  );
  let healthy = 0;
  let broken = 0;
  let indeterminate = 0;
  for (const claim of claims) {
    if (execution.remainingMs() < 3_000) break;
    const checkedAt = new Date().toISOString();
    const result = await checkApplyLink(
      claim.application_url,
      execution.signal,
    );
    await rpc(
      "worker_record_apply_link_check",
      {
        p_job_id: claim.job_id,
        p_checked_at: checkedAt,
        p_result: result.result,
        p_http_status: result.httpStatus,
        p_error_code: result.errorCode,
        p_response_ms: result.responseMs,
      },
      { signal: execution.signal },
    );
    if (result.result === "healthy") healthy += 1;
    else if (result.result === "broken") broken += 1;
    else indeterminate += 1;
  }
  return workerSucceeded({
    claimed: claims.length,
    healthy,
    broken,
    indeterminate,
  });
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("apply_link_check", request, context, runApplyLinkChecks);

export default handler;

export const config: Config = { schedule: "8,23,38,53 * * * *" };
