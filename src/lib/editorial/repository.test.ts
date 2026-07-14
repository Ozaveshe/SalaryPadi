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
    await expect(
      getPublishedArticleResult("missing-brief"),
    ).resolves.toMatchObject({ state: "unconfigured", data: null });
    await expect(
      getPublishedArticleResult(REMOTE_JOBS_GUIDE.slug),
    ).resolves.toMatchObject({
      state: "unconfigured",
      data: REMOTE_JOBS_GUIDE,
    });
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

  it("quarantines malformed editorial timestamps before they reach feeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              ...validBrief,
              published_at: "not-a-timestamp",
              updated_at: "2026-07-11 00:00:00",
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const result = await getPublishedEditorialResult();

    expect(result.state).toBe("degraded");
    expect(result.data).toEqual([REMOTE_JOBS_GUIDE]);
    expect(result.issues[0]?.code).toBe("editorial_invalid_rows");
  });

  it("quarantines contradictory publication chronology", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            ...validBrief,
            published_at: "2026-07-12T00:00:00.000Z",
            updated_at: "2026-07-11T00:00:00.000Z",
          },
        ]),
      ),
    );

    await expect(getPublishedEditorialResult()).resolves.toMatchObject({
      state: "degraded",
      data: [REMOTE_JOBS_GUIDE],
      issues: [{ code: "editorial_invalid_rows" }],
    });
  });

  it("rejects protocol-relative and duplicate internal links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            ...validBrief,
            internal_link_targets: [
              "//attacker.example/redirect",
              "/jobs/remote",
              "/jobs/remote",
            ],
          },
        ]),
      ),
    );

    await expect(getPublishedEditorialResult()).resolves.toMatchObject({
      state: "degraded",
      data: [REMOTE_JOBS_GUIDE],
      issues: [{ code: "editorial_invalid_rows" }],
    });
  });

  it("rejects duplicate editorial identities instead of choosing one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          validBrief,
          {
            ...validBrief,
            id: "10172db5-af35-4487-a657-470b68d5d1e0",
          },
        ]),
      ),
    );

    await expect(getPublishedEditorialResult()).resolves.toMatchObject({
      state: "degraded",
      data: [REMOTE_JOBS_GUIDE],
      issues: [{ code: "editorial_invalid_rows" }],
    });
  });

  it("returns validated articles and resolves a single brief", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify([validBrief]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPublishedEditorialResult();
    expect(result.state).toBe("ready");
    expect(result.data.map((article) => article.slug)).toContain(
      validBrief.slug,
    );
    expect((await getPublishedArticleResult(validBrief.slug)).data).toEqual(
      validBrief,
    );
    const lookupUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(lookupUrl.searchParams.get("slug")).toBe(`eq.${validBrief.slug}`);
    expect(lookupUrl.searchParams.get("limit")).toBe("1");
    await expect(getPublishedEditorial()).resolves.toHaveLength(2);
  });

  it("returns a ready null for a missing filtered article", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPublishedArticleResult("missing-brief");

    expect(result).toMatchObject({ state: "ready", data: null });
    const lookupUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(lookupUrl.pathname).toBe("/rest/v1/rpc/list_published_editorial");
    expect(lookupUrl.searchParams.get("slug")).toBe("eq.missing-brief");
    expect(lookupUrl.searchParams.get("limit")).toBe("1");
  });

  it("retains degraded state for a failed filtered article read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const result = await getPublishedArticleResult("missing-brief");

    expect(result).toMatchObject({ state: "degraded", data: null });
    expect(result.issues[0]?.code).toBe("editorial_http_503");
  });

  it("quarantines an invalid filtered article without loading the list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Promise.resolve(
          new Response(JSON.stringify([{ id: "not-a-uuid" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const result = await getPublishedArticleResult("invalid-brief");

    expect(result).toMatchObject({ state: "degraded", data: null });
    expect(result.issues[0]?.code).toBe("editorial_invalid_rows");
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
