import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfig: vi.fn() }));

import {
  getPublishedArticleResult,
  getPublishedEditorial,
  getPublishedEditorialResult,
  REMOTE_JOBS_GUIDE,
} from "@/lib/editorial/repository";
import { getSupabasePublicConfig } from "@/lib/env";

const mockedConfig = vi.mocked(getSupabasePublicConfig);
const validBrief = {
  id: "ef3aa500-5097-40e8-bfe9-31c0df38a6cf",
  slug: "remote-jobs-snapshot",
  title: "Remote jobs snapshot",
  description: "A verified snapshot.",
  article_kind: "data_brief" as const,
  body_markdown: "Verified body.",
  author_name: "SalaryPadi Editorial",
  published_at: "2026-07-11T00:00:00.000Z",
  updated_at: "2026-07-11T00:00:00.000Z",
  internal_link_targets: ["/jobs/remote"],
};

describe("editorial repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedConfig.mockReturnValue({
      url: "https://bxelrhklsznmpksgrqep.supabase.co",
      publishableKey: "test-key",
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("marks the built-in guide as an unconfigured fallback", async () => {
    mockedConfig.mockReturnValue(null);
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("unconfigured");
    expect(result.data).toEqual([REMOTE_JOBS_GUIDE]);
  });

  it("does not relabel a failed upstream read as a valid empty feed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("degraded");
    expect(result.data).toEqual([REMOTE_JOBS_GUIDE]);
    expect(result.issues[0]?.code).toBe("editorial_request_failed");
  });

  it("quarantines an invalid response and retains only the built-in guide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "not-a-uuid" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("degraded");
    expect(result.issues[0]?.code).toBe("editorial_invalid_rows");
  });

  it("returns validated articles and resolves a single brief", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Promise.resolve(
          new Response(JSON.stringify([validBrief]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("ready");
    expect(result.data.map((article) => article.slug)).toContain(
      validBrief.slug,
    );
    expect((await getPublishedArticleResult(validBrief.slug)).data).toEqual(
      validBrief,
    );
    await expect(getPublishedEditorial()).resolves.toHaveLength(2);
  });

  it("records non-success HTTP responses as degraded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("degraded");
    expect(result.issues[0]?.code).toBe("editorial_http_503");
  });
});
