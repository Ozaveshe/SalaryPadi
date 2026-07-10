import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getSavedJobs } from "@/lib/career/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: async () => ({ data, error }) }),
  } as never;
}

describe("private career repository states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("distinguishes an unconfigured backend from an empty account", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await expect(getSavedJobs()).resolves.toEqual({
      state: "unconfigured",
      data: [],
    });
  });

  it("returns a real empty state only after a successful RPC", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([]));
    await expect(getSavedJobs()).resolves.toEqual({ state: "ready", data: [] });
  });

  it("fails closed and records a stable code for malformed rows", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ id: "not-a-uuid" }]),
    );
    await expect(getSavedJobs()).resolves.toEqual({
      state: "invalid",
      data: [],
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"invalid_rows"'),
    );
  });

  it("does not relabel an RPC outage as an empty account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    await expect(getSavedJobs()).resolves.toEqual({
      state: "unavailable",
      data: [],
    });
  });
});
