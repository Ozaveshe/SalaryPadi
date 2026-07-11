import { afterEach, describe, expect, it, vi } from "vitest";

const blobStore = vi.hoisted(() => ({ get: vi.fn(), setJSON: vi.fn() }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => blobStore,
}));

import {
  AFROTOOLS_CATALOG_SOURCE_URL,
  BUNDLED_AFROTOOLS_CATALOG,
  catalogSnapshotSchema,
} from "../../../src/lib/afrotools/catalog";
import {
  createProtectedCatalogFixture,
  TEST_AFROTOOLS_ETAG,
} from "../../../src/lib/afrotools/catalog.fixture";
import { getStoredAfroToolsCatalog } from "../../../src/lib/afrotools/catalog-repository-runtime";
import handler, {
  runAfroToolsCatalogSync,
} from "../afrotools-catalog-sync.mjs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  blobStore.get.mockReset();
  blobStore.setJSON.mockReset();
});

describe("standalone AfroTools catalog worker", () => {
  it("loads and runs outside Next's server component module graph", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            AFROTOOLS_API_BASE_URL: "https://afrotools.com/api/v1",
            AFROTOOLS_API_KEY: "test-salarypadi-service-key-000000000000",
          })[name],
      },
    });
    blobStore.get.mockResolvedValue(null);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(createProtectedCatalogFixture(), {
        headers: {
          "Content-Type": "application/json",
          ETag: TEST_AFROTOOLS_ETAG,
          "X-AfroTools-Catalog-ETag": TEST_AFROTOOLS_ETAG,
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const result = await runAfroToolsCatalogSync({
      signal: new AbortController().signal,
      remainingMs: () => 20_000,
    });

    expect(result.status).toBe("succeeded");
    expect(result.summary.tool_count).toBe(
      BUNDLED_AFROTOOLS_CATALOG.tools.length,
    );
    expect(result.summary.source).toBe(AFROTOOLS_CATALOG_SOURCE_URL);
    expect(result.summary.source_http_status).toBe(200);
    expect(result.summary.etag_revalidated).toBe(false);
    expect(result.summary.etag_source).toBe("afrotools");
    expect(blobStore.setJSON).toHaveBeenCalledOnce();

    const stored = blobStore.setJSON.mock.calls[0]?.[1];
    expect(catalogSnapshotSchema.safeParse(stored).success).toBe(true);
    expect(stored).toMatchObject({
      sourceUrl: AFROTOOLS_CATALOG_SOURCE_URL,
      etag: TEST_AFROTOOLS_ETAG,
      etagSource: "afrotools",
    });
    blobStore.get.mockImplementation(async () => stored);
    blobStore.setJSON.mockClear();
    await expect(getStoredAfroToolsCatalog()).resolves.toMatchObject({
      sourceUrl: AFROTOOLS_CATALOG_SOURCE_URL,
      etag: TEST_AFROTOOLS_ETAG,
      etagSource: "afrotools",
    });
    fetcher.mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: {
          ETag: TEST_AFROTOOLS_ETAG,
          "X-AfroTools-Catalog-ETag": TEST_AFROTOOLS_ETAG,
        },
      }),
    );
    const revalidated = await runAfroToolsCatalogSync({
      signal: new AbortController().signal,
      remainingMs: () => 20_000,
    });

    expect(revalidated.summary.source_http_status).toBe(304);
    expect(revalidated.summary.etag_revalidated).toBe(true);
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("if-none-match"),
    ).toBe(TEST_AFROTOOLS_ETAG);
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get(
        "x-afrotools-if-none-match",
      ),
    ).toBe(TEST_AFROTOOLS_ETAG);
    expect(blobStore.setJSON).toHaveBeenCalledOnce();
  });

  it("serializes the exported Netlify handler response", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            AFROTOOLS_API_BASE_URL: "https://afrotools.com/api/v1",
            AFROTOOLS_API_KEY: "test-salarypadi-service-key-000000000000",
            NEXT_PUBLIC_SUPABASE_URL:
              "https://bxelrhklsznmpksgrqep.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
          })[name],
      },
    });
    blobStore.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/rest/v1/rpc/worker_start")) {
          return Response.json([{ run_id: "run-1", should_run: true }]);
        }
        if (url.endsWith("/rest/v1/rpc/worker_finish")) {
          return Response.json(true);
        }
        return Response.json(createProtectedCatalogFixture(), {
          headers: {
            "Content-Type": "application/json",
            ETag: TEST_AFROTOOLS_ETAG,
            "X-AfroTools-Catalog-ETag": TEST_AFROTOOLS_ETAG,
          },
        });
      }),
    );

    const response = await handler(
      new Request(
        "https://salarypadi.com/.netlify/functions/afrotools-catalog-sync",
        { method: "POST", body: "{}" },
      ),
      { deploy: { id: "deploy-1" } } as Parameters<typeof handler>[1],
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(blobStore.setJSON).toHaveBeenCalledOnce();
  });
});
