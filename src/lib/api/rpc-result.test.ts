import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  apiRpcBooleanResultSchema,
  apiRpcUuidResultSchema,
  decodeApiRpcResult,
} from "@/lib/api/rpc-result";

describe("API RPC result boundary", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns a validated UUID result", () => {
    expect(
      decodeApiRpcResult(
        "alerts.create",
        "alert_create_failed",
        {
          data: "00000000-0000-4000-8000-000000000001",
          error: null,
        },
        apiRpcUuidResultSchema,
      ),
    ).toEqual({
      ok: true,
      data: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("keeps provider failures distinct from invalid success payloads", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      decodeApiRpcResult(
        "alerts.update",
        "alert_update_failed",
        { data: null, error: { code: "PGRST500" } },
        apiRpcBooleanResultSchema,
      ),
    ).toEqual({ ok: false, kind: "query_failed" });
    expect(
      decodeApiRpcResult(
        "alerts.update",
        "alert_update_failed",
        { data: "true", error: null },
        apiRpcBooleanResultSchema,
      ),
    ).toEqual({ ok: false, kind: "invalid_result" });
    expect(errorLog).toHaveBeenCalledTimes(2);
  });
});
