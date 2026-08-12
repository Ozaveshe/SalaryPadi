import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
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

function retentionRequest(policy = "days_90") {
  return new Request("https://salarypadi.com/api/account/workspace-retention", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://salarypadi.com",
    },
    body: new URLSearchParams({ policy }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: mocks.schema },
  });
});

describe("account workspace retention route", () => {
  it("rejects cross-origin requests before authentication", async () => {
    mocks.rejectCrossOriginRequest.mockReturnValue(
      Response.json({ error: "origin_not_allowed" }, { status: 403 }),
    );

    const response = await POST(retentionRequest());

    expect(response.status).toBe(403);
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unknown policy before authentication", async () => {
    const response = await POST(retentionRequest("days_30"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?retention=error",
    );
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
  });

  it("persists a validated preference", async () => {
    const response = await POST(retentionRequest("days_365"));

    expect(mocks.schema).toHaveBeenCalledWith("api");
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_workspace_retention", {
      p_policy: "days_365",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?retention=saved",
    );
  });

  it("does not claim success for a failed or malformed RPC", async () => {
    for (const result of [
      { data: null, error: { message: "database unavailable" } },
      { data: "true", error: null },
    ]) {
      mocks.rpc.mockResolvedValueOnce(result);
      const response = await POST(retentionRequest());
      expect(response.headers.get("location")).toBe(
        "https://salarypadi.com/account?retention=error",
      );
    }
  });

  it("returns unavailable when the transport throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(retentionRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
