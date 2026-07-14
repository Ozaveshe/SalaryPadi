import type { Config } from "@netlify/functions";
import { z } from "zod";

import { checkApplyLink } from "./_shared/apply-link-check";
import {
  OperationalError,
  rpc,
  rpcBooleanResultSchema,
  runTrackedWorker,
  workerSucceeded,
  type WorkerExecution,
} from "./_shared/runtime";

const claimSchema = z
  .array(
    z
      .object({
        job_id: z.string().uuid(),
        application_url: z.string().url().max(2_048),
      })
      .strict(),
  )
  .max(10);

const APPLY_LINK_RECORD_RESERVE_MS = 2_000;
const APPLY_LINK_MINIMUM_CHECK_MS = 1_000;

export async function runApplyLinkChecks(execution: WorkerExecution) {
  const claims = await rpc(
    "worker_claim_apply_link_checks",
    claimSchema,
    { p_limit: 10 },
    { signal: execution.signal },
  );
  let healthy = 0;
  let broken = 0;
  let indeterminate = 0;
  let processed = 0;
  for (const claim of claims) {
    const remainingMs = execution.remainingMs();
    if (
      remainingMs <
      APPLY_LINK_RECORD_RESERVE_MS + APPLY_LINK_MINIMUM_CHECK_MS
    ) {
      break;
    }
    const checkSignal = AbortSignal.any([
      execution.signal,
      AbortSignal.timeout(
        Math.floor(remainingMs - APPLY_LINK_RECORD_RESERVE_MS),
      ),
    ]);
    const result = await checkApplyLink(claim.application_url, checkSignal);
    const checkedAt = new Date().toISOString();
    const recorded = await rpc(
      "worker_record_apply_link_check",
      rpcBooleanResultSchema,
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
    if (!recorded) throw new OperationalError("apply_link_record_rejected");
    processed += 1;
    if (result.result === "healthy") healthy += 1;
    else if (result.result === "broken") broken += 1;
    else indeterminate += 1;
  }
  const summary = {
    claimed: claims.length,
    processed,
    deferred: claims.length - processed,
    healthy,
    broken,
    indeterminate,
  };
  if (summary.deferred > 0) {
    throw new OperationalError(
      "apply_link_check_time_budget_exhausted",
      summary,
    );
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("apply_link_check", request, context, runApplyLinkChecks);

export default handler;

export const config: Config = { schedule: "8,23,38,53 * * * *" };
