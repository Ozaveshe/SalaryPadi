import { afterEach, describe, expect, it, vi } from "vitest";

import googleIndexingNotifications from "../google-indexing-notifications.mjs";
import {
  nonBookkeepingUrls,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
} from "./test-support/scheduled-worker";
import { installWorkerFetch } from "./test-support/scheduled-worker";
import { publishGoogleIndexingNotification } from "./google-indexing";

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
});
