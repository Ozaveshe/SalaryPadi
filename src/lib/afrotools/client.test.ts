import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const providerConfig = vi.hoisted(() => ({
  apiKey: "test-provider-secret" as string | undefined,
}));
vi.mock("@/lib/env", () => ({
  getAfroToolsConfig: () => ({
    baseUrl: "https://afrotools.com/api/v1",
    apiKey: providerConfig.apiKey,
  }),
}));

import {
  AfroToolsApiError,
  callAfroTools,
  logAfroToolsFallback,
} from "@/lib/afrotools/client";

describe("AfroTools client failure boundary", () => {
  afterEach(() => {
    providerConfig.apiKey = "test-provider-secret";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fails fast without making an unauthenticated provider request", async () => {
    providerConfig.apiKey = undefined;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);

    await expect(callAfroTools("/test", {})).rejects.toMatchObject({
      code: "unconfigured",
      retryable: false,
      status: 503,
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized", false],
    [429, "rate_limited", true],
    [500, "upstream_5xx", true],
  ] as const)(
    "classifies HTTP %s without reading or exposing the provider body",
    async (status, code, retryable) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response('{"private":"provider detail"}', { status }),
          ),
      );

      await expect(
        callAfroTools("/test", { private: "input" }),
      ).rejects.toMatchObject({
        code,
        retryable,
        status,
      });
    },
  );

  it("classifies an aborted request as a timeout", async () => {
    const timeout = new Error("request aborted");
    timeout.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(callAfroTools("/test", {})).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
      status: 504,
    });
  });

  it("classifies invalid successful JSON as an invalid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(callAfroTools("/test", {})).rejects.toMatchObject({
      code: "invalid_response",
      retryable: false,
      status: 502,
    });
  });

  it("logs only stable provider metadata", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    logAfroToolsFallback(
      "offer_compare",
      new AfroToolsApiError("unauthorized", 401, false),
    );

    const serialized = String(warning.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toEqual({
      event: "provider_fallback",
      provider: "afrotools",
      operation: "offer_compare",
      code: "unauthorized",
      status: 401,
      retryable: false,
    });
    expect(serialized).not.toContain("test-provider-secret");
  });
});
