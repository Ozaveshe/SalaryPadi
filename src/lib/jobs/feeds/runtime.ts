import {
  normalizeAtsImportRecords,
  type AtsImportJob,
} from "@/lib/jobs/ats-import";

import registryConfig from "../../../../config/employer-feed-registry.json";
import { extractEmployerFeedRecords, parseEmployerFeedRegistry } from "./index";
import {
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  type EmployerFeedConfig,
} from "./types";

/**
 * The employer-feed runtime: the end-to-end path from an authorized registry
 * record to persisted canonical jobs and durable metrics. It owns the order
 * of the gates and the absence semantics; persistence is injected so the full
 * lifecycle is provable without a live database and the same runtime binds to
 * the real store in production.
 *
 * Order (fail-closed at each step):
 *   eligibility (enabled + policy runnable + authorization current)
 *   → bounded retrieval / authenticated upload
 *   → immutable raw snapshot
 *   → extraction (destination-pinned)
 *   → normalizeAtsImportRecords
 *   → persistence
 *   → absence handling (complete snapshots only)
 *   → metrics
 */

/**
 * Runtime registry loader: parses the committed feed registry and returns the
 * feeds that are eligible to run at `now`. An empty result (the current
 * state — no employer has authorized a feed) means the dispatcher does
 * nothing, which is correct.
 */
export function loadRunnableEmployerFeeds(now: Date): EmployerFeedConfig[] {
  return parseEmployerFeedRegistry(registryConfig).feeds.filter(
    (feed) => feedRunEligibility(feed, now).runnable,
  );
}

export type FeedRunReason =
  | "disabled"
  | "authorization_incomplete"
  | "authorization_expired"
  | "review_overdue"
  | "no_payload";

export interface FeedRunEligibility {
  runnable: boolean;
  reason?: FeedRunReason;
}

/**
 * Whether the feed may run at `now`. A disabled feed, incomplete
 * authorization, expired authorization or overdue review all keep it from
 * making any request.
 */
export function feedRunEligibility(
  config: EmployerFeedConfig,
  now: Date,
): FeedRunEligibility {
  if (!config.enabled) return { runnable: false, reason: "disabled" };
  if (
    !config.rightsBasis ||
    !config.rightsEvidenceRef ||
    !config.authorizedAt ||
    !config.reviewedAt ||
    !config.reviewDueAt
  ) {
    return { runnable: false, reason: "authorization_incomplete" };
  }
  const nowValue = now.valueOf();
  if (
    config.authorizationExpiresAt &&
    Date.parse(config.authorizationExpiresAt) <= nowValue
  ) {
    return { runnable: false, reason: "authorization_expired" };
  }
  if (Date.parse(config.reviewDueAt) <= nowValue) {
    return { runnable: false, reason: "review_overdue" };
  }
  return { runnable: true };
}

/** One immutable raw record handed to the store before normalization. */
export interface FeedRawRecord {
  feedKey: string;
  externalId: string;
  sourceUrl: string;
  applicationUrl: string;
  contentHash: string;
  rawPayload: Record<string, unknown>;
}

export interface FeedSnapshot {
  feedKey: string;
  runAt: string;
  /**
   * A complete snapshot authorises absence handling: jobs previously seen
   * for this feed but not in `seenExternalIds` are closed. A partial or
   * failed snapshot must never close an existing job.
   */
  complete: boolean;
  seenExternalIds: string[];
  raw: FeedRawRecord[];
  jobs: AtsImportJob[];
}

export interface FeedPersistResult {
  inserted: number;
  updated: number;
  closed: number;
}

/** Persistence boundary. The in-memory implementation backs the tests; the
 * production implementation writes ingest.raw_job_records + the canonical
 * store + absence handling through the existing bounded worker RPC. */
export interface FeedRunStore {
  applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult>;
}

/** A bounded retrieval result. The fetcher must enforce the byte cap itself
 * for streamed bodies; the runtime re-checks the returned payload. */
export interface FeedFetchResult {
  ok: boolean;
  text: string;
}

export type FeedFetcher = (url: string) => Promise<FeedFetchResult>;

