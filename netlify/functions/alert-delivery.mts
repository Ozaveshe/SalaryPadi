import type { Config } from "@netlify/functions";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  prepareAlert,
  readAlertState,
  type PreparedAlert,
} from "./_shared/alert-state";

import {
  alertClaimSchema,
  alertJobKey,
  assertAlertJobsPublishable,
  type AlertClaim,
  fetchAlertJobCatalog,
  matchAlertJobs,
  renderAlertEmail,
  sendAlertEmail,
} from "./_shared/jobs";
import {
  getRuntimeChoice,
  observeSecondaryOperation,
  OperationalError,
  rpc,
  rpcBooleanResultSchema,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

const ALERT_BATCH_SIZE = 3;
const alertClaimsResultSchema = z.array(alertClaimSchema).max(ALERT_BATCH_SIZE);

async function complete(
  claim: AlertClaim,
  outcome: "sent" | "skipped" | "failed",
  count: number,
  providerMessageId: string | null,
  errorCode: string | null,
  signal: AbortSignal,
) {
  const completed = await rpc(
    "worker_complete_alert_with_jobs",
    rpcBooleanResultSchema,
    {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_outcome: outcome,
      p_matched_job_count: count,
      p_provider_message_id: providerMessageId,
      p_error_code: errorCode,
    },
    { signal },
  );
  if (!completed) throw new OperationalError("alert_claim_lost");
}

async function claimAlertDeliveries(signal: AbortSignal) {
  try {
    return await rpc(
      "worker_claim_alert_deliveries",
      alertClaimsResultSchema,
      { p_limit: ALERT_BATCH_SIZE },
      { signal },
    );
  } catch (reason) {
    if (
      reason instanceof OperationalError &&
      reason.code === "supabase_rpc_invalid_shape"
    ) {
      throw new OperationalError("alert_claim_contract_invalid");
    }
    throw reason;
  }
}

export async function runAlertDelivery({
  signal,
  remainingMs,
}: WorkerExecution) {
  const provider = getRuntimeChoice(
    "EMAIL_PROVIDER",
    ["none", "resend"] as const,
    "none",
  );
  if (provider === "none") return workerSkipped("email_provider_disabled");

  const claims: AlertClaim[] = await claimAlertDeliveries(signal);
  if (claims.length === 0) {
    return workerSucceeded({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
  }

  let catalog;
  const secondaryFailureCodes = new Set<string>();
  try {
    catalog = await fetchAlertJobCatalog(signal);
  } catch (reason) {
    const code =
      reason instanceof OperationalError
        ? reason.code
        : "job_catalog_unavailable";
    const completionFailures = await Promise.all(
      claims.map((claim) =>
        observeSecondaryOperation(
          "alert_complete_catalog_failure",
          complete(claim, "failed", 0, null, code, signal),
        ),
      ),
    );
    for (const failure of completionFailures) {
      if (failure) secondaryFailureCodes.add(failure.code);
    }
    throw new OperationalError(code, {
      claimed: claims.length,
      sent: 0,
      skipped: 0,
      failed: claims.length,
      claim_completion_state:
        secondaryFailureCodes.size > 0 ? "unavailable" : "recorded",
      secondary_failure_codes: [...secondaryFailureCodes],
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let providerAttempted = false;
  for (const claim of claims) {
    let matches;
    let prepared: PreparedAlert | null;
    try {
      const state = await readAlertState(claim, signal);
      prepared = state.prepared;
      matches = matchAlertJobs(
        claim,
        catalog.jobs,
        new Date(),
        new Set(state.sent_job_keys),
      );
      if (prepared) {
        const keys = new Set(prepared.job_keys);
        matches = matchAlertJobs(
          claim,
          catalog.jobs,
          new Date(),
          new Set(
            catalog.jobs
              .filter((job) => !keys.has(alertJobKey(job)))
              .map(alertJobKey),
          ),
        );
        if (matches.length !== keys.size)
          throw new OperationalError("prepared_alert_jobs_unavailable");
      }
    } catch (reason) {
      const code =
        reason instanceof OperationalError
          ? reason.code
          : "alert_claim_invalid";
      const completionFailure = await observeSecondaryOperation(
        "alert_complete_invalid_claim",
        complete(claim, "failed", 0, null, code, signal),
      );
      if (completionFailure) {
        secondaryFailureCodes.add(completionFailure.code);
      }
      failed += 1;
      continue;
    }
    if (matches.length === 0) {
      await complete(claim, "skipped", 0, null, null, signal);
      skipped += 1;
      continue;
    }
    let providerId: string;
    try {
      // Leave time to record a retry instead of beginning a send near shutdown.
      if (remainingMs() < 8_000)
        throw new OperationalError("alert_delivery_budget_deferred");
      // Space successive attempts to avoid bursts on the shared provider quota.
      if (providerAttempted) await delay(600, undefined, { signal });
      await assertAlertJobsPublishable(matches, signal);
      prepared = await prepareAlert(
        claim,
        prepared ?? {
          job_keys: matches.map(alertJobKey),
          email: renderAlertEmail(matches, claim.search_spec.applicantCountry),
        },
        signal,
      );
      providerAttempted = true;
      providerId = await sendAlertEmail(
        claim.delivery_id,
        claim.recipient_email,
        prepared.email,
        signal,
      );
    } catch (reason) {
      const code =
        reason instanceof OperationalError
          ? reason.code
          : "email_provider_error";
      const completionFailure = await observeSecondaryOperation(
        "alert_complete_delivery_failure",
        complete(claim, "failed", matches.length, null, code, signal),
      );
      if (completionFailure) {
        secondaryFailureCodes.add(completionFailure.code);
      }
      failed += 1;
      continue;
    }
    await complete(claim, "sent", matches.length, providerId, null, signal);
    sent += 1;
  }

  const summary = {
    claimed: claims.length,
    sent,
    skipped,
    failed,
    catalog_state: catalog.state,
    catalog_issue_codes: catalog.issues.map((issue) => issue.code),
    quarantined_job_count: catalog.issues.reduce(
      (count, issue) => count + (issue.count ?? 0),
      0,
    ),
    claim_completion_state:
      secondaryFailureCodes.size > 0 ? "unavailable" : "recorded",
    secondary_failure_codes: [...secondaryFailureCodes],
  };
  if (failed > 0)
    throw new OperationalError("alert_delivery_partial_failure", summary);
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) => runTrackedWorker("alert_delivery", request, context, runAlertDelivery);

export default handler;

export const config: Config = {
  schedule: "*/15 * * * *",
};
