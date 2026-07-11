import { afterEach, describe, expect, it, vi } from "vitest";

const blobStore = vi.hoisted(() => ({ setJSON: vi.fn() }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => blobStore,
}));

import { BUNDLED_AFROTOOLS_CATALOG } from "../../../src/lib/afrotools/catalog";
import handler, {
  runAfroToolsCatalogSync,
} from "../afrotools-catalog-sync.mjs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  blobStore.setJSON.mockReset();
});

describe("standalone AfroTools catalog worker", () => {
  it("loads and runs outside Next's server component module graph", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          name === "AFROTOOLS_API_BASE_URL"
            ? "https://afrotools.com/api/v1"
            : undefined,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(BUNDLED_AFROTOOLS_CATALOG.tools, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await runAfroToolsCatalogSync({
      signal: new AbortController().signal,
      remainingMs: () => 20_000,
    });

    expect(result.status).toBe("succeeded");
    expect(result.summary.tool_count).toBe(
      BUNDLED_AFROTOOLS_CATALOG.tools.length,
    );
    expect(blobStore.setJSON).toHaveBeenCalledOnce();
  });

  it("serializes the exported Netlify handler response", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            AFROTOOLS_API_BASE_URL: "https://afrotools.com/api/v1",
            NEXT_PUBLIC_SUPABASE_URL:
              "https://bxelrhklsznmpksgrqep.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
          })[name],
      },
    });
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
        return Response.json(BUNDLED_AFROTOOLS_CATALOG.tools, {
          headers: { "Content-Type": "application/json" },
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
