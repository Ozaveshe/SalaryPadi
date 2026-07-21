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

function completeProfile(overrides: Record<string, string> = {}) {
  return {
    headline: "Backend engineer",
    summary: "",
    years_experience: "6",
    experience_level: "mid",
    desired_work_arrangement: "remote",
    desired_salary_min: "400000",
    desired_salary_max: "600000",
    desired_currency_code: "NGN",
    desired_pay_period: "monthly",
    location_country: "NG",
    ...overrides,
  };
}

function profileRequest(values: Record<string, string> = completeProfile()) {
  return new Request("https://salarypadi.com/api/account/candidate-profile", {
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
    data: "2026-07-15T10:00:00.000+00:00",
    error: null,
  });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: mocks.schema },
  });
});

describe("account candidate profile route", () => {
  it("rejects cross-origin requests before reading account state", async () => {
    mocks.rejectCrossOriginRequest.mockReturnValue(
      Response.json({ error: "origin_not_allowed" }, { status: 403 }),
    );

    const response = await POST(profileRequest());

    expect(response.status).toBe(403);
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller before any write", async () => {
    mocks.getAuthenticatedApiContext.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    });

    const response = await POST(profileRequest());

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("saves the attested profile and redirects with success", async () => {
    const response = await POST(profileRequest());

    expect(mocks.schema).toHaveBeenCalledWith("api");
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_candidate_profile", {
      profile_payload: {
        headline: "Backend engineer",
        summary: undefined,
        years_experience: 6,
        experience_level: "mid",
        desired_work_arrangement: "remote",
        desired_salary_min: 400_000,
        desired_salary_max: 600_000,
        desired_currency_code: "NGN",
        desired_pay_period: "monthly",
        location_country: "NG",
        open_to_relocation: false,
      },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account/candidate-profile?status=saved",
    );
  });

  it("rejects a pay expectation with no currency rather than hitting the constraint", async () => {
    const response = await POST(
      profileRequest(completeProfile({ desired_currency_code: "" })),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account/candidate-profile?status=error",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed country before an RPC", async () => {
    const response = await POST(
      profileRequest(completeProfile({ location_country: "nigeria" })),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account/candidate-profile?status=error",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("redirects to an honest error state when persistence fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    const response = await POST(profileRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account/candidate-profile?status=error",
    );
  });

  it("does not report success when the RPC returns a malformed result", async () => {
    mocks.rpc.mockResolvedValue({ data: "not-a-timestamp", error: null });

    const response = await POST(profileRequest());

    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/account/candidate-profile?status=error",
    );
  });

  it("returns unavailable when the transport throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(profileRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
