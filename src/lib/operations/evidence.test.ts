import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { readOperationsEvidence } from "./evidence";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const evidenceSchema = z.object({ status: z.literal("ready") }).strict();
const parameters = {
  operation: "operations.test",
  rpc: "get_test_evidence",
  schema: evidenceSchema,
  codes: {
    unconfigured: "test_backend_unconfigured",
    queryFailed: "test_query_failed",
    invalid: "test_invalid",
  },
};

function clientReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { schema: () => ({ rpc }) } as never, rpc };
}

describe("operations evidence reader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns validated evidence from a supplied client", async () => {
    const { client, rpc } = clientReturning({ status: "ready" });

    const result = await readOperationsEvidence({
      ...parameters,
      suppliedClient: client,
    });

    expect(result).toEqual({
      state: "ready",
      data: { status: "ready" },
      issues: [],
    });
    expect(rpc).toHaveBeenCalledWith("get_test_evidence");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("keeps an unconfigured backend distinct from empty evidence", async () => {
    mockedCreateClient.mockResolvedValue(null);

    const result = await readOperationsEvidence(parameters);

    expect(result.state).toBe("unconfigured");
    expect(result.data).toBeNull();
    expect(result.issues[0]).toMatchObject({
      kind: "not_configured",
      code: "test_backend_unconfigured",
    });
  });

  it("returns unavailable for RPC errors and thrown transports", async () => {
    const failed = clientReturning(null, { code: "rpc_failed" });
    const failedResult = await readOperationsEvidence({
      ...parameters,
      suppliedClient: failed.client,
    });
    expect(failedResult).toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ kind: "query_failed", code: "test_query_failed" }],
    });

    const throwingClient = {
      schema: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("transport failed")),
      }),
    } as never;
    const thrownResult = await readOperationsEvidence({
      ...parameters,
      suppliedClient: throwingClient,
    });
    expect(thrownResult.state).toBe("unavailable");
    expect(thrownResult.issues[0]?.code).toBe("test_query_failed");
    expect(unstable_rethrow).toHaveBeenCalledWith(expect.any(Error));
  });

  it("returns unavailable when client creation throws", async () => {
    mockedCreateClient.mockRejectedValue(new Error("configuration failed"));

    const result = await readOperationsEvidence(parameters);

    expect(result.state).toBe("unavailable");
    expect(result.issues[0]?.code).toBe("test_query_failed");
    expect(unstable_rethrow).toHaveBeenCalledWith(expect.any(Error));
  });

  it("quarantines invalid evidence without inventing a fallback", async () => {
    const { client } = clientReturning({ status: "unknown" });

    const result = await readOperationsEvidence({
      ...parameters,
      suppliedClient: client,
    });

    expect(result).toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ kind: "invalid_container", code: "test_invalid" }],
    });
  });
});
