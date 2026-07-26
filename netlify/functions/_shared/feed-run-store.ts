import { z } from "zod";

import {
  buildAcceptedEvidence,
  buildExcludedEvidence,
  toEvidenceRow,
  type BuildEvidenceOptions,
  type FeedEvidenceRecord,
} from "../../../src/lib/jobs/feeds/evidence";
import type {
  FeedPersistResult,
  FeedRunStore,
  FeedSnapshot,
} from "../../../src/lib/jobs/feeds/runtime";
import type { EmployerFeedConfig } from "../../../src/lib/jobs/feeds/types";
import { OperationalError } from "./runtime";

/**
 * The production FeedRunStore.
 *
 * Generic feeds persist through the SAME snapshot lifecycle as employer ATS
 * boards — begin, bounded batches, finalize — so they inherit its idempotency,
 * acknowledgement checks, absence handling and audit trail rather than getting
 * a second ingestion system with its own bugs.
 *
 * The one rule this store exists to honour: a partial snapshot must never
 * close a job. `snapshot.complete` arrives already decided by
 * computeFeedSnapshotCompleteness and is forwarded verbatim to
 * worker_finalize_ats_snapshot, which owns absence handling.
 */

const MAX_BATCH_RECORDS = 100;

const beginResultSchema = z
  .array(
    z
      .object({ import_run_id: z.string().uuid(), should_run: z.boolean() })
      .strict(),
  )
  .length(1);

