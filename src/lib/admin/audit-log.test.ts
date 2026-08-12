import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getAdminAuditEventsResult } from "@/lib/admin/audit-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

const event = {
  id: "fc1de624-7fd5-4b51-b1c3-bbd0a51466d4",
  occurred_at: "2026-08-12T00:00:00.000Z",
  actor_user_id: null,
  actor_kind: "system",
  action: "job.closed",
  target_type: "job",
  target_id: "3d32d4fd-63e2-4e1a-9194-21a27100c956",
  request_id: null,
  reason_code: "employer_confirmed_closed",
  previous_state: { status: "published" },
  new_state: { status: "expired" },
  changed_fields: ["status"],
  before_hash: null,
  after_hash: null,
  metadata: {},
};

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: () => Promise.resolve({ data, error }) }),
  } as never;
}

describe("admin audit log repository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns strict audit events", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([event]));

    await expect(getAdminAuditEventsResult()).resolves.toMatchObject({
      state: "ready",
      data: [{ action: "job.closed", changed_fields: ["status"] }],
    });
  });

  it("fails closed on malformed events", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...event, actor_kind: "unknown" }]),
    );

    await expect(getAdminAuditEventsResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_audit_log_invalid_rows" }],
    });
  });

  it("fails closed when the reviewed bound is exceeded", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning(Array.from({ length: 101 }, () => event)),
    );

    await expect(getAdminAuditEventsResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_audit_log_capacity_exceeded" }],
    });
  });

  it("fails closed on duplicate event identities", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([event, event]));

    await expect(getAdminAuditEventsResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_audit_log_duplicate_events" }],
    });
  });
});
