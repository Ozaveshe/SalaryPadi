import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getAdminRowsResult } from "@/lib/admin/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    limit: () => query,
    then: result.then.bind(result),
  };
  return {
    schema: () => ({ rpc: () => query }),
  } as never;
}

describe("admin repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns validated administration rows", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
          title: "Pending company",
          secondary: null,
          status: "pending",
          updated_at: "2026-07-11T00:00:00.000Z",
          version: 1,
        },
      ]),
    );
    await expect(getAdminRowsResult("companies")).resolves.toMatchObject({
      state: "ready",
      data: [{ title: "Pending company" }],
    });
  });

  it("marks an entirely invalid admin payload invalid", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ id: "not-a-uuid" }]),
    );
    await expect(getAdminRowsResult("companies")).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_queue_invalid_rows" }],
    });
  });

  it("surfaces returned admin query failures as unavailable", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    await expect(getAdminRowsResult("reports")).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "admin_queue_query_failed" }],
    });
  });

  it("retains validated rows while marking a mixed response degraded", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
          title: "Pending company",
          secondary: null,
          status: "pending",
          updated_at: "2026-07-11T00:00:00.000Z",
          version: 1,
        },
        { id: "not-a-uuid" },
      ]),
    );

    await expect(getAdminRowsResult("companies")).resolves.toMatchObject({
      state: "degraded",
      data: [{ title: "Pending company" }],
      issues: [{ code: "admin_queue_invalid_rows" }],
    });
  });

  it("fails closed when an admin queue exceeds its reviewed capacity", async () => {
    const row = {
      id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
      title: "Pending company",
      secondary: null,
      status: "pending",
      updated_at: "2026-07-11T00:00:00.000Z",
      version: 0,
    };
    mockedCreateClient.mockResolvedValue(
      clientReturning(Array.from({ length: 201 }, () => row)),
    );

    await expect(getAdminRowsResult("editorial")).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_queue_capacity_exceeded" }],
    });
  });

  it("fails closed on duplicate admin identities", async () => {
    const row = {
      id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
      title: "Pending company",
      secondary: null,
      status: "pending",
      updated_at: "2026-07-11T00:00:00.000Z",
      version: 1,
    };
    mockedCreateClient.mockResolvedValue(clientReturning([row, row]));

    await expect(getAdminRowsResult("companies")).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_queue_duplicate_rows" }],
    });
  });

  it("does not invent a missing optimistic-concurrency version", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
          title: "Pending company",
          secondary: null,
          status: "pending",
          updated_at: "2026-07-11T00:00:00.000Z",
        },
      ]),
    );

    await expect(getAdminRowsResult("companies")).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_queue_invalid_rows" }],
    });
  });

  it("maps a thrown admin transport to unavailable", async () => {
    const rejected = Promise.reject(new Error("transport unavailable"));
    const query = {
      limit: () => query,
      then: rejected.then.bind(rejected),
    };
    mockedCreateClient.mockResolvedValue({
      schema: () => ({
        rpc: () => query,
      }),
    } as never);

    await expect(getAdminRowsResult("users")).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "admin_queue_query_failed" }],
    });
  });
});
