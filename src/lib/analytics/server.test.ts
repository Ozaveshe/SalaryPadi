import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getServerEnvironment: vi.fn(),
}));

import { getServerEnvironment } from "@/lib/env";
import {
  analyticsRateLimitWindowStart,
  captureAnalyticsEvent,
  hashAnalyticsNetworkAddress,
} from "@/lib/analytics/server";

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  NODE_ENV: "production" as const,
};

function analyticsRequest(address = "203.0.113.42") {
  return new Request("https://salarypadi.test/api/analytics/events", {
    method: "POST",
    headers: { "x-nf-client-connection-ip": address },
  });
}

describe("server analytics capture", () => {
  beforeEach(() => {
    vi.mocked(getServerEnvironment).mockReturnValue(environment as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends only a daily HMAC and fixed window to the service-only RPC", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-07-13T10:07:42.000Z");
    const request = analyticsRequest();

    const result = await captureAnalyticsEvent({
      eventName: "job_view",
      routeGroup: "/jobs",
      request,
      now,
    });

    expect(result).toEqual({ status: "accepted" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://bxelrhklsznmpksgrqep.supabase.co/rest/v1/rpc/capture_analytics_event",
    );
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    expect(body).toMatchObject({
      p_event_name: "job_view",
      p_route_group: "/jobs",
      p_window_started_at: "2026-07-13T10:05:00.000Z",
    });
    expect(body.p_network_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("203.0.113.42");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer test-service-role-key",
    );
  });

  it("changes the non-reversible network key each day", () => {
    const request = analyticsRequest();
    const first = hashAnalyticsNetworkAddress(
      request,
      "secret",
      new Date("2026-07-13T23:59:00.000Z"),
    );
    const second = hashAnalyticsNetworkAddress(
      request,
      "secret",
      new Date("2026-07-14T00:01:00.000Z"),
    );

    expect(first).not.toBe(second);
    expect(first).not.toContain("203.0.113.42");
  });

  it("uses exact five-minute windows", () => {
    expect(
      analyticsRateLimitWindowStart(new Date("2026-07-13T10:09:59.999Z")),
    ).toBe("2026-07-13T10:05:00.000Z");
  });

  it("recognises the database rate-limit signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: "P0001", message: "rate limit exceeded" },
            { status: 400 },
          ),
        ),
    );

    await expect(
      captureAnalyticsEvent({
        eventName: "page_view",
        routeGroup: "/",
        request: analyticsRequest(),
      }),
    ).resolves.toEqual({ status: "rate_limited" });
  });

  it("fails closed when the service credential is unavailable", async () => {
    vi.mocked(getServerEnvironment).mockReturnValue({
      ...environment,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      captureAnalyticsEvent({
        eventName: "page_view",
        routeGroup: "/",
        request: analyticsRequest(),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      errorCode: "analytics_backend_unconfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
