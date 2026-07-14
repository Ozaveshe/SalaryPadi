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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({ data: "request-id", error: null });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: () => ({ rpc: mocks.rpc }) },
  });
});

describe("privacy request route", () => {
  it("requires a contribution target for deletion", async () => {
    const response = await POST(
      new Request("https://salarypadi.com/api/privacy-requests", {
        method: "POST",
        body: new URLSearchParams({ kind: "contribution_deletion" }),
      }),
    );

    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/privacy/requests?created=error",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes a typed target to the owner-enforcing database boundary", async () => {
    const target = "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e";
    await POST(
      new Request("https://salarypadi.com/api/privacy-requests", {
        method: "POST",
        body: new URLSearchParams({
          kind: "contribution_deletion",
          target_id: target,
          details: "Please remove my contribution.",
        }),
      }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith("request_privacy_action", {
      p_kind: "contribution_deletion",
      p_target_id: target,
      p_details: { request_note: "Please remove my contribution." },
    });
  });

  it("returns an explicit unavailable response when persistence transport throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(
      new Request("https://salarypadi.com/api/privacy-requests", {
        method: "POST",
        body: new URLSearchParams({ kind: "data_export" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
