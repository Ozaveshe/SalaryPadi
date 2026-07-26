import {
  normalizeAtsImportRecords,
  type AtsImportJob,
} from "@/lib/jobs/ats-import";
import {
  openSupplyAdapter,
  type SupplyAdapterKey,
} from "@/lib/jobs/supply/adapters";
import { AdapterPolicyError } from "@/lib/jobs/supply/policy";

import registryConfig from "../../../../config/employer-feed-registry.json";
import {
  computeFeedSnapshotCompleteness,
  type FeedIncompletenessReason,
} from "./completeness";
import { extractEmployerFeedRecords, parseEmployerFeedRegistry } from "./index";
import {
  AUTHORIZATION_CLOCK_SKEW_MS,
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  type EmployerFeedConfig,
  type FeedExtractionReasonCode,
} from "./types";

/**
 * The employer-feed runtime: the path from an authorized registry record to
 * canonical jobs and metrics. It owns the order of the gates and the absence
 * semantics; persistence is injected so the lifecycle is provable without a
 * live database and the same runtime binds to the real store in production.
 *
 * Order (fail-closed at each step):
 *   global source policy (kill switch)
 *   → per-feed eligibility (enabled + authorization current)
 *   → bounded retrieval / authenticated upload
 *   → extraction (destination-pinned, fully counted)
 *   → normalizeAtsImportRecords
 *   → ONE completeness decision
 *   → persistence
 *   → absence handling (complete snapshots only)
 *   → metrics
 */

/** Global policy adapter keys backing the generic feed kinds. */
const POLICY_ADAPTER_BY_KIND: Record<
  EmployerFeedConfig["kind"],
  SupplyAdapterKey
> = {
  xml: "employer_xml_json_feeds",
  json: "employer_xml_json_feeds",
  csv: "employer_csv_import",
};

export type FeedRunReason =
  | "disabled"
  | "authorization_incomplete"
  | "authorization_expired"
  | "authorization_not_yet_valid"
  | "review_overdue"
  | "policy_blocked"
  | "no_payload";

export interface FeedRunEligibility {
  runnable: boolean;
  reason?: FeedRunReason;
  /** The AdapterPolicyError code when the global policy blocked the run. */
  policyCode?: string;
}

/** Injection point so policy behaviour is testable without editing the
 * committed global policy registry. */
export type SourcePolicyGate = (
  adapterKey: SupplyAdapterKey,
  now: Date,
) => void;

const defaultPolicyGate: SourcePolicyGate = (adapterKey, now) => {
  openSupplyAdapter(adapterKey, now);
};

/**
 * Whether the feed may run at `now`.
 *
 * Both gates must pass. A per-feed `enabled: true` record can never override a
 * globally disabled, expired, review-overdue, dependency-missing or
 * field-restricted source policy — the global policy is evaluated first and
 * short-circuits before any network request or payload processing.
 */
