import { describe, expect, it, vi } from "vitest";

import {
  BUNDLED_AFROTOOLS_CATALOG,
  evaluateCatalogSnapshot,
  fetchAfroToolsCatalog,
  selectCareerTools,
} from "@/lib/afrotools/catalog";

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
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(BUNDLED_AFROTOOLS_CATALOG.tools), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchAfroToolsCatalog(
      "https://afrotools.com/api/v1",
      fetcher,
    );
    expect(result.tools).toHaveLength(15);
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      "https://afrotools.com/data/tool-directory.json",
    );
  });
});
