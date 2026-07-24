import type {
  FeedPersistResult,
  FeedRunStore,
  FeedSnapshot,
} from "../../../src/lib/jobs/feeds/runtime";

/**
 * Production persistence for employer feeds.
 *
 * This deliberately reuses the established ATS snapshot RPC contract rather
 * than creating a second canonical ingestion architecture:
 *
 *   worker_begin_ats_snapshot     -> opens an import run (idempotency gate)
 *   worker_store_ats_snapshot_batch -> bounded batch writes of canonical rows
 *   worker_finalize_ats_snapshot  -> complete/partial finalisation, which is
 *                                    what authorises absence closure, plus
 *                                    the quarantine count and error codes
 *
 * The RPCs already implement immutable raw/occurrence storage, idempotent
 * canonical upsert, absence handling gated on `p_complete`, and durable
 * per-snapshot rows that the admin source-health view reads. Generic feeds
 * therefore inherit the same lifecycle and reporting as ATS boards.
 *
 * The runtime decides completeness; this store never second-guesses it. It
 * passes `snapshot.complete` straight through, so a partial snapshot can
 * never close a job at the database layer either.
 */

export const FEED_BATCH_SIZE = 100;

export type FeedCallRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export interface SupabaseFeedRunStoreOptions {
  callRpc: FeedCallRpc;
  /**
   * Adapter key of the registered source row for this feed. Feeds are
   * registered exactly like ATS boards (source row + ats_source_configs row
   * with an employer_* provider), so the key is the source's adapter_key.
   */
  adapterKey: string;
}

/**
 * Builds a FeedRunStore backed by the ATS snapshot RPCs. Returns the
 * persistence counts the runtime reports as durable metrics.
 */
export function createSupabaseFeedRunStore(
  options: SupabaseFeedRunStoreOptions,
): FeedRunStore {
  return {
    async applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult> {
      const begun = asRecordArray(
        await options.callRpc("worker_begin_ats_snapshot", {
          p_adapter_key: options.adapterKey,
          p_checked_at: snapshot.runAt,
          // What the source presented, and what we expect to store.
          p_provider_count: snapshot.counts.sourceRecords,
          p_expected_record_count: snapshot.jobs.length,
        }),
      );
      const first = begun[0];
      const importRunId =
        typeof first?.import_run_id === "string" ? first.import_run_id : null;
      if (!importRunId || first?.should_run === false) {
        // A duplicate/again-too-soon run stores nothing and closes nothing.
        return { inserted: 0, updated: 0, unchanged: 0, closed: 0 };
      }

      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      try {
        for (const batch of chunk(snapshot.jobs, FEED_BATCH_SIZE)) {
          const stored = asRecordArray(
            await options.callRpc("worker_store_ats_snapshot_batch", {
              p_import_run_id: importRunId,
              p_records: batch,
            }),
          );
          for (const row of stored) {
            if (typeof row.inserted_count === "number") {
              inserted += row.inserted_count;
            }
            if (typeof row.updated_count === "number") {
              updated += row.updated_count;
            }
            if (typeof row.unchanged_count === "number") {
              unchanged += row.unchanged_count;
            }
          }
        }
      } catch (error) {
        // A write failure must finalise the snapshot as PARTIAL so absence
        // handling cannot run against a half-written batch.
        await options.callRpc("worker_finalize_ats_snapshot", {
          p_import_run_id: importRunId,
          p_complete: false,
          p_quarantined_count: snapshot.counts.quarantinedRecords,
          p_error_codes: ["feed_store_failed"],
        });
        throw error;
      }

      const finalized = await options.callRpc("worker_finalize_ats_snapshot", {
        p_import_run_id: importRunId,
        // The runtime's completeness decision is authoritative.
        p_complete: snapshot.complete,
        p_quarantined_count: snapshot.counts.quarantinedRecords,
        p_error_codes: snapshot.errorCodes,
      });
      const closedValue =
        finalized && typeof finalized === "object"
          ? (finalized as Record<string, unknown>).closed_count
          : undefined;

      return {
        inserted,
        updated,
        unchanged,
        closed: typeof closedValue === "number" ? closedValue : 0,
      };
    },
  };
}
