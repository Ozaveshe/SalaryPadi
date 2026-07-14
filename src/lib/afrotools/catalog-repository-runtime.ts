import { getStore } from "@netlify/blobs";

import {
  BUNDLED_AFROTOOLS_CATALOG,
  catalogSnapshotSchema,
  evaluateCatalogSnapshot,
  type AfroToolsCatalogSnapshot,
  type CatalogAvailability,
} from "@/lib/afrotools/catalog";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";

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

export async function getStoredAfroToolsCatalogResult(): Promise<
  RepositoryResult<AfroToolsCatalogSnapshot | null>
> {
  let stored: unknown;
  try {
    stored = await catalogStore().get(AFROTOOLS_CATALOG_KEY, {
      type: "json",
    });
  } catch (reason) {
    return repositoryFailure(
      "unavailable",
      null,
      repositoryIssue(
        "afrotools.catalog_store",
        "query_failed",
        "afrotools_catalog_store_unavailable",
        reason,
      ),
    );
  }
  if (stored === null) return repositoryReady(null);
  const parsed = catalogSnapshotSchema.safeParse(stored);
  return parsed.success
    ? repositoryReady(parsed.data)
    : repositoryFailure(
        "invalid",
        null,
        repositoryIssue(
          "afrotools.catalog_store",
          "invalid_rows",
          "afrotools_catalog_store_invalid",
          parsed.error,
        ),
      );
}

/** Compatibility read for the standalone sync worker's conditional request. */
export async function getStoredAfroToolsCatalog() {
  return (await getStoredAfroToolsCatalogResult()).data;
}

export type CareerCatalogResult = Omit<CatalogAvailability, "state"> & {
  state: CatalogAvailability["state"] | "degraded";
  cache: "remote_lkg" | "bundled_lkg" | "none";
  remoteState: "ready" | "missing" | "unavailable" | "invalid" | "expired";
};

export async function getCareerToolCatalog(
  now = new Date(),
): Promise<CareerCatalogResult> {
  const storedResult = await getStoredAfroToolsCatalogResult();
  const stored = storedResult.data;
  if (stored) {
    const evaluated = evaluateCatalogSnapshot(stored, now);
    if (evaluated.snapshot) {
      return {
        ...evaluated,
        cache: "remote_lkg",
        remoteState: "ready",
      };
    }
  }
  const remoteState = stored
    ? "expired"
    : storedResult.state === "ready"
      ? "missing"
      : storedResult.state === "invalid"
        ? "invalid"
        : "unavailable";
  const bundled = evaluateCatalogSnapshot(BUNDLED_AFROTOOLS_CATALOG, now);
  return bundled.snapshot
    ? {
        ...bundled,
        state: "degraded",
        cache: "bundled_lkg",
        remoteState,
      }
    : {
        snapshot: null,
        state: "unavailable",
        ageMs: bundled.ageMs,
        cache: "none",
        remoteState,
      };
}
