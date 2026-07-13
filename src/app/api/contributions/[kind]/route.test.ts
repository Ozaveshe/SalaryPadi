import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getAuthenticatedApiContext: mocks.getAuthenticatedApiContext,
}));
vi.mock("@/lib/contributions/schemas", () => ({
  contributionSchemas: {
    salary: { safeParse: mocks.safeParse },
    review: { safeParse: mocks.safeParse },
    interview: { safeParse: mocks.safeParse },
  },
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.safeParse.mockReturnValue({
    success: true,
    data: { role: "Engineer" },
  });
  mocks.rpc.mockResolvedValue({ data: "contribution-id", error: null });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: () => ({ rpc: mocks.rpc }) },
  });
});

describe("contribution route", () => {
  it("identifies a successful salary submission for the share prompt", async () => {
    const response = await POST(
      new Request("https://salarypadi.com/api/contributions/salary", {
        method: "POST",
        body: new URLSearchParams({ role: "Engineer" }),
      }),
      { params: Promise.resolve({ kind: "salary" }) } as never,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/contribute?status=submitted&kind=salary",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("submit_contribution", {
      contribution_kind: "salary",
      contribution_payload: { role: "Engineer" },
    });
  });

  it("does not show a success share state when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "unavailable" } });

    const response = await POST(
      new Request("https://salarypadi.com/api/contributions/salary", {
        method: "POST",
        body: new URLSearchParams({ role: "Engineer" }),
      }),
      { params: Promise.resolve({ kind: "salary" }) } as never,
    );

    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/contribute?status=error",
    );
  });
});
