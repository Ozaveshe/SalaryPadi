import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getViewer: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/dal", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { POST } from "@/app/api/analytics/consent/route";

function consentRequest(body: unknown) {
  return new Request("https://salarypadi.test/api/analytics/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("analytics consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rejectCrossOriginRequest.mockReturnValue(null);
    mocks.getViewer.mockResolvedValue({ state: "anonymous" });
    mocks.createServerSupabaseClient.mockResolvedValue({
      schema: () => ({ rpc: mocks.rpc }),
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.cookies.mockResolvedValue({ set: vi.fn() });
  });

  it("rejects an oversized consent body before auth or persistence", async () => {
    const response = await POST(
      consentRequest({ allowed: true, padding: "x".repeat(2 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it.each([
    [
      "client bootstrap",
      () =>
        mocks.createServerSupabaseClient.mockRejectedValue(
          new Error("client unavailable"),
        ),
    ],
    [
      "consent RPC",
      () => mocks.rpc.mockRejectedValue(new Error("transport unavailable")),
    ],
  ])(
    "does not set a consent cookie when authenticated %s throws",
    async (_, fail) => {
      mocks.getViewer.mockResolvedValue({ state: "authenticated" });
      fail();

      const response = await POST(consentRequest({ allowed: true }));

      expect(response.status).toBe(503);
      expect(mocks.cookies).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["database error", { data: null, error: { code: "P0001" } }],
    ["malformed acknowledgement", { data: true, error: null }],
  ])(
    "does not set a consent cookie after an authenticated %s envelope",
    async (_, rpcResult) => {
      mocks.getViewer.mockResolvedValue({ state: "authenticated" });
      mocks.rpc.mockResolvedValue(rpcResult);

      const response = await POST(consentRequest({ allowed: true }));

      expect(response.status).toBe(503);
      expect(mocks.cookies).not.toHaveBeenCalled();
    },
  );
});
