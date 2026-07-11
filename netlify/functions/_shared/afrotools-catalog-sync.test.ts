import { afterEach, describe, expect, it, vi } from "vitest";

const blobStore = vi.hoisted(() => ({ setJSON: vi.fn() }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => blobStore,
}));

import { BUNDLED_AFROTOOLS_CATALOG } from "../../../src/lib/afrotools/catalog";
import { runAfroToolsCatalogSync } from "../afrotools-catalog-sync";

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
});
