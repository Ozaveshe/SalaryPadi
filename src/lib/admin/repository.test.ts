import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getAdminRows } from "@/lib/admin/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: async () => ({ data, error }) }),
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
          version: 0,
        },
      ]),
    );
    await expect(getAdminRows("companies")).resolves.toHaveLength(1);
  });

  it("rejects invalid admin payloads", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ id: "not-a-uuid" }]),
    );
    await expect(getAdminRows("companies")).rejects.toThrow(
      "administration response was invalid",
    );
  });

  it("surfaces admin query failures", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    await expect(getAdminRows("reports")).rejects.toThrow(
      "Could not load the reports administration queue",
    );
  });
});
