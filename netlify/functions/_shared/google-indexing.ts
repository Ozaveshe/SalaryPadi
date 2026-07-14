import { z } from "zod";

import {
  getRuntimeAppOrigin,
  getRuntimeBoolean,
  observeSecondaryOperation,
  OperationalError,
  rpc,
  rpcBooleanResultSchema,
  type WorkerExecution,
  workerSkipped,
  workerSucceeded,
} from "./runtime";
import { getGoogleAccessToken } from "./google-auth";

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const INDEXING_ENDPOINT =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";

type ClaimedNotification = {
  outbox_id: string;
  job_id: string | null;
  job_slug: string;
  notification_kind: "URL_UPDATED" | "URL_DELETED";
  attempt: number;
};

const claimedNotificationsResultSchema = z
  .array(
    z
      .object({
        outbox_id: z.string().uuid(),
        job_id: z.string().uuid().nullable(),
        job_slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,199}$/i),
        notification_kind: z.enum(["URL_UPDATED", "URL_DELETED"]),
        attempt: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .max(1);

function providerStatus(reason: unknown) {
  if (!(reason instanceof OperationalError)) return null;
  const value = reason.summary.provider_status;
  return typeof value === "number" ? value : null;
}

async function finishNotification(
  notification: ClaimedNotification,
  success: boolean,
  httpStatus: number | null,
  errorCode: string | null,
  signal: AbortSignal,
) {
  const finished = await rpc(
    "google_indexing_finish_notification",
    rpcBooleanResultSchema,
    {
      p_outbox_id: notification.outbox_id,
      p_success: success,
      p_http_status: httpStatus,
      p_error_code: errorCode,
    },
    { signal },
  );
  if (!finished) {
    throw new OperationalError("google_indexing_finish_rejected");
  }
}

export async function publishGoogleIndexingNotification({
  token,
  url,
  type,
  signal,
}: {
  token: string;
  url: string;
  type: ClaimedNotification["notification_kind"];
  signal: AbortSignal;
}) {
  const response = await fetch(INDEXING_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new OperationalError(`google_indexing_${response.status}`, {
      provider_status: response.status,
    });
  }
  await response.body?.cancel().catch(() => undefined);
  return response.status;
}

export async function runGoogleIndexingNotifications(
  execution: WorkerExecution,
) {
  if (!getRuntimeBoolean("GOOGLE_INDEXING_ENABLED", false)) {
    return workerSkipped("google_indexing_disabled");
  }
  const claimed = await rpc(
    "google_indexing_claim_notifications",
    claimedNotificationsResultSchema,
    { p_limit: 1 },
    { signal: execution.signal },
  );
  if (claimed.length === 0)
    return workerSucceeded({ claimed: 0, sent: 0, failed: 0 });
  let token: string;
  try {
    token = await getGoogleAccessToken(INDEXING_SCOPE, execution.signal);
  } catch (reason) {
    const code =
      reason instanceof OperationalError
        ? reason.code
        : "google_access_token_failed";
    const completionFailure = await observeSecondaryOperation(
      "google_indexing_finish_auth_failure",
      finishNotification(claimed[0]!, false, null, code, execution.signal),
    );
    throw new OperationalError(code, {
      claimed: 1,
      sent: 0,
      failed: 1,
      claim_completion_state: completionFailure ? "unavailable" : "recorded",
      secondary_failure_codes: completionFailure
        ? [completionFailure.code]
        : [],
    });
  }
  const origin = getRuntimeAppOrigin();
  let sent = 0;
  let failed = 0;
  for (const notification of claimed) {
    const url = new URL(`/jobs/${notification.job_slug}`, origin).toString();
    let providerFailure: unknown;
    let providerHttpStatus: number | null = null;
    let providerSucceeded = false;
    try {
      providerHttpStatus = await publishGoogleIndexingNotification({
        token,
        url,
        type: notification.notification_kind,
        signal: execution.signal,
      });
      providerSucceeded = true;
    } catch (reason) {
      providerFailure = reason;
    }
    if (!providerSucceeded) {
      await finishNotification(
        notification,
        false,
        providerStatus(providerFailure),
        providerFailure instanceof OperationalError
          ? providerFailure.code
          : "google_indexing_request_failed",
        execution.signal,
      );
      failed += 1;
      continue;
    }
    await finishNotification(
      notification,
      true,
      providerHttpStatus,
      null,
      execution.signal,
    );
    sent += 1;
  }
  const summary = { claimed: claimed.length, sent, failed };
  if (failed > 0) {
    throw new OperationalError("google_indexing_partial_failure", summary);
  }
  return workerSucceeded(summary);
}
