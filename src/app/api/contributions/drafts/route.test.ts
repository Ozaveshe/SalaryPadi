import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getServerEnvironment: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getAuthenticatedApiContext: mocks.getAuthenticatedApiContext,
}));
vi.mock("@/lib/env", () => ({
  getServerEnvironment: mocks.getServerEnvironment,
}));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { DELETE, GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.getServerEnvironment.mockReturnValue({});
  mocks.rpc.mockResolvedValue({
    data: "00000000-0000-4000-8000-000000000001",
    error: null,
  });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: () => ({ rpc: mocks.rpc }) },
  });
});

describe("private contribution drafts", () => {
  it("saves a bounded structured draft through the owner-scoped RPC", async () => {
    const response = await POST(
      new Request("https://salarypadi.com/api/contributions/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "review", payload: { company: "Acme" } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("save_contribution_draft", {
      p_kind: "review",
      p_payload: { company: "Acme" },
    });
  });

  it.each(["payslip", "attachment", "work_email", "verification_evidence"])(
    "refuses private evidence in a draft: %s",
    async (field) => {
      const response = await POST(
        new Request("https://salarypadi.com/api/contributions/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "salary",
            payload: { [field]: "must not persist" },
          }),
        }),
      );

      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("returns a controlled response for malformed JSON", async () => {
    const response = await POST(
      new Request("https://salarypadi.com/api/contributions/drafts", {
        method: "POST",
        body: "{broken",
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("loads and deletes only through authenticated draft RPCs", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        kind: "benefits",
        payload: { company: "Acme" },
        updated_at: "2026-07-14T10:00:00.000Z",
        expires_at: "2026-08-14T10:00:00.000Z",
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    const loaded = await GET(
      new Request(
        "https://salarypadi.com/api/contributions/drafts?kind=benefits",
      ),
    );
    const deleted = await DELETE(
      new Request(
        "https://salarypadi.com/api/contributions/drafts?kind=benefits",
        { method: "DELETE" },
      ),
    );

    expect(loaded.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "load_contribution_draft", {
      p_kind: "benefits",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "delete_contribution_draft", {
      p_kind: "benefits",
    });
  });

  it("does not return an invalid draft from the database", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        payload: { company: "Acme" },
        private_notes: "must not cross the API boundary",
      },
      error: null,
    });

    const response = await GET(
      new Request(
        "https://salarypadi.com/api/contributions/drafts?kind=review",
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Draft storage returned invalid data.",
    });
  });

  it.each([
    [
      "load",
      () =>
        GET(
          new Request(
            "https://salarypadi.com/api/contributions/drafts?kind=review",
          ),
        ),
    ],
    [
      "save",
      () =>
        POST(
          new Request("https://salarypadi.com/api/contributions/drafts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "review",
              payload: { company: "Acme" },
            }),
          }),
        ),
    ],
    [
      "delete",
      () =>
        DELETE(
          new Request(
            "https://salarypadi.com/api/contributions/drafts?kind=review",
            { method: "DELETE" },
          ),
        ),
    ],
  ])(
    "returns a controlled 503 when draft %s transport throws",
    async (_, run) => {
      mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

      const response = await run();

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
});
