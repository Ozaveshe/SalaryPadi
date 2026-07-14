import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getAuthenticatedApiContext: mocks.getAuthenticatedApiContext,
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { POST } from "./route";

function alertRequest(searchQuery?: string) {
  return new Request("https://salarypadi.com/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      keyword: "platform engineer",
      location: "Nigeria",
      eligibility: "nigeria",
      cadence: "daily",
      ...(searchQuery === undefined ? {} : { search_query: searchQuery }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({
    data: "00000000-0000-4000-8000-000000000001",
    error: null,
  });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: () => ({ rpc: mocks.rpc }) },
  });
});

describe("alert creation route", () => {
  it("creates a canonical alert when hidden search state is omitted", async () => {
    const response = await POST(alertRequest());

    expect(response.status).toBe(303);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_job_alert",
      expect.objectContaining({
        alert_cadence: "daily",
        alert_query: expect.objectContaining({
          q: "platform engineer",
          location: "Nigeria",
          eligibility: "nigeria",
          workMode: "all",
        }),
      }),
    );
  });

  it("rejects malformed hidden search state before authentication", async () => {
    const response = await POST(
      alertRequest(JSON.stringify({ workMode: "banana" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid alert search.",
    });
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
