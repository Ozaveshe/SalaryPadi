import "server-only";

import { getStore } from "@netlify/blobs";

import {
  BUNDLED_AFROTOOLS_CATALOG,
  evaluateCatalogSnapshot,
  type AfroToolsCatalogSnapshot,
  type CatalogAvailability,
} from "@/lib/afrotools/catalog";

export const AFROTOOLS_CATALOG_STORE = "salarypadi-afrotools-catalog";
export const AFROTOOLS_CATALOG_KEY = "current";

function catalogStore() {
  return getStore({ name: AFROTOOLS_CATALOG_STORE, consistency: "strong" });
}

export async function storeAfroToolsCatalog(
  snapshot: AfroToolsCatalogSnapshot,
) {
  await catalogStore().setJSON(AFROTOOLS_CATALOG_KEY, snapshot);
  return snapshot.tools.length;
}

export type CareerCatalogResult = CatalogAvailability & {
  cache: "remote_lkg" | "bundled_lkg" | "none";
};

export async function getCareerToolCatalog(
  now = new Date(),
): Promise<CareerCatalogResult> {
  try {
    const stored = await catalogStore().get(AFROTOOLS_CATALOG_KEY, {
      type: "json",
    });
    const evaluated = evaluateCatalogSnapshot(stored, now);
    if (evaluated.snapshot) return { ...evaluated, cache: "remote_lkg" };
  } catch {
    // Local development and deploy previews may not have a linked Blob store.
  }
  const bundled = evaluateCatalogSnapshot(BUNDLED_AFROTOOLS_CATALOG, now);
  return bundled.snapshot
    ? { ...bundled, cache: "bundled_lkg" }
    : { snapshot: null, state: "unavailable", ageMs: null, cache: "none" };
}