export interface FeedRunMetrics {
  feedKey: string;
  fetched: number;
  accepted: number;
  filtered: number;
  quarantined: number;
  destinationDropped: number;
  inserted: number;
  updated: number;
  closed: number;
  snapshotComplete: boolean;
}

export interface FeedRunOutcome {
  ran: boolean;
  reason?: FeedRunReason | "fetch_failed" | "feed_error";
  metrics?: FeedRunMetrics;
}

export interface RunEmployerFeedOptions {
  now?: Date;
  /** Fetched feeds (xml/json). Omitted for CSV uploads. */
  fetcher?: FeedFetcher;
  /** Authenticated CSV upload payload. */
  uploadedPayload?: string;
  store: FeedRunStore;
  mayStoreFullDescription?: boolean;
}

/**
 * Runs one authorized feed end to end. Returns `{ran:false, reason}` without
 * contacting the network whenever the feed is not eligible. A fetch failure
 * or malformed payload yields a partial (incomplete) snapshot that cannot
 * close existing jobs.
 */
export async function runEmployerFeed(
  config: EmployerFeedConfig,
  options: RunEmployerFeedOptions,
): Promise<FeedRunOutcome> {
  const now = options.now ?? new Date();
  const eligibility = feedRunEligibility(config, now);
  if (!eligibility.runnable) {
    return { ran: false, reason: eligibility.reason };
  }

  const runAt = now.toISOString();

  // Retrieval / upload.
  let payload: string;
  if (config.kind === "csv") {
    if (!options.uploadedPayload) return { ran: false, reason: "no_payload" };
    payload = options.uploadedPayload;
  } else {
    if (!options.fetcher || !config.url) {
      return { ran: false, reason: "no_payload" };
    }
    const fetched = await options.fetcher(config.url).catch(() => null);
    if (!fetched || !fetched.ok) {
      // Failed retrieval → partial snapshot, no closures.
      await options.store.applySnapshot({
        feedKey: config.feedKey,
        runAt,
        complete: false,
        seenExternalIds: [],
        raw: [],
        jobs: [],
      });
      return { ran: true, reason: "fetch_failed" };
    }
    payload = fetched.text;
  }

  if (Buffer.byteLength(payload, "utf8") > MAX_FEED_PAYLOAD_BYTES) {
    return { ran: false, reason: "feed_error" };
  }

  // Extraction (destination-pinned) → canonical normalization.
  let extraction;
  try {
    extraction = extractEmployerFeedRecords(config, payload, runAt);
  } catch (error) {
    if (error instanceof EmployerFeedError) {
      // Malformed payload → partial snapshot, no closures.
      await options.store.applySnapshot({
        feedKey: config.feedKey,
        runAt,
        complete: false,
        seenExternalIds: [],
        raw: [],
        jobs: [],
      });
      return { ran: true, reason: "feed_error" };
    }
    throw error;
  }

  const normalized = normalizeAtsImportRecords(
    extraction.records,
    {
      sourceKey: config.feedKey,
      employerName: config.employerName,
      mayStoreFullDescription: options.mayStoreFullDescription ?? false,
    },
    now,
  );

  const raw: FeedRawRecord[] = normalized.jobs.map((job) => ({
    feedKey: config.feedKey,
    externalId: job.external_id,
    sourceUrl: job.source_url,
    applicationUrl: job.application_url,
    contentHash: job.content_hash,
    rawPayload: job.raw_payload ?? { external_id: job.external_id },
  }));

  const persisted = await options.store.applySnapshot({
    feedKey: config.feedKey,
    runAt,
    complete: true,
    seenExternalIds: normalized.jobs.map((job) => job.external_id),
    raw,
    jobs: normalized.jobs,
  });

  const filtered = Object.values(normalized.filterCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const quarantined = Object.values(normalized.quarantineCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );

  return {
    ran: true,
    metrics: {
      feedKey: config.feedKey,
      fetched: extraction.records.length + extraction.droppedDestinationCount,
      accepted: normalized.jobs.length,
      filtered,
      quarantined,
      destinationDropped: extraction.droppedDestinationCount,
      inserted: persisted.inserted,
      updated: persisted.updated,
      closed: persisted.closed,
      snapshotComplete: true,
    },
  };
}
