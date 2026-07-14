import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureAnalyticsEvent: vi.fn(),
  cookies: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/lib/analytics/server", () => ({
  captureAnalyticsEvent: mocks.captureAnalyticsEvent,
}));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));

import { POST } from "@/app/api/analytics/events/route";

function analyticsRequest(body: unknown) {
  return new Request("https://salarypadi.test/api/analytics/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nf-client-connection-ip": "203.0.113.42",
    },
    body: JSON.stringify(body),
  });
}

describe("analytics events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rejectCrossOriginRequest.mockReturnValue(null);
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "granted" })),
    });
    mocks.captureAnalyticsEvent.mockResolvedValue({ status: "accepted" });
  });

  it("does not capture anything without current consent", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "denied" })),
    });

    const response = await POST(
      analyticsRequest({ event_name: "job_view", path: "/jobs/example" }),
    );

    expect(response.status).toBe(204);
    expect(mocks.captureAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("passes only an allowlisted event and coarse route group to capture", async () => {
    const request = analyticsRequest({
      event_name: "job_view",
      path: "/jobs/example?campaign=private",
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(mocks.captureAnalyticsEvent).toHaveBeenCalledWith({
      eventName: "job_view",
      routeGroup: "/jobs",
      request,
    });
  });

  it("rejects an event outside the shared allow-list", async () => {
    const response = await POST(
      analyticsRequest({ event_name: "salary_amount", path: "/jobs" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.captureAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("rejects an oversized event body before capture", async () => {
    const response = await POST(
      analyticsRequest({
        event_name: "page_view",
        path: "/jobs",
        padding: "x".repeat(3 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.captureAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("returns a bounded retry response when the anonymous window is full", async () => {
    mocks.captureAnalyticsEvent.mockResolvedValue({ status: "rate_limited" });

    const response = await POST(
      analyticsRequest({ event_name: "page_view", path: "/jobs" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
  });
});