export function feedRunEligibility(
  config: EmployerFeedConfig,
  now: Date,
  policyGate: SourcePolicyGate = defaultPolicyGate,
): FeedRunEligibility {
  // Global kill switch first: cheapest, and the one an operator reaches for.
  try {
    policyGate(POLICY_ADAPTER_BY_KIND[config.kind], now);
  } catch (reason) {
    return {
      runnable: false,
      reason: "policy_blocked",
      policyCode:
        reason instanceof AdapterPolicyError ? reason.code : "policy_missing",
    };
  }

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
  const skewLimit = nowValue + AUTHORIZATION_CLOCK_SKEW_MS;
  // A future-dated authorization or review has not happened yet and cannot
  // authorize anything today.
  if (
    Date.parse(config.authorizedAt) > skewLimit ||
    Date.parse(config.reviewedAt) > skewLimit
  ) {
    return { runnable: false, reason: "authorization_not_yet_valid" };
  }
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

/**
 * Runtime registry loader: the feeds eligible to run at `now`. An empty result
 * (the current state — no employer has authorized a feed) means the dispatcher
 * does nothing, which is correct.
 */
export function loadRunnableEmployerFeeds(
  now: Date,
  policyGate: SourcePolicyGate = defaultPolicyGate,
): EmployerFeedConfig[] {
  return parseEmployerFeedRegistry(registryConfig).feeds.filter(
    (feed) => feedRunEligibility(feed, now, policyGate).runnable,
  );
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
   * A complete snapshot authorises absence handling: jobs previously seen for
   * this feed but not in `seenExternalIds` are closed. Always the value
   * returned by computeFeedSnapshotCompleteness — never a literal.
   */
  complete: boolean;
  /** Why the snapshot is partial, when it is. */
  incompletenessReasons: FeedIncompletenessReason[];
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
 * production implementation is not yet connected (see the ingestion gap
 * assessment). */
export interface FeedRunStore {
  applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult>;
}

/** A bounded retrieval result. The fetcher must enforce the byte cap itself
 * for streamed bodies; the runtime re-checks the returned payload. */
export interface FeedFetchResult {
  ok: boolean;
  text: string;
  /** False when the body was cut short (deadline, byte cap, aborted stream). */
  complete?: boolean;
}

export type FeedFetcher = (url: string) => Promise<FeedFetchResult>;

export interface FeedRunMetrics {
  feedKey: string;
  fetched: number;
  accepted: number;
  filtered: number;
  quarantined: number;
  destinationDropped: number;
  invalidRecords: number;
  truncated: boolean;
  inserted: number;
  updated: number;
  closed: number;
  snapshotComplete: boolean;
  incompletenessReasons: FeedIncompletenessReason[];
  extractionReasonCodes: FeedExtractionReasonCode[];
}

export interface FeedRunOutcome {
  ran: boolean;
  reason?: FeedRunReason | "fetch_failed" | "feed_error" | "payload_too_large";
  policyCode?: string;
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
  policyGate?: SourcePolicyGate;
}

/** A partial snapshot: records the attempt, closes nothing. */
async function recordPartial(
  store: FeedRunStore,
  feedKey: string,
  runAt: string,
  reasons: FeedIncompletenessReason[],
): Promise<void> {
  await store.applySnapshot({
    feedKey,
    runAt,
    complete: false,
    incompletenessReasons: reasons,
    seenExternalIds: [],
    raw: [],
    jobs: [],
  });
}

/**
 * Runs one authorized feed end to end. Returns `{ran:false, reason}` without
 * contacting the network whenever either gate refuses. Any retrieval, parsing
 * or normalization problem yields a partial snapshot that cannot close jobs.
 */
export async function runEmployerFeed(
  config: EmployerFeedConfig,
  options: RunEmployerFeedOptions,
): Promise<FeedRunOutcome> {
  const now = options.now ?? new Date();
  const eligibility = feedRunEligibility(config, now, options.policyGate);
  if (!eligibility.runnable) {
    return {
      ran: false,
      reason: eligibility.reason,
      ...(eligibility.policyCode ? { policyCode: eligibility.policyCode } : {}),
    };
  }

  const runAt = now.toISOString();

  // Retrieval / upload.
  let payload: string;
  let retrievalComplete = true;
  if (config.kind === "csv") {
    if (!options.uploadedPayload) return { ran: false, reason: "no_payload" };
    payload = options.uploadedPayload;
  } else {
    if (!options.fetcher || !config.url) {
      return { ran: false, reason: "no_payload" };
    }
    const fetched = await options.fetcher(config.url).catch(() => null);
    if (!fetched || !fetched.ok) {
      await recordPartial(options.store, config.feedKey, runAt, [
        "retrieval_incomplete",
      ]);
      return { ran: true, reason: "fetch_failed" };
    }
    payload = fetched.text;
    retrievalComplete = fetched.complete !== false;
  }

  const withinByteLimit =
    Buffer.byteLength(payload, "utf8") <= MAX_FEED_PAYLOAD_BYTES;
  if (!withinByteLimit) {
    await recordPartial(options.store, config.feedKey, runAt, [
      "payload_too_large",
    ]);
    return { ran: true, reason: "payload_too_large" };
  }

  // Extraction (destination-pinned) → canonical normalization.
  let extraction;
  try {
    extraction = extractEmployerFeedRecords(config, payload, runAt);
  } catch (error) {
    if (error instanceof EmployerFeedError) {
      await recordPartial(options.store, config.feedKey, runAt, [
        error.code === "feed_payload_too_large"
          ? "payload_too_large"
          : "parse_incomplete",
      ]);
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

  const quarantined = Object.values(normalized.quarantineCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const filtered = Object.values(normalized.filterCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );

  // THE single completeness decision. Persistence, metrics, absence handling
  // and logging all read this one boolean.
  const completeness = computeFeedSnapshotCompleteness({
    retrievalComplete,
    withinByteLimit,
    extraction,
    quarantinedCount: quarantined,
    acceptedCount: normalized.jobs.length,
  });

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
    complete: completeness.complete,
    incompletenessReasons: completeness.reasons,
    seenExternalIds: normalized.jobs.map((job) => job.external_id),
    raw,
    jobs: normalized.jobs,
  });

  return {
    ran: true,
    metrics: {
      feedKey: config.feedKey,
      fetched: extraction.sourceRecordCount,
      accepted: normalized.jobs.length,
      filtered,
      quarantined,
      destinationDropped: extraction.destinationDroppedCount,
      invalidRecords: extraction.invalidRecordCount,
      truncated: extraction.truncated,
      inserted: persisted.inserted,
      updated: persisted.updated,
      closed: persisted.closed,
      snapshotComplete: completeness.complete,
      incompletenessReasons: completeness.reasons,
      extractionReasonCodes: extraction.reasonCodes,
    },
  };
}
