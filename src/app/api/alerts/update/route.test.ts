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

import { POST } from "./route";

const alertId = "aa000000-0000-4000-8000-000000000001";

function alertRequest(values: Record<string, string>) {
  return new Request("https://salarypadi.com/api/alerts/update", {
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
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: mocks.schema },
  });
});

describe("alert update route", () => {
  it("rejects cross-origin requests before authentication", async () => {
    mocks.rejectCrossOriginRequest.mockReturnValue(
      Response.json({ error: "origin_not_allowed" }, { status: 403 }),
    );

    const response = await POST(
      alertRequest({ intent: "set-active", id: alertId, active: "false" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed updates before authentication or an RPC", async () => {
    const response = await POST(
      alertRequest({ intent: "set-active", id: "not-an-id", active: "yes" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid alert update.",
    });
    expect(mocks.getAuthenticatedApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("updates validated query filters and cadence", async () => {
    const response = await POST(
      alertRequest({
        intent: "edit",
        id: alertId,
        keyword: "platform engineer",
        location: "Nigeria",
        eligibility: "nigeria",
        cadence: "weekly",
        search_query: JSON.stringify({
          q: "old role",
          eligibility: "all",
          hndAccepted: true,
          hmo: true,
          fxPolicy: true,
        }),
      }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_job_alert",
      expect.objectContaining({
        alert_id: alertId,
        alert_cadence: "weekly",
        alert_query: expect.objectContaining({
          q: "platform engineer",
          location: "Nigeria",
          eligibility: "nigeria",
          hndAccepted: true,
          hmo: true,
          fxPolicy: true,
        }),
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/alerts?updated=true",
    );
  });

  it("pauses and resumes without replacing stored filters", async () => {
    const paused = await POST(
      alertRequest({ intent: "set-active", id: alertId, active: "false" }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("update_job_alert", {
      alert_id: alertId,
      alert_active: false,
    });
    expect(paused.headers.get("location")).toBe(
      "https://salarypadi.com/alerts?updated=paused",
    );

    const resumed = await POST(
      alertRequest({ intent: "set-active", id: alertId, active: "true" }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("update_job_alert", {
      alert_id: alertId,
      alert_active: true,
    });
    expect(resumed.headers.get("location")).toBe(
      "https://salarypadi.com/alerts?updated=resumed",
    );
  });

  it("redirects to an error state when no owner row is updated", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(
      alertRequest({ intent: "set-active", id: alertId, active: "false" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/alerts?updated=error",
    );
  });
});
