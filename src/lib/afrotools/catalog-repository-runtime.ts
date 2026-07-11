import { getStore } from "@netlify/blobs";

import {
  BUNDLED_AFROTOOLS_CATALOG,
  catalogSnapshotSchema,
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

export async function getStoredAfroToolsCatalog() {
  let stored: unknown;
  try {
    stored = await catalogStore().get(AFROTOOLS_CATALOG_KEY, {
      type: "json",
    });
  } catch {
    // A missing Blob is a cold start, not permission to trust an invalid cache.
    return null;
  }
  const parsed = catalogSnapshotSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export type CareerCatalogResult = CatalogAvailability & {
  cache: "remote_lkg" | "bundled_lkg" | "none";
};

export async function getCareerToolCatalog(
  now = new Date(),
): Promise<CareerCatalogResult> {
  const stored = await getStoredAfroToolsCatalog();
  if (stored) {
    const evaluated = evaluateCatalogSnapshot(stored, now);
    if (evaluated.snapshot) return { ...evaluated, cache: "remote_lkg" };
  }
  const bundled = evaluateCatalogSnapshot(BUNDLED_AFROTOOLS_CATALOG, now);
  return bundled.snapshot
    ? { ...bundled, cache: "bundled_lkg" }
    : { snapshot: null, state: "unavailable", ageMs: null, cache: "none" };
}
