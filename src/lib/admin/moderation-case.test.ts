import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getModerationCaseResult } from "@/lib/admin/moderation-case";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const caseId = "a9000000-0000-4000-8000-000000000020";

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: () => Promise.resolve({ data, error }) }),
  } as never;
}

function validDetail() {
  return {
    case: {
      id: caseId,
      state: "open",
      priority: 1,
      version: 2,
      opened_at: "2026-08-12T08:00:00.000Z",
      closed_at: null,
    },
    source_type: "review",
    source_payload: { pros: "Clear promotion criteria", cons: "Long hours" },
    flags: [
      {
        id: "a9000000-0000-4000-8000-000000000030",
        kind: "pii",
        source: "automated",
        confidence: "0.950",
        created_at: "2026-08-12T08:00:01.000Z",
        resolved_at: null,
      },
    ],
    actions: [
      {
        action: "claim",
        actor_role: "moderator",
        reason_code: "claim",
        reason_note: "Reviewing the PII flag",
        previous_state: "pending",
        new_state: "in_review",
        changed_fields: [],
        linked_case_id: null,
        occurred_at: "2026-08-12T08:05:00.000Z",
      },
    ],
  };
}

describe("moderation case repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns validated source, flags and action history", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning(validDetail()));
    await expect(getModerationCaseResult(caseId)).resolves.toMatchObject({
      state: "ready",
      data: {
        source_type: "review",
        flags: [{ kind: "pii", confidence: 0.95 }],
        actions: [{ action: "claim" }],
      },
    });
  });

  it("rejects an invalid route identity before opening a client", async () => {
    await expect(getModerationCaseResult("not-a-uuid")).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "moderation_case_id_invalid" }],
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("keeps a missing case distinct from a failed read", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning(null));
    await expect(getModerationCaseResult(caseId)).resolves.toMatchObject({
      state: "ready",
      data: null,
    });

    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { code: "42501" }),
    );
    await expect(getModerationCaseResult(caseId)).resolves.toMatchObject({
      state: "unavailable",
      data: null,
    });
  });

  it("fails closed on an unexpected source contract", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning({ ...validDetail(), source_type: "unknown" }),
    );
    await expect(getModerationCaseResult(caseId)).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "moderation_case_invalid" }],
    });
  });
});
