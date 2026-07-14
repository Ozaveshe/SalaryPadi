import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGoogleAccessToken } = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
}));

vi.mock("./google-auth", () => ({ getGoogleAccessToken }));

import {
  readSearchConsoleTopicSignals,
  sanitizeSearchConsoleQuery,
} from "./google-search-console";

beforeEach(() => {
  getGoogleAccessToken.mockResolvedValue("opaque-token");
  vi.stubGlobal("Netlify", {
    env: {
      get: (name: string) =>
        ({
          GOOGLE_SEARCH_CONSOLE_ENABLED: "true",
          GOOGLE_SEARCH_CONSOLE_SITE_URL: "sc-domain:salarypadi.com",
        })[name],
    },
  });
});

afterEach(() => {
  getGoogleAccessToken.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Search Console topic signal privacy", () => {
  it("keeps useful aggregate queries and rejects likely personal data", () => {
    expect(sanitizeSearchConsoleQuery("  remote jobs nigeria  ")).toBe(
      "remote jobs nigeria",
    );
    expect(sanitizeSearchConsoleQuery("person@example.com jobs")).toBeNull();
    expect(sanitizeSearchConsoleQuery("call 08012345678 jobs")).toBeNull();
    expect(sanitizeSearchConsoleQuery("a")).toBeNull();
  });

  it("quarantines malformed rows and exposes a degraded state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          rows: [
            { keys: ["remote jobs nigeria"], clicks: 2, impressions: 10 },
            { keys: ["invalid metrics"], clicks: 4, impressions: 3 },
            { keys: ["missing impressions"], clicks: 1 },
          ],
        }),
      ),
    );

    const result = await readSearchConsoleTopicSignals({
      signal: new AbortController().signal,
      remainingMs: () => 10_000,
    });

    expect(result).toMatchObject({
      state: "degraded",
      issueCodes: ["google_search_console_invalid_rows"],
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      signal_key: "remote jobs nigeria",
      clicks: 2,
      impressions: 10,
    });
  });

  it("rejects an oversized provider response with a stable code", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ rows: [], padding: "x".repeat(140 * 1_024) }),
          ),
        ),
    );

    await expect(
      readSearchConsoleTopicSignals({
        signal: new AbortController().signal,
        remainingMs: () => 10_000,
      }),
    ).rejects.toMatchObject({
      code: "google_search_console_invalid_response",
    });
  });
});
