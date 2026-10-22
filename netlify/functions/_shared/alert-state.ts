import { z } from "zod";
import { rpc } from "./runtime";
import type { AlertClaim } from "./job-alert-delivery";

export const preparedAlertSchema = z
  .object({
    job_keys: z.array(z.string().min(1).max(500)).min(1).max(10),
    email: z
      .object({
        subject: z.string().min(1).max(500),
        text: z.string().min(1).max(100_000),
        html: z.string().min(1).max(100_000),
      })
      .strict(),
  })
  .strict();
export type PreparedAlert = z.infer<typeof preparedAlertSchema>;

export async function readAlertState(claim: AlertClaim, signal: AbortSignal) {
  return rpc(
    "worker_read_alert_state",
    z
      .object({
        sent_job_keys: z.array(z.string().max(500)),
        prepared: preparedAlertSchema.nullable(),
      })
      .strict(),
    {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
    },
    { signal },
  );
}

export async function prepareAlert(
  claim: AlertClaim,
  message: PreparedAlert,
  signal: AbortSignal,
) {
  return rpc(
    "worker_prepare_alert",
    preparedAlertSchema,
    {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_message: message,
    },
    { signal },
  );
}
