import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  getServerEnvironment: vi.fn(),
  containsProhibitedDocumentField: vi.fn(),
  analyzeContributionPayload: vi.fn(),
  hashContributionNetworkAddress: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getAuthenticatedApiContext: mocks.getAuthenticatedApiContext,
}));
vi.mock("@/lib/contributions/schemas", () => ({
  containsProhibitedDocumentField: mocks.containsProhibitedDocumentField,
  contributionSchemas: {
    salary: { safeParse: mocks.safeParse },
    review: { safeParse: mocks.safeParse },
    interview: { safeParse: mocks.safeParse },
    benefits: { safeParse: mocks.safeParse },
    pay_reliability: { safeParse: mocks.safeParse },
  },
}));
vi.mock("@/lib/contributions/abuse", () => ({
  hashContributionNetworkAddress: mocks.hashContributionNetworkAddress,
}));
vi.mock("@/lib/contributions/moderation", () => ({
  analyzeContributionPayload: mocks.analyzeContributionPayload,
}));
vi.mock("@/lib/env", () => ({
  getAppOrigin: mocks.getAppOrigin,
  getServerEnvironment: mocks.getServerEnvironment,
}));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.containsProhibitedDocumentField.mockReturnValue(false);
  mocks.analyzeContributionPayload.mockReturnValue([]);
  mocks.hashContributionNetworkAddress.mockReturnValue("daily-hash");
  mocks.getServerEnvironment.mockReturnValue({
    SUPABASE_SERVICE_ROLE_KEY: "secret",
  });
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
      contribution_payload: {
        role: "Engineer",
        _intake: {
          daily_network_key_hash: "daily-hash",
          flags: [],
          rule_version: "company-intake-v1",
        },
      },
    });
  });

  it("refuses prohibited verification evidence before persistence", async () => {
    mocks.containsProhibitedDocumentField.mockReturnValue(true);

    const response = await POST(
      new Request("https://salarypadi.com/api/contributions/salary", {
        method: "POST",
        body: new URLSearchParams({ payslip: "not accepted" }),
      }),
      { params: Promise.resolve({ kind: "salary" }) } as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("attaches codes rather than matched malicious text", async () => {
    mocks.analyzeContributionPayload.mockReturnValue(["pii", "malicious_text"]);

    await POST(
      new Request("https://salarypadi.com/api/contributions/review", {
        method: "POST",
        body: new URLSearchParams({ role: "Engineer" }),
      }),
      { params: Promise.resolve({ kind: "review" }) } as never,
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_contribution",
      expect.objectContaining({
        contribution_payload: expect.objectContaining({
          _intake: expect.objectContaining({
            flags: ["pii", "malicious_text"],
          }),
        }),
      }),
    );
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
