import type { Config } from "@netlify/functions";

import {
  type AlertClaim,
  fetchAlertJobCatalog,
  matchAlertJobs,
  renderAlertEmail,
  sendAlertEmail,
} from "./_shared/jobs";
import {
  getRuntimeChoice,
  OperationalError,
  rpc,
  runTrackedWorker,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./_shared/runtime";

async function complete(
  claim: AlertClaim,
  outcome: "sent" | "skipped" | "failed",
  count: number,
  providerMessageId: string | null,
  errorCode: string | null,
  signal: AbortSignal,
) {
  const completed = await rpc<boolean>(
    "worker_complete_alert_delivery",
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

export async function runAlertDelivery({ signal }: WorkerExecution) {
  const provider = getRuntimeChoice(
    "EMAIL_PROVIDER",
    ["none", "resend"] as const,
    "none",
  );
  if (provider === "none") return workerSkipped("email_provider_disabled");

  const claims = await rpc<AlertClaim[]>(
    "worker_claim_alert_deliveries",
    { p_limit: 1 },
    { signal },
  );
  if (claims.length === 0) {
    return workerSucceeded({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
  }

  let jobs;
  try {
    jobs = await fetchAlertJobCatalog(signal);
  } catch (reason) {
    const code =
      reason instanceof OperationalError
        ? reason.code
        : "job_catalog_unavailable";
    await Promise.all(
      claims.map((claim) =>
        complete(claim, "failed", 0, null, code, signal).catch(() => undefined),
      ),
    );
    throw new OperationalError(code, {
      claimed: claims.length,
      sent: 0,
      skipped: 0,
      failed: claims.length,
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const claim of claims) {
    const matches = matchAlertJobs(claim, jobs);
    if (matches.length === 0) {
      await complete(claim, "skipped", 0, null, null, signal);
      skipped += 1;
      continue;
    }
    try {
      const providerId = await sendAlertEmail(
        claim.delivery_id,
        claim.recipient_email,
        renderAlertEmail(matches),
        signal,
      );
      await complete(claim, "sent", matches.length, providerId, null, signal);
      sent += 1;
    } catch (reason) {
      const code =
        reason instanceof OperationalError
          ? reason.code
          : "email_provider_error";
      await complete(claim, "failed", matches.length, null, code, signal).catch(
        () => undefined,
      );
      failed += 1;
    }
  }

  const summary = { claimed: claims.length, sent, skipped, failed };
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
  schedule: "*/10 * * * *",
};
