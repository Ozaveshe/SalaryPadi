import { beforeEach, describe, expect, it, vi } from "vitest";

const blobStore = vi.hoisted(() => ({ get: vi.fn(), setJSON: vi.fn() }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => blobStore,
}));

import { BUNDLED_AFROTOOLS_CATALOG } from "./catalog";
import {
  getCareerToolCatalog,
  getStoredAfroToolsCatalog,
  getStoredAfroToolsCatalogResult,
} from "./catalog-repository-runtime";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("AfroTools catalog repository", () => {
  it("returns a valid remote last-known-good catalog as live", async () => {
    blobStore.get.mockResolvedValue(BUNDLED_AFROTOOLS_CATALOG);

    await expect(
      getCareerToolCatalog(new Date("2026-07-14T00:00:00.000Z")),
    ).resolves.toMatchObject({
      state: "live",
      cache: "remote_lkg",
      remoteState: "ready",
      snapshot: BUNDLED_AFROTOOLS_CATALOG,
    });
  });

  it("labels a cold-start bundled fallback as degraded instead of live", async () => {
    blobStore.get.mockResolvedValue(null);

    await expect(
      getCareerToolCatalog(new Date("2026-07-14T00:00:00.000Z")),
    ).resolves.toMatchObject({
      state: "degraded",
      cache: "bundled_lkg",
      remoteState: "missing",
      snapshot: BUNDLED_AFROTOOLS_CATALOG,
    });
  });

  it("preserves an unavailable remote store while using the bundled fallback", async () => {
    blobStore.get.mockRejectedValue(new Error("blob store unavailable"));

    await expect(getStoredAfroToolsCatalogResult()).resolves.toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "afrotools_catalog_store_unavailable" }],
    });
    await expect(getStoredAfroToolsCatalog()).resolves.toBeNull();
    await expect(
      getCareerToolCatalog(new Date("2026-07-14T00:00:00.000Z")),
    ).resolves.toMatchObject({
      state: "degraded",
      cache: "bundled_lkg",
      remoteState: "unavailable",
    });
  });

  it("rejects an invalid stored snapshot and identifies the fallback reason", async () => {
    blobStore.get.mockResolvedValue({ checkedAt: "not a catalog" });

    await expect(getStoredAfroToolsCatalogResult()).resolves.toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ code: "afrotools_catalog_store_invalid" }],
    });
    await expect(
      getCareerToolCatalog(new Date("2026-07-14T00:00:00.000Z")),
    ).resolves.toMatchObject({
      state: "degraded",
      cache: "bundled_lkg",
      remoteState: "invalid",
    });
  });

  it("falls back when a valid remote snapshot is too old to serve", async () => {
    blobStore.get.mockResolvedValue({
      ...BUNDLED_AFROTOOLS_CATALOG,
      checkedAt: "2026-06-01T00:00:00.000Z",
    });

    await expect(
      getCareerToolCatalog(new Date("2026-07-14T00:00:00.000Z")),
    ).resolves.toMatchObject({
      state: "degraded",
      cache: "bundled_lkg",
      remoteState: "expired",
      snapshot: BUNDLED_AFROTOOLS_CATALOG,
    });
  });
});
