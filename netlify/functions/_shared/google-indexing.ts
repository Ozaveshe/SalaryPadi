import {
  getRuntimeAppOrigin,
  getRuntimeBoolean,
  OperationalError,
  rpc,
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

function providerStatus(reason: unknown) {
  if (!(reason instanceof OperationalError)) return null;
  const value = reason.summary.provider_status;
  return typeof value === "number" ? value : null;
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
    throw new OperationalError(`google_indexing_${response.status}`, {
      provider_status: response.status,
    });
  }
}

export async function runGoogleIndexingNotifications(
  execution: WorkerExecution,
) {
  if (!getRuntimeBoolean("GOOGLE_INDEXING_ENABLED", false)) {
    return workerSkipped("google_indexing_disabled");
  }
  const claimed = await rpc<ClaimedNotification[]>(
    "google_indexing_claim_notifications",
    { p_limit: 20 },
    { signal: execution.signal },
  );
  if (claimed.length === 0)
    return workerSucceeded({ claimed: 0, sent: 0, failed: 0 });
  const token = await getGoogleAccessToken(INDEXING_SCOPE, execution.signal);
  const origin = getRuntimeAppOrigin();
  let sent = 0;
  let failed = 0;
  for (const notification of claimed) {
    const url = new URL(`/jobs/${notification.job_slug}`, origin).toString();
    try {
      await publishGoogleIndexingNotification({
        token,
        url,
        type: notification.notification_kind,
        signal: execution.signal,
      });
      await rpc(
        "google_indexing_finish_notification",
        {
          p_outbox_id: notification.outbox_id,
          p_success: true,
          p_http_status: 200,
          p_error_code: null,
        },
        { signal: execution.signal },
      );
      sent += 1;
    } catch (reason) {
      await rpc(
        "google_indexing_finish_notification",
        {
          p_outbox_id: notification.outbox_id,
          p_success: false,
          p_http_status: providerStatus(reason),
          p_error_code:
            reason instanceof OperationalError
              ? reason.code
              : "google_indexing_request_failed",
        },
        { signal: execution.signal },
      );
      failed += 1;
    }
  }
  return workerSucceeded({ claimed: claimed.length, sent, failed });
}