const storeBatchResultSchema = z
  .array(
    z
      .object({
        accepted_count: z.number().int().nonnegative(),
        rejected_count: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .length(1);

const finalizeResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum(["complete", "quarantined", "partial", "failed"]),
        created_count: z.number().int().nonnegative(),
        updated_count: z.number().int().nonnegative(),
        unchanged_count: z.number().int().nonnegative(),
        expired_count: z.number().int().nonnegative(),
        filtered_count: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .length(1);

const evidenceResultSchema = z.number().int().nonnegative();
const metricsResultSchema = z.boolean();

export type StoreRpc = <T>(
  functionName: string,
  resultSchema: z.ZodType<T>,
  parameters?: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<T>;

export interface FeedRunPersistence extends FeedPersistResult {
  unchanged: number;
  filtered: number;
  importRunId: string | null;
  outcome: "complete" | "quarantined" | "partial" | "failed" | "duplicate";
}

export interface SupabaseFeedRunStoreOptions {
  rpc: StoreRpc;
  config: EmployerFeedConfig;
  /** From the live source policy, not from the caller's preference. */
  mayStoreFullDescription: boolean;
  signal?: AbortSignal;
  /** Counts of records excluded before normalization, for evidence. */
  excluded?: {
    requiredFieldMissing?: number;
    malformedRecordUrl?: number;
    destinationNotAuthorized?: number;
    recordLimitExceeded?: number;
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Supabase-backed persistence for one feed run.
 *
 * `applySnapshot` is called exactly once per run by runEmployerFeed. A partial
 * snapshot with no jobs (fetch failure, malformed payload, oversize payload)
 * still opens and finalizes a snapshot, so the attempt leaves a durable
 * terminal record instead of disappearing.
 */
export class SupabaseFeedRunStore implements FeedRunStore {
  private readonly options: SupabaseFeedRunStoreOptions;
  /** Populated by applySnapshot so the caller can record durable metrics. */
  public lastResult: FeedRunPersistence | null = null;

  constructor(options: SupabaseFeedRunStoreOptions) {
    this.options = options;
  }

  async applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult> {
    const { rpc, config, signal } = this.options;
    const evidenceOptions: BuildEvidenceOptions = {
      config,
      runAt: snapshot.runAt,
      importRunId: null,
      mayStoreFullDescription: this.options.mayStoreFullDescription,
    };

    const begun = await rpc(
      "worker_begin_ats_snapshot",
      beginResultSchema,
      {
        p_adapter_key: config.feedKey,
        p_checked_at: snapshot.runAt,
        // The provider count is what the SOURCE held, which is what makes a
        // truncated or clipped feed visible at the database boundary too.
        p_provider_count: snapshot.seenExternalIds.length,
        p_expected_record_count: snapshot.jobs.length,
      },
      { signal },
    );
    const run = begun[0]!;
    if (!run.should_run) {
      // A duplicate run for the same checked-at: not an error, and it must not
      // be reported as if fresh work happened.
      this.lastResult = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        filtered: 0,
        closed: 0,
        importRunId: run.import_run_id,
        outcome: "duplicate",
      };
      return { inserted: 0, updated: 0, closed: 0 };
    }
    evidenceOptions.importRunId = run.import_run_id;

    try {
      // Evidence first: it describes what arrived, so it must survive even if
      // canonical storage then fails.
      await this.storeEvidence(snapshot, evidenceOptions);

      for (const batch of chunk(snapshot.jobs, MAX_BATCH_RECORDS)) {
        const stored = await rpc(
          "worker_store_ats_snapshot_batch",
          storeBatchResultSchema,
          { p_import_run_id: run.import_run_id, p_records: batch },
          { signal },
        );
        const acknowledgement = stored[0]!;
        if (
          acknowledgement.accepted_count + acknowledgement.rejected_count !==
          batch.length
        ) {
          throw new OperationalError("feed_batch_not_acknowledged", {
            expected: batch.length,
            accepted: acknowledgement.accepted_count,
            rejected: acknowledgement.rejected_count,
          });
        }
      }

      const finalized = await rpc(
        "worker_finalize_ats_snapshot",
        finalizeResultSchema,
        {
          p_import_run_id: run.import_run_id,
          // Forwarded verbatim. This single boolean is what authorises the
          // database to close absent jobs.
          p_complete: snapshot.complete,
          p_quarantined_count: 0,
          p_error_codes: snapshot.incompletenessReasons.slice(0, 20),
        },
        { signal },
      );
      const outcome = finalized[0]!;

      // A partial snapshot that reported any closure would mean absence
      // handling ran when it must not have.
      if (!snapshot.complete && outcome.expired_count > 0) {
        throw new OperationalError("feed_partial_snapshot_closed_jobs", {
          expired: outcome.expired_count,
        });
      }

      this.lastResult = {
        inserted: outcome.created_count,
        updated: outcome.updated_count,
        unchanged: outcome.unchanged_count,
        filtered: outcome.filtered_count,
        closed: outcome.expired_count,
        importRunId: run.import_run_id,
        outcome: outcome.outcome,
      };
      return {
        inserted: outcome.created_count,
        updated: outcome.updated_count,
        closed: outcome.expired_count,
      };
    } catch (reason) {
      // Any failure after the snapshot opened must leave a terminal failed
      // record, never a snapshot stuck open.
      await rpc(
        "worker_finalize_ats_snapshot",
        finalizeResultSchema,
        {
          p_import_run_id: run.import_run_id,
          p_complete: false,
          p_quarantined_count: 0,
          p_error_codes: [
            reason instanceof OperationalError
              ? reason.code
              : "feed_run_failed",
          ],
        },
        {},
      ).catch(() => undefined);
      this.lastResult = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        filtered: 0,
        closed: 0,
        importRunId: run.import_run_id,
        outcome: "failed",
      };
      throw reason;
    }
  }

  private async storeEvidence(
    snapshot: FeedSnapshot,
    evidenceOptions: BuildEvidenceOptions,
  ): Promise<void> {
    const excluded = this.options.excluded ?? {};
    const records: FeedEvidenceRecord[] = [
      ...snapshot.jobs.map((job) =>
        buildAcceptedEvidence(
          {
            provider: "employer_xml_feed",
            sourceKey: snapshot.feedKey,
            employerName: this.options.config.employerName,
            externalId: job.external_id,
            title: job.title,
            location: null,
            workplaceType: null,
            employmentType: null,
            department: null,
            team: null,
            descriptionHtml: null,
            descriptionText: job.description_text,
            publishedAt: job.posted_at,
            updatedAt: null,
            sourceUrl: job.source_url,
            applicationUrl: job.application_url,
            checkedAt: job.last_checked_at,
          },
          evidenceOptions,
        ),
      ),
      ...buildExcludedEvidence(
        "required_field_missing",
        excluded.requiredFieldMissing ?? 0,
        evidenceOptions,
      ),
      ...buildExcludedEvidence(
        "malformed_record_url",
        excluded.malformedRecordUrl ?? 0,
        evidenceOptions,
      ),
      ...buildExcludedEvidence(
        "destination_not_authorized",
        excluded.destinationNotAuthorized ?? 0,
        evidenceOptions,
      ),
      ...buildExcludedEvidence(
        "record_limit_exceeded",
        excluded.recordLimitExceeded ?? 0,
        evidenceOptions,
      ),
    ];
    if (records.length === 0) return;

    for (const batch of chunk(records, MAX_BATCH_RECORDS)) {
      await this.options.rpc(
        "worker_store_feed_evidence",
        evidenceResultSchema,
        {
          p_feed_key: snapshot.feedKey,
          p_records: batch.map(toEvidenceRow),
        },
        { signal: this.options.signal },
      );
    }
  }
}

/** Durable terminal metrics for one run attempt, including attempts that
 * never opened a snapshot. */
export async function recordFeedRunMetrics(
  rpc: StoreRpc,
  metrics: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<void> {
  await rpc(
    "worker_record_feed_run_metrics",
    metricsResultSchema,
    { p_metrics: metrics },
    { signal },
  );
}
