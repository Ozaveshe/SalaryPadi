import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getModerationBacklogResult } from "@/lib/admin/moderation-backlog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

const backlog = {
  measured_at: "2026-08-12T12:00:00.000Z",
  active_count: 7,
  open_count: 4,
  in_review_count: 2,
  escalated_count: 1,
  unassigned_count: 3,
  priority_one_count: 1,
  older_than_24h_count: 2,
  oldest_opened_at: "2026-08-10T09:00:00.000Z",
};

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: () => Promise.resolve({ data, error }) }),
  } as never;
}

describe("moderation backlog repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns internally consistent queue evidence", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning(backlog));

    await expect(getModerationBacklogResult()).resolves.toMatchObject({
      state: "ready",
      data: { active_count: 7, older_than_24h_count: 2 },
    });
  });

  it("rejects an impossible state breakdown", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({ ...backlog, active_count: 8 }),
    );

    await expect(getModerationBacklogResult()).resolves.toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ code: "moderation_backlog_invalid" }],
    });
  });

  it("requires oldest-case evidence whenever the queue is active", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({ ...backlog, oldest_opened_at: null }),
    );

    await expect(getModerationBacklogResult()).resolves.toMatchObject({
      state: "invalid",
      data: null,
    });
  });

  it("does not turn a failed read into a clear queue", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { code: "42501" }),
    );

    await expect(getModerationBacklogResult()).resolves.toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "moderation_backlog_query_failed" }],
    });
  });
});
