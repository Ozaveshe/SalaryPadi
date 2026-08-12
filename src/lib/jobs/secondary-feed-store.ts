import { getStore } from "@netlify/blobs";

import {
  alertCatalogSchema,
  createAlertCatalog,
  type AlertCatalog,
} from "@/lib/jobs/alert-catalog";
import type { Job } from "@/lib/jobs/types";

/**
 * Worker-written snapshots for the secondary public feeds. A scheduled worker
 * fetches each provider within its reviewed polling budget and persists the
 * redacted alert-catalog projection here; request-time rendering reads the
 * snapshot instead of calling the provider. The projection already strips
 * descriptions, requirements and benefits, which is exactly what the Jobicy,
 * Himalayas and ReliefWeb storage policies require.
 */
export const SECONDARY_FEED_STORE = "salarypadi-secondary-feed-catalog";

export type SecondaryFeedKey = "jobicy" | "himalayas" | "reliefweb";

export type SecondaryFeedSnapshotResult =
  | { state: "ready"; catalog: AlertCatalog }
  | { state: "missing" }
  | { state: "invalid" }
  | { state: "unavailable" };

function feedStore() {
  return getStore({ name: SECONDARY_FEED_STORE, consistency: "strong" });
}

/**
 * Reads are served from the edge cache rather than the origin store.
 *
 * A strong read resolves against `uncachedEdgeURL`, which bypasses the edge
 * cache entirely — so every page render that assembled the feed paid two
 * origin round trips for snapshots a scheduled worker only rewrites every few
 * hours. Strong consistency buys nothing here: the caller already validates
 * the snapshot's own `checkedAt` against the source's reviewed refresh
 * interval and falls back to a live fetch when it is too old, which is exactly
 * how a marginally stale read is meant to be handled.
 */
const SNAPSHOT_READ_CONSISTENCY = "eventual" as const;

export async function storeSecondaryFeedSnapshot(
  source: SecondaryFeedKey,
  jobs: Job[],
  checkedAt: string,
): Promise<number> {
  const catalog = createAlertCatalog(jobs, checkedAt);
  await feedStore().setJSON(source, catalog);
  return catalog.jobs.length;
}

export async function readSecondaryFeedSnapshot(
  source: SecondaryFeedKey,
): Promise<SecondaryFeedSnapshotResult> {
  let stored: unknown;
  try {
    stored = await feedStore().get(source, {
      type: "json",
      consistency: SNAPSHOT_READ_CONSISTENCY,
    });
  } catch {
    return { state: "unavailable" };
  }
  if (stored === null || stored === undefined) return { state: "missing" };
  const parsed = alertCatalogSchema.safeParse(stored);
  if (!parsed.success) return { state: "invalid" };
  return { state: "ready", catalog: parsed.data };
}
