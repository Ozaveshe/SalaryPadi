import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ environment: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getServerEnvironment: mocks.environment }));

import { claimRemotiveFetchBudget } from "./source-fetch-budget";

beforeEach(() => {
  mocks.environment.mockReturnValue({
    NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    NODE_ENV: "production",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("provider fetch budget client", () => {
  it.each([true, false])("validates a %s budget result", async (allowed) => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(allowed));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      claimRemotiveFetchBudget("fb000000-0000-4000-8000-000000000001"),
    ).resolves.toBe(allowed);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://bxelrhklsznmpksgrqep.supabase.co/rest/v1/rpc/worker_claim_remotive_fetch",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      p_request_key: "fb000000-0000-4000-8000-000000000001",
      p_purpose: "next_data_cache_fill",
    });
  });

  it("rejects an invalid response without treating it as budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ allowed: true })),
    );

    await expect(
      claimRemotiveFetchBudget("fb000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ code: "source_fetch_claim_shape" });
  });
});
