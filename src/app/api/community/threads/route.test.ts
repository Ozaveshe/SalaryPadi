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

import { POST } from "@/app/api/community/threads/route";

function threadRequest() {
  return new Request("https://salarypadi.com/api/community/threads", {
    method: "POST",
    body: new URLSearchParams({
      display_name: "Ada Career",
      state_code: "LA",
      topic_slug: "career-growth",
      title: "How should I prepare for a promotion?",
      body: "I would value practical advice from people who have done this.",
    }),
  });
}

describe("community thread mutation boundary", () => {
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

  it("redirects only to a validated thread UUID", async () => {
    const response = await POST(threadRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/forums/00000000-0000-4000-8000-000000000001?status=published",
    );
  });

  it("does not use a malformed RPC result as a redirect path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({ data: "../../admin", error: null });

    const response = await POST(threadRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/forums?status=error",
    );
  });
});
