import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./google-auth", () => ({ getGoogleAccessToken: vi.fn() }));

import googleIndexingNotifications from "../google-indexing-notifications.mjs";
import {
  nonBookkeepingUrls,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
} from "./test-support/scheduled-worker";
import { installWorkerFetch } from "./test-support/scheduled-worker";
import {
  publishGoogleIndexingNotification,
  runGoogleIndexingNotifications,
} from "./google-indexing";
import { getGoogleAccessToken } from "./google-auth";
import { OperationalError } from "./runtime";

const claimedNotifications = [
  {
    outbox_id: "10000000-0000-4000-8000-000000000010",
    job_id: "10000000-0000-4000-8000-000000000011",
    job_slug: "platform-engineer",
    notification_kind: "URL_UPDATED",
    attempt: 1,
  },
  {
    outbox_id: "10000000-0000-4000-8000-000000000012",
    job_id: null,
    job_slug: "retired-role",
    notification_kind: "URL_DELETED",
    attempt: 2,
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Google Indexing API boundary", () => {
  it("makes no claim or provider request while disabled", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "false" });
    const fetchMock = installWorkerFetch();
    const response = await googleIndexingNotifications(
      scheduledRequest("google_indexing_notifications"),
      workerContext,
    );
    expect(response.status).toBe(200);
    expect(nonBookkeepingUrls(fetchMock)).toEqual([]);
  });

  it.each(["URL_UPDATED", "URL_DELETED"] as const)(
    "sends only the documented one-URL %s job notification shape",
    async (type) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({}));
      vi.stubGlobal("fetch", fetchMock);
      await publishGoogleIndexingNotification({
        token: "opaque-token",
        url: "https://salarypadi.com/jobs/platform-engineer",
        type,
        signal: new AbortController().signal,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://indexing.googleapis.com/v3/urlNotifications:publish",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            url: "https://salarypadi.com/jobs/platform-engineer",
            type,
          }),
        }),
      );
    },
  );

  it("preserves the provider status on a rejected notification", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: "rate limited" },
            { status: 429, statusText: "Too Many Requests" },
          ),
        ),
    );

    await expect(
      publishGoogleIndexingNotification({
        token: "opaque-token",
        url: "https://salarypadi.com/jobs/platform-engineer",
        type: "URL_UPDATED",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "google_indexing_429",
      summary: { provider_status: 429 },
    } satisfies Partial<OperationalError>);
  });

  it("does not acquire a token when there is no claimed work", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    const fetchMock = installWorkerFetch({
      rpc: { google_indexing_claim_notifications: [] },
    });

    const response = await googleIndexingNotifications(
      scheduledRequest("google_indexing_notifications"),
      workerContext,
    );

    expect(response.status).toBe(200);
    expect(getGoogleAccessToken).not.toHaveBeenCalled();
    expect(
      rpcCallBodies(fetchMock, "google_indexing_claim_notifications"),
    ).toEqual([{ p_limit: 1 }]);
  });

  it("records one successful notification per bounded run", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    vi.mocked(getGoogleAccessToken).mockResolvedValue("opaque-token");
    const fetchMock = installWorkerFetch({
      rpc: {
        google_indexing_claim_notifications: [claimedNotifications[0]],
        google_indexing_finish_notification: true,
      },
      fallback: async (url, init) => {
        expect(url.toString()).toBe(
          "https://indexing.googleapis.com/v3/urlNotifications:publish",
        );
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer opaque-token",
        );
        return Response.json({});
      },
    });

    const response = await googleIndexingNotifications(
      scheduledRequest("google_indexing_notifications"),
      workerContext,
    );
    expect(response.status).toBe(200);
    expect(getGoogleAccessToken).toHaveBeenCalledWith(
      "https://www.googleapis.com/auth/indexing",
      expect.any(AbortSignal),
    );
    expect(
      rpcCallBodies(fetchMock, "google_indexing_finish_notification"),
    ).toEqual([
      {
        p_outbox_id: claimedNotifications[0].outbox_id,
        p_success: true,
        p_http_status: 200,
        p_error_code: null,
      },
    ]);
  });

  it("uses a stable generic code when the provider transport throws", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    vi.mocked(getGoogleAccessToken).mockResolvedValue("opaque-token");
    const fetchMock = installWorkerFetch({
      rpc: {
        google_indexing_claim_notifications: [claimedNotifications[0]],
        google_indexing_finish_notification: true,
      },
      fallback: async () => {
        throw new TypeError("socket unavailable");
      },
    });

    await expect(
      googleIndexingNotifications(
        scheduledRequest("google_indexing_notifications"),
        workerContext,
      ),
    ).rejects.toMatchObject({
      code: "google_indexing_partial_failure",
      summary: { claimed: 1, sent: 0, failed: 1 },
    });
    expect(
      rpcCallBodies(fetchMock, "google_indexing_finish_notification"),
    ).toEqual([
      {
        p_outbox_id: claimedNotifications[0].outbox_id,
        p_success: false,
        p_http_status: null,
        p_error_code: "google_indexing_request_failed",
      },
    ]);
  });

  it("records a rejected provider status on the claimed notification", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    vi.mocked(getGoogleAccessToken).mockResolvedValue("opaque-token");
    const fetchMock = installWorkerFetch({
      rpc: {
        google_indexing_claim_notifications: [claimedNotifications[0]],
        google_indexing_finish_notification: true,
      },
      fallback: async () =>
        Response.json({ error: "rate limited" }, { status: 429 }),
    });

    await expect(
      googleIndexingNotifications(
        scheduledRequest("google_indexing_notifications"),
        workerContext,
      ),
    ).rejects.toMatchObject({
      code: "google_indexing_partial_failure",
      summary: { claimed: 1, sent: 0, failed: 1 },
    });
    expect(
      rpcCallBodies(fetchMock, "google_indexing_finish_notification"),
    ).toEqual([
      {
        p_outbox_id: claimedNotifications[0].outbox_id,
        p_success: false,
        p_http_status: 429,
        p_error_code: "google_indexing_429",
      },
    ]);
  });

  it("returns a claimed notification to retry when token acquisition fails", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    vi.mocked(getGoogleAccessToken).mockRejectedValue(
      new OperationalError("google_token_request_failed"),
    );
    const fetchMock = installWorkerFetch({
      rpc: {
        google_indexing_claim_notifications: [claimedNotifications[0]],
        google_indexing_finish_notification: true,
      },
    });

    await expect(
      googleIndexingNotifications(
        scheduledRequest("google_indexing_notifications"),
        workerContext,
      ),
    ).rejects.toMatchObject({
      code: "google_token_request_failed",
      summary: {
        claimed: 1,
        sent: 0,
        failed: 1,
        claim_completion_state: "recorded",
        secondary_failure_codes: [],
      },
    });
    expect(
      rpcCallBodies(fetchMock, "google_indexing_finish_notification"),
    ).toEqual([
      {
        p_outbox_id: claimedNotifications[0].outbox_id,
        p_success: false,
        p_http_status: null,
        p_error_code: "google_token_request_failed",
      },
    ]);
  });

  it("fails closed when the database refuses the completion record", async () => {
    stubWorkerEnvironment({ GOOGLE_INDEXING_ENABLED: "true" });
    vi.mocked(getGoogleAccessToken).mockResolvedValue("opaque-token");
    const fetchMock = installWorkerFetch({
      rpc: {
        google_indexing_claim_notifications: [claimedNotifications[0]],
        google_indexing_finish_notification: false,
      },
      fallback: async () => Response.json({}),
    });

    const execution = {
      runId: "10000000-0000-4000-8000-000000000001",
      taskKey: "google_indexing_notifications",
      signal: new AbortController().signal,
      scheduledFor: "2026-07-14T00:00:00.000Z",
    } as never;

    await expect(
      runGoogleIndexingNotifications(execution),
    ).rejects.toMatchObject({
      code: "google_indexing_finish_rejected",
    });
    expect(
      rpcCallBodies(fetchMock, "google_indexing_finish_notification"),
    ).toEqual([
      {
        p_outbox_id: claimedNotifications[0].outbox_id,
        p_success: true,
        p_http_status: 200,
        p_error_code: null,
      },
    ]);
  });
});
