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

function profileRequest(
  values: Record<string, string> = {
    display_name: "Ada Career",
    state_code: "LA",
  },
) {
  return new Request("https://salarypadi.com/api/account/community-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://salarypadi.com",
    },
    body: new URLSearchParams(values),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({
    data: "ca000000-0000-4000-8000-000000000001",
    error: null,
  });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: mocks.schema },
  });
});

describe("account community profile route", () => {
  it("rejects cross-origin requests before reading account state", async () => {
    mocks.rejectCrossOriginRequest.mockReturnValue(
      Response.json({ error: "origin_not_allowed" }, { status: 403 }),
    );

    const response = await POST(profileRequest());

    expect(response.status).toBe(403);
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid identity fields before authentication or an RPC", async () => {
    const response = await POST(
      profileRequest({ display_name: "A", state_code: "LAGOS" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?profile=error",
    );
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("persists the validated identity and redirects with success", async () => {
    const response = await POST(profileRequest());

    expect(mocks.schema).toHaveBeenCalledWith("api");
    expect(mocks.rpc).toHaveBeenCalledWith("update_community_profile", {
      display_name: "Ada Career",
      state_code: "LA",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?profile=updated",
    );
  });

  it("redirects to an honest error state when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    const response = await POST(profileRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account?profile=error",
    );
  });

  it("returns unavailable when profile persistence transport throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(profileRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
