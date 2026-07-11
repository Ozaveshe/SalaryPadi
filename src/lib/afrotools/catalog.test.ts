import { describe, expect, it, vi } from "vitest";

import {
  AFROTOOLS_CATALOG_SOURCE_URL,
  BUNDLED_AFROTOOLS_CATALOG,
  evaluateCatalogSnapshot,
  fetchAfroToolsCatalog,
  selectCareerTools,
} from "@/lib/afrotools/catalog";
import {
  createProtectedCatalogFixture,
  TEST_AFROTOOLS_ETAG,
} from "@/lib/afrotools/catalog.fixture";

describe("AfroTools catalog contract", () => {
  it("selects only live English career-relevant tools", () => {
    const selected = selectCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    expect(selected).toHaveLength(15);
    expect(selected.every((tool) => tool.status === "Live")).toBe(true);
  });

  it("refuses an incomplete catalog", () => {
    expect(() =>
      selectCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools.slice(0, 5)),
    ).toThrow("unexpectedly incomplete");
  });

  it("grades fresh, stale and expired snapshots", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const fresh = {
      ...BUNDLED_AFROTOOLS_CATALOG,
      checkedAt: "2026-07-19T00:00:00.000Z",
    };
    const stale = {
      ...BUNDLED_AFROTOOLS_CATALOG,
      checkedAt: "2026-07-11T00:00:00.000Z",
    };
    const expired = {
      ...BUNDLED_AFROTOOLS_CATALOG,
      checkedAt: "2026-06-01T00:00:00.000Z",
    };
    expect(evaluateCatalogSnapshot(fresh, now).state).toBe("live");
    expect(evaluateCatalogSnapshot(stale, now).state).toBe("stale");
    expect(evaluateCatalogSnapshot(expired, now).state).toBe("unavailable");
  });

  it("validates the fetched content type and contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(createProtectedCatalogFixture()), {
        headers: {
          "Content-Type": "application/json",
          ETag: TEST_AFROTOOLS_ETAG,
        },
      }),
    );
    const result = await fetchAfroToolsCatalog(
      "https://afrotools.com/api/v1",
      "test-salarypadi-service-key",
      fetcher,
    );
    expect(result.snapshot.tools).toHaveLength(15);
    expect(result.snapshot.sourceUrl).toBe(AFROTOOLS_CATALOG_SOURCE_URL);
    expect(result.snapshot.etag).toBe(TEST_AFROTOOLS_ETAG);
    expect(result.httpStatus).toBe(200);
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      AFROTOOLS_CATALOG_SOURCE_URL,
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-api-key")).toBe("test-salarypadi-service-key");
    expect(headers.get("if-none-match")).toBeNull();
  });

  it("persists and reuses a production-shaped base64url ETag", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(createProtectedCatalogFixture()), {
          headers: {
            "Content-Type": "application/json",
            ETag: TEST_AFROTOOLS_ETAG,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { ETag: TEST_AFROTOOLS_ETAG },
        }),
      );
    const first = await fetchAfroToolsCatalog(
      "https://afrotools.com/api/v1",
      "test-salarypadi-service-key",
      fetcher,
    );
    const second = await fetchAfroToolsCatalog(
      "https://afrotools.com/api/v1",
      "test-salarypadi-service-key",
      fetcher,
      undefined,
      first.snapshot,
    );

    expect(second.httpStatus).toBe(304);
    expect(second.notModified).toBe(true);
    expect(second.snapshot.etag).toBe(TEST_AFROTOOLS_ETAG);
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("if-none-match"),
    ).toBe(TEST_AFROTOOLS_ETAG);
  });

  it.each([
    '"sha256-deadbeef"',
    `W/${TEST_AFROTOOLS_ETAG}`,
    `"sha256-${"A".repeat(42)}"`,
    `"sha256-${"A".repeat(44)}"`,
    `"sha256-${"A".repeat(42)}="`,
  ])("rejects a malformed catalog ETag: %s", async (etag) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(createProtectedCatalogFixture()), {
        headers: { "Content-Type": "application/json", ETag: etag },
      }),
    );

    await expect(
      fetchAfroToolsCatalog(
        "https://afrotools.com/api/v1",
        "test-salarypadi-service-key",
        fetcher,
      ),
    ).rejects.toThrow("omitted its versioned ETag");
  });

  it("rejects a link that falsely claims an API integration", async () => {
    const catalog = createProtectedCatalogFixture();
    const linkIndex = catalog.tools.findIndex(
      (tool) => tool.integrationMode === "link",
    );
    const link = catalog.tools[linkIndex]!;
    catalog.tools[linkIndex] = {
      ...link,
      api: { method: "GET", path: "/api/v1/fabricated" },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(catalog), {
        headers: {
          "Content-Type": "application/json",
          ETag: TEST_AFROTOOLS_ETAG,
        },
      }),
    );

    await expect(
      fetchAfroToolsCatalog(
        "https://afrotools.com/api/v1",
        "test-salarypadi-service-key",
        fetcher,
      ),
    ).rejects.toThrow("catalog contract changed");
  });
});
