import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getMyPrivacyRequestsResult } from "@/lib/privacy/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

const validRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "data_export",
  target_id: null,
  status: "pending",
  requested_at: "2026-07-14T10:00:00.000Z",
  completed_at: null,
  resolution_note: null,
};

function clientReturning(data: unknown, error: unknown = null) {
  const query = {
    select: () => query,
    order: () => query,
    limit: async () => ({ data, error }),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function clientThrowing(failure: Error) {
  const query = {
    select: () => query,
    order: () => query,
    limit: async () => Promise.reject(failure),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

describe("privacy repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

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

  it("returns a request only after validating its lifecycle timestamps", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validRequest]));

    await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
      state: "ready",
      data: [validRequest],
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

  it.each([
    { requested_at: "not-a-timestamp" },
    { status: "completed", completed_at: null },
    { status: "pending", completed_at: "2026-07-14T11:00:00.000Z" },
    {
      status: "completed",
      completed_at: "2026-07-14T09:00:00.000Z",
    },
  ])("rejects inconsistent privacy lifecycle evidence %#", async (override) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRequest, ...override }]),
    );

    await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "privacy_invalid_rows" }],
    });
  });

  it("rejects duplicate or out-of-order private history rows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const laterRequest = {
      ...validRequest,
      id: "00000000-0000-4000-8000-000000000002",
      requested_at: "2026-07-14T11:00:00.000Z",
    };

    for (const data of [
      [validRequest, validRequest],
      [validRequest, laterRequest],
    ]) {
      mockedCreateClient.mockResolvedValueOnce(clientReturning(data));
      await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
        state: "invalid",
        data: [],
        issues: [{ code: "privacy_invalid_rows" }],
      });
    }
  });

  it("rejects undeclared private-history fields", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRequest, user_id: "private-owner" }]),
    );

    await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "privacy_invalid_rows" }],
    });
  });

  it("rejects a response that exceeds the privacy-history query bound", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(
        Array.from({ length: 51 }, (_, index) => ({
          ...validRequest,
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
      ),
    );

    const result = await getMyPrivacyRequestsResult();
    expect(result).toMatchObject({
      state: "degraded",
      issues: [{ code: "privacy_capacity_exceeded" }],
    });
    expect(result.data).toHaveLength(50);
  });

  it("maps a thrown client bootstrap failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("privacy client failed");
    mockedCreateClient.mockRejectedValue(failure);

    await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "privacy_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("maps a thrown privacy query transport to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("privacy transport failed");
    mockedCreateClient.mockResolvedValue(clientThrowing(failure));

    await expect(getMyPrivacyRequestsResult()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "privacy_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });
});
