import type { Config } from "@netlify/functions";

import {
  type AlertClaim,
  fetchAlertJobCatalog,
  matchAlertJobs,
  renderAlertEmail,
  sendAlertEmail,
} from "./_shared/jobs";
import { OperationalError, rpc, runTrackedWorker } from "./_shared/runtime";

async function complete(
  claim: AlertClaim,
  outcome: "sent" | "skipped" | "failed",
  count: number,
  providerMessageId: string | null,
  errorCode: string | null,
) {
  const completed = await rpc<boolean>("worker_complete_alert_delivery", {
    p_delivery_id: claim.delivery_id,
    p_claim_token: claim.claim_token,
    p_outcome: outcome,
    p_matched_job_count: count,
    p_provider_message_id: providerMessageId,
    p_error_code: errorCode,
  });
  if (!completed) throw new OperationalError("alert_claim_lost");
}

const handler = async (
  request: Request,
  context: Parameters<typeof runTrackedWorker>[2],
) =>
  runTrackedWorker("alert_delivery", request, context, async () => {
    const claims = await rpc<AlertClaim[]>("worker_claim_alert_deliveries", {
      p_limit: 10,
    });
    if (claims.length === 0) {
      return { claimed: 0, sent: 0, skipped: 0, failed: 0 };
    }

    let jobs;
    try {
      jobs = await fetchAlertJobCatalog();
    } catch {
      await Promise.all(
        claims.map((claim) =>
          complete(claim, "failed", 0, null, "job_catalog_unavailable").catch(
            () => undefined,
          ),
        ),
      );
      throw new OperationalError("job_catalog_unavailable", {
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
        await complete(claim, "skipped", 0, null, null);
        skipped += 1;
        continue;
      }
      try {
        const providerId = await sendAlertEmail(
          claim.delivery_id,
          claim.recipient_email,
          renderAlertEmail(matches),
        );
        await complete(claim, "sent", matches.length, providerId, null);
        sent += 1;
      } catch (reason) {
        const code =
          reason instanceof OperationalError
            ? reason.code
            : "email_provider_error";
        await complete(claim, "failed", matches.length, null, code).catch(
          () => undefined,
        );
        failed += 1;
      }
    }

    const summary = { claimed: claims.length, sent, skipped, failed };
    if (failed > 0)
      throw new OperationalError("alert_delivery_partial_failure", summary);
    return summary;
  });

export default handler;

export const config: Config = {
  schedule: "15 * * * *",
};
