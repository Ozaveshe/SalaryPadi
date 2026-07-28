import type { Config } from "@netlify/functions";
import { z } from "zod";

import {
  notificationClaimSchema,
  renderNotificationEmail,
  sendNotificationEmail,
  type NotificationClaim,
} from "./_shared/notification-delivery";
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

/** One batch per run, matched to the hourly schedule below. */
const CLAIM_LIMIT = 20;

const notificationClaimsResultSchema = z
  .array(notificationClaimSchema)
  .max(CLAIM_LIMIT);

async function complete(
  claim: NotificationClaim,
  outcome: "sent" | "skipped" | "failed",
  errorCode: string | null,
  signal: AbortSignal,
) {
  const completed = await rpc(
    "worker_complete_notification_email",
    rpcBooleanResultSchema,
    {
      p_notification_id: claim.notification_id,
      p_claim_token: claim.claim_token,
      p_outcome: outcome,
      p_error_code: errorCode,
    },
    { signal },
  );
  // A lost claim means another run already completed this row. Sending again
  // on the strength of a stale claim would double-deliver.
  if (!completed) throw new OperationalError("notification_claim_lost");
}

async function claimNotificationEmails(
  signal: AbortSignal,
): Promise<NotificationClaim[]> {
  try {
    return await rpc(
      "worker_claim_notification_emails",
      notificationClaimsResultSchema,
      { p_limit: CLAIM_LIMIT },
      { signal },
    );
  } catch (reason) {
    if (reason instanceof OperationalError) throw reason;
    throw new OperationalError("notification_claim_contract_invalid");
  }
}

export async function runNotificationDelivery({ signal }: WorkerExecution) {
  const provider = getRuntimeChoice(
    "EMAIL_PROVIDER",
    ["none", "resend"] as const,
    "none",
  );
  if (provider === "none") return workerSkipped("email_provider_disabled");

  const claims = await claimNotificationEmails(signal);
  if (claims.length === 0) {
    return workerSucceeded({ claimed: 0, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;
  const secondaryFailureCodes = new Set<string>();

  for (const claim of claims) {
    let providerId: string;
    try {
      providerId = await sendNotificationEmail(
        claim,
        renderNotificationEmail(claim),
        signal,
      );
    } catch (reason) {
      const code =
        reason instanceof OperationalError
          ? reason.code
          : "notification_email_send_failed";
      const completionFailure = await observeSecondaryOperation(
        "notification_complete_send_failure",
        complete(claim, "failed", code, signal),
      );
      if (completionFailure) secondaryFailureCodes.add(completionFailure.code);
      failed += 1;
      continue;
    }

    // The provider accepted it, so the row is completed as sent even if the
    // completion itself then fails — the alternative is re-sending an email
    // that has already left.
    const completionFailure = await observeSecondaryOperation(
      "notification_complete_sent",
      complete(claim, "sent", null, signal),
    );
    if (completionFailure) secondaryFailureCodes.add(completionFailure.code);
    if (providerId) sent += 1;
  }

  const summary = {
    claimed: claims.length,
    sent,
    failed,
    claim_completion_state:
      secondaryFailureCodes.size > 0 ? "unavailable" : "recorded",
    secondary_failure_codes: [...secondaryFailureCodes],
  };
  if (failed > 0) {
    throw new OperationalError(
      "notification_delivery_partial_failure",
      summary,
    );
  }
  return workerSucceeded(summary);
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker(
    "notification_email_delivery",
    request,
    context,
    runNotificationDelivery,
  );

export default handler;

export const config: Config = {
  schedule: "0 * * * *",
};
