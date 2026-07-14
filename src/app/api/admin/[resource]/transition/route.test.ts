import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  revalidateTag: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/auth/api", () => ({
  getAdminApiContext: mocks.getAdminApiContext,
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { REMOTIVE_CACHE_TAG } from "@/lib/jobs/source-policy";

import { POST } from "./route";

const remotiveSourceId = "fa000000-0000-4000-8000-000000000001";
const otherSourceId = "fa000000-0000-4000-8000-000000000002";

function request(resource: string, values: Record<string, string>) {
  return new Request(
    `https://salarypadi.com/api/admin/${resource}/transition`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://salarypadi.com",
      },
      body: new URLSearchParams(values),
    },
  );
}

function context(resource: string) {
  return { params: Promise.resolve({ resource }) } as never;
}

function sourceTransitionRequest(id: string) {
  return request("sources", {
    id,
    action: "disable",
    reason: "Pause this source after policy review",
    expected_version: "3",
  });
}

beforeEach(() => {
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.revalidateTag.mockReset();
  mocks.rpc.mockReset();
  mocks.schema.mockReset();
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.getAdminApiContext.mockReset();
  mocks.getAdminApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: mocks.schema },
  });
});

describe("admin transition route", () => {
  it.each(["", "  ", "1.5", "-1", "2147483648"])(
    "rejects invalid optimistic-lock evidence %j before authentication",
    async (expectedVersion) => {
      const response = await POST(
        request("sources", {
          id: remotiveSourceId,
          action: "disable",
          reason: "Pause this source after policy review",
          expected_version: expectedVersion,
        }),
        context("sources"),
      );

      expect(response.status).toBe(400);
      expect(mocks.getAdminApiContext).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects import retry before authentication or an RPC call", async () => {
    const response = await POST(
      request("imports", {
        id: "fa000000-0000-4000-8000-000000000003",
        action: "retry",
        reason: "Retry the failed import",
        expected_version: "1",
      }),
      context("imports"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "That admin action is not available.",
    });
    expect(mocks.getAdminApiContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("invalidates the shared source cache after a successful Remotive transition", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_transition") return { data: true, error: null };
      if (name === "admin_list_sources") {
        return {
          data: [
            {
              id: remotiveSourceId,
              secondary:
                "remotive | https://github.com/remotive-com/remote-jobs-api",
            },
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const response = await POST(
      sourceTransitionRequest(remotiveSourceId),
      context("sources"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/admin/sources?updated=true",
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "admin_transition", {
      resource_name: "sources",
      action_name: "disable",
      target_id: remotiveSourceId,
      action_reason: "Pause this source after policy review",
      expected_version: 3,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "admin_list_sources");
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(REMOTIVE_CACHE_TAG, {
      expire: 0,
    });
  });

  it("does not invalidate the Remotive cache for another source", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_transition") return { data: true, error: null };
      if (name === "admin_list_sources") {
        return {
          data: [
            {
              id: otherSourceId,
              secondary: "greenhouse | https://example.test/terms",
            },
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const response = await POST(
      sourceTransitionRequest(otherSourceId),
      context("sources"),
    );

    expect(response.status).toBe(303);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("does not inspect or invalidate sources after a failed transition", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "stale version" },
    });

    const response = await POST(
      sourceTransitionRequest(remotiveSourceId),
      context("sources"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/admin/sources?updated=error",
    );
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: "true", error: null },
  ])(
    "does not report a malformed transition acknowledgement as success",
    async (acknowledgement) => {
      mocks.rpc.mockResolvedValueOnce(acknowledgement);

      const response = await POST(
        sourceTransitionRequest(remotiveSourceId),
        context("sources"),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "https://salarypadi.com/admin/sources?updated=error",
      );
      expect(mocks.rpc).toHaveBeenCalledOnce();
      expect(mocks.revalidateTag).not.toHaveBeenCalled();
    },
  );

  it("returns unavailable when an admin transition transport throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(
      sourceTransitionRequest(remotiveSourceId),
      context("sources"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("requires a valid moderation state acknowledgement", async () => {
    const moderationRequest = () =>
      request("moderation", {
        id: "fa000000-0000-4000-8000-000000000004",
        action: "claim",
        reason: "Assign this case for review",
        expected_version: "2",
      });
    mocks.rpc.mockResolvedValueOnce({ data: "in_review", error: null });

    const accepted = await POST(moderationRequest(), context("moderation"));
    expect(accepted.headers.get("location")).toBe(
      "https://salarypadi.com/admin/moderation?updated=true",
    );

    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    const rejected = await POST(moderationRequest(), context("moderation"));
    expect(rejected.headers.get("location")).toBe(
      "https://salarypadi.com/admin/moderation?updated=error",
    );
  });

  it("marks a completed source transition degraded when cache lookup throws", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockRejectedValueOnce(new Error("source lookup unavailable"));

    const response = await POST(
      sourceTransitionRequest(remotiveSourceId),
      context("sources"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/admin/sources?updated=degraded",
    );
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
