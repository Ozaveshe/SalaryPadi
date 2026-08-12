import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getWorkspaceRetention } from "@/lib/privacy/workspace-retention";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const validRow = {
  policy: "days_90",
  retention_days: 90,
  grace_until: "2026-09-11T10:00:00.000+00:00",
  next_deletion_at: "2026-09-11T10:00:00.000+00:00",
  affected_records: 3,
};
const invalidRows: unknown[] = [
  [],
  [{ ...validRow, policy: "manual", retention_days: 90 }],
  [{ ...validRow, grace_until: null }],
  [{ ...validRow, owner_user_id: "private" }],
];

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: async () => ({ data, error }) }),
  } as never;
}

describe("workspace retention repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("distinguishes an unconfigured backend from manual retention", async () => {
    mockedCreateClient.mockResolvedValue(null);

    await expect(getWorkspaceRetention()).resolves.toMatchObject({
      state: "unconfigured",
      data: { policy: "manual" },
    });
  });

  it("maps a strictly validated finite-retention row", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validRow]));

    await expect(getWorkspaceRetention()).resolves.toEqual({
      state: "ready",
      data: {
        policy: "days_90",
        retentionDays: 90,
        graceUntil: validRow.grace_until,
        nextDeletionAt: validRow.next_deletion_at,
        affectedRecords: 3,
      },
      issues: [],
    });
  });

  it.each(invalidRows)(
    "rejects malformed or overexposed rows %#",
    async (rows) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockedCreateClient.mockResolvedValue(clientReturning(rows));

      await expect(getWorkspaceRetention()).resolves.toMatchObject({
        state: "invalid",
        data: { policy: "manual" },
        issues: [{ code: "workspace_retention_invalid_rows" }],
      });
    },
  );

  it("does not present an RPC error as a saved policy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );

    await expect(getWorkspaceRetention()).resolves.toMatchObject({
      state: "unavailable",
      issues: [{ code: "workspace_retention_query_failed" }],
    });
  });
});
