import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getMyPrivacyRequestsResult } from "@/lib/privacy/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const query = {
    select: () => query,
    order: () => query,
    limit: async () => ({ data, error }),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

describe("privacy repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("distinguishes an unconfigured backend from an empty history", async () => {
    mockedCreateClient.mockResolvedValue(null);
    const result = await getMyPrivacyRequestsResult();
    expect(result.state).toBe("unconfigured");
    expect(result.data).toEqual([]);
  });

  it("returns ready only after a valid empty read", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([]));
    await expect(getMyPrivacyRequestsResult()).resolves.toEqual({
      state: "ready",
      data: [],
      issues: [],
    });
  });

  it("surfaces query failures without claiming the history is empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    const result = await getMyPrivacyRequestsResult();
    expect(result.state).toBe("unavailable");
    expect(result.issues[0]?.code).toBe("privacy_query_failed");
  });

  it("fails the read when any private row violates its contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ id: "not-a-uuid" }]),
    );
    const result = await getMyPrivacyRequestsResult();
    expect(result.state).toBe("invalid");
    expect(result.data).toEqual([]);
  });
});
