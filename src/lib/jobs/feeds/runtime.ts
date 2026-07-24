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
  extractEmployerFeedRecords,
  parseEmployerFeedRegistry,
  FEED_PARSER_VERSION,
  type FeedSourceRecordEnvelope,
} from "./index";
import {
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  type EmployerFeedConfig,
} from "./types";

/**
 * The employer-feed runtime: authorized registry record -> global source
 * policy -> bounded retrieval / authenticated upload -> immutable evidence ->
 * extraction -> canonical normalization -> persistence -> absence handling ->
 * durable metrics.
 *
 * The single most important rule here is the snapshot-completeness
 * invariant. Absence closure (marking a previously public job closed because
 * it is no longer in the feed) is only ever authorized by a snapshot that is
 * PROVEN complete. Any doubt at all — a failed fetch, a truncated body, a
 * parse failure, an invalid record, a quarantined record, a
 * destination-rejected record, a provider total that does not reconcile, or
 * an unproven zero — forces a PARTIAL snapshot, which can never close a job.
 *
 * This mirrors the established ATS worker rule
 * (`providerSnapshotIsComplete(result) && normalized.quarantinedCount === 0`)
 * rather than inventing a second standard.
 */

/** Which global source policy governs each feed kind. */
export const FEED_ADAPTER_KEY: Record<
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
  | "review_overdue"
  | "global_policy_blocked"
  | "no_payload";

export interface FeedRunEligibility {
  runnable: boolean;
  reason?: FeedRunReason;
  /** Set when the global source policy rejected the run. */
  policyCode?: string;
  /** Fields the reviewed policy permits SalaryPadi to retain. */
  allowedFields?: readonly string[];
}

/**
 * Whether the feed may run at `now`. Checks the per-feed authorization AND
 * the global source policy; a per-feed `enabled` record can never override a
 * disabled, overdue or dependency-incomplete global policy.
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

  // Global gate: policy enabled, review window current, dependencies met and
  // every requested field allowed.
  const requestedFields = [
    "title",
    "company",
    "application_url",
    ...Object.values(config.fieldMap),
  ];
  try {
    const { policy } = openSupplyAdapter(FEED_ADAPTER_KEY[config.kind], now);
    const allowed = new Set(policy.allowedFields);
    const disallowed = requestedFields.find(
      (field) => allowed.size > 0 && !allowed.has(field),
    );
    if (disallowed) {
      return {
        runnable: false,
        reason: "global_policy_blocked",
        policyCode: "policy_field_not_allowed",
      };
    }
    return { runnable: true, allowedFields: policy.allowedFields };
  } catch (reason) {
    return {
      runnable: false,
      reason: "global_policy_blocked",
      policyCode:
        reason instanceof AdapterPolicyError ? reason.code : "policy_invalid",
    };
  }
}

export interface FeedSnapshot {
  feedKey: string;
  runAt: string;
  /**
   * Only a proven-complete snapshot authorizes absence closure. See
   * `evaluateSnapshotCompleteness`.
   */
  complete: boolean;
  /** Machine-readable reasons a snapshot was forced partial. */
  errorCodes: string[];
  seenExternalIds: string[];
  /** Immutable evidence for every source record, before normalization. */
  envelopes: FeedSourceRecordEnvelope[];
  jobs: AtsImportJob[];
  counts: FeedRunCounts;
}

export interface FeedRunCounts {
  sourceRecords: number;
  parsedRecords: number;
  acceptedRecords: number;
  invalidRecords: number;
  filteredRecords: number;
  quarantinedRecords: number;
  destinationDropped: number;
}

export interface FeedPersistResult {
  inserted: number;
  updated: number;
  unchanged: number;
  closed: number;
}

/** Persistence boundary. `SupabaseFeedRunStore` is the production binding. */
export interface FeedRunStore {
  applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult>;
}

export interface FeedFetchResult {
  ok: boolean;
  text: string;
  /** True when the body hit the byte cap and was cut short. */
  truncated?: boolean;
  /** Provider-declared total, when the feed publishes one. */
  reportedTotal?: number | null;
}

export type FeedFetcher = (url: string) => Promise<FeedFetchResult>;

export interface SnapshotCompletenessInput {
  retrievalOk: boolean;
  truncated: boolean;
  parseComplete: boolean;
  invalidRecordCount: number;
  quarantinedCount: number;
  destinationDroppedCount: number;
  sourceRecordCount: number;
  parsedRecordCount: number;
  reportedTotal: number | null;
  authoritativeEmpty: boolean;
}

export interface SnapshotCompleteness {
  complete: boolean;
  errorCodes: string[];
}

/**
 * The completeness formula. A snapshot is COMPLETE only when every clause
 * holds; each failed clause contributes an explicit error code.
 */
export function evaluateSnapshotCompleteness(
  input: SnapshotCompletenessInput,
): SnapshotCompleteness {
  const errorCodes: string[] = [];
  if (!input.retrievalOk) errorCodes.push("feed_retrieval_failed");
  if (input.truncated) errorCodes.push("feed_response_truncated");
  if (!input.parseComplete) errorCodes.push("feed_parse_incomplete");
  if (input.invalidRecordCount > 0) errorCodes.push("feed_invalid_records");
  if (input.quarantinedCount > 0) errorCodes.push("feed_import_quarantine");
  if (input.destinationDroppedCount > 0) {
    errorCodes.push("feed_destination_rejected");
  }
  // Every source record must be accounted for: parsed + invalid must equal
  // what the document presented.
  if (
    input.parsedRecordCount + input.invalidRecordCount !==
    input.sourceRecordCount
  ) {
    errorCodes.push("feed_record_accounting_mismatch");
  }
  if (
    input.reportedTotal !== null &&
    input.reportedTotal !== input.sourceRecordCount
  ) {
    errorCodes.push("feed_provider_total_mismatch");
  }
  // An empty result must be a PROVEN authoritative zero.
  if (input.sourceRecordCount === 0 && !input.authoritativeEmpty) {
    errorCodes.push("feed_unproven_empty");
  }
  return { complete: errorCodes.length === 0, errorCodes };
}

export interface FeedRunMetrics extends FeedRunCounts {
  feedKey: string;
  startedAt: string;
  completedAt: string;
  outcome: "complete" | "partial" | "failed";
  inserted: number;
  updated: number;
  unchanged: number;
  closed: number;
  snapshotComplete: boolean;
  errorCodes: string[];
}

export interface FeedRunOutcome {
  ran: boolean;
  reason?: FeedRunReason | "fetch_failed" | "feed_error";
  policyCode?: string;
  metrics?: FeedRunMetrics;
}

export interface RunEmployerFeedOptions {
  now?: Date;
  fetcher?: FeedFetcher;
  /** Authenticated CSV upload payload (see the upload boundary route). */
  uploadedPayload?: string;
  store: FeedRunStore;
  mayStoreFullDescription?: boolean;
}

const EMPTY_COUNTS: FeedRunCounts = {
  sourceRecords: 0,
  parsedRecords: 0,
  acceptedRecords: 0,
  invalidRecords: 0,
  filteredRecords: 0,
  quarantinedRecords: 0,
  destinationDropped: 0,
};

/** Records a partial (never-closing) snapshot for a run that could not read. */
async function recordPartial(
  store: FeedRunStore,
  feedKey: string,
  runAt: string,
  errorCodes: string[],
): Promise<FeedPersistResult> {
  return store.applySnapshot({
    feedKey,
    runAt,
    complete: false,
    errorCodes,
    seenExternalIds: [],
    envelopes: [],
    jobs: [],
    counts: { ...EMPTY_COUNTS },
  });
}

/**
 * Runs a feed whose eligibility has ALREADY been established. Kept separate
 * from the gate so the gate and the snapshot lifecycle are each testable on
 * their own, without mocking module internals. Callers must not invoke this
 * without a passing `feedRunEligibility` result.
 */
export async function runAuthorizedFeedSnapshot(
  config: EmployerFeedConfig,
  options: RunEmployerFeedOptions,
  allowedFields?: readonly string[],
): Promise<FeedRunOutcome> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const runAt = startedAt;
  let payload: string;
  let truncated = false;
  let reportedTotal: number | null = null;

  if (config.kind === "csv") {
    if (options.uploadedPayload === undefined) {
      return { ran: false, reason: "no_payload" };
    }
    payload = options.uploadedPayload;
  } else {
    if (!options.fetcher || !config.url) {
      return { ran: false, reason: "no_payload" };
    }
    const fetched = await options.fetcher(config.url).catch(() => null);
    if (!fetched || !fetched.ok) {
      await recordPartial(options.store, config.feedKey, runAt, [
        "feed_retrieval_failed",
      ]);
      return { ran: true, reason: "fetch_failed" };
    }
    payload = fetched.text;
    truncated = fetched.truncated === true;
    reportedTotal = fetched.reportedTotal ?? null;
  }

  if (Buffer.byteLength(payload, "utf8") > MAX_FEED_PAYLOAD_BYTES) {
    await recordPartial(options.store, config.feedKey, runAt, [
      "feed_payload_too_large",
    ]);
    return { ran: true, reason: "feed_error" };
  }

  let extracted;
  try {
    extracted = extractEmployerFeedRecords(
      config,
      payload,
      runAt,
      allowedFields,
    );
  } catch (error) {
    if (error instanceof EmployerFeedError) {
      await recordPartial(options.store, config.feedKey, runAt, [error.code]);
      return { ran: true, reason: "feed_error" };
    }
    throw error;
  }

  const normalized = normalizeAtsImportRecords(
    extracted.records,
    {
      sourceKey: config.feedKey,
      employerName: config.employerName,
      mayStoreFullDescription: options.mayStoreFullDescription ?? false,
    },
    now,
  );

  const filteredRecords = Object.values(normalized.filterCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const quarantinedRecords = Object.values(normalized.quarantineCodes).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );

  const completeness = evaluateSnapshotCompleteness({
    retrievalOk: true,
    truncated,
    parseComplete: extracted.extraction.parseComplete,
    invalidRecordCount: extracted.extraction.invalidRecordCount,
    quarantinedCount: quarantinedRecords,
    destinationDroppedCount: extracted.destinationDroppedCount,
    sourceRecordCount: extracted.extraction.sourceRecordCount,
    parsedRecordCount: extracted.extraction.parsedRecordCount,
    reportedTotal,
    authoritativeEmpty: extracted.extraction.authoritativeEmpty,
  });

  // Normalization outcomes are folded back into the evidence envelopes so a
  // filtered or quarantined record keeps its provenance and reason.
  const acceptedIds = new Set(normalized.jobs.map((job) => job.external_id));
  const envelopes = extracted.envelopes.map((envelope) =>
    envelope.extractionOutcome === "accepted" &&
    envelope.externalId &&
    !acceptedIds.has(envelope.externalId)
      ? {
          ...envelope,
          extractionOutcome: "invalid" as const,
          extractionReason: "missing_required_field" as const,
        }
      : envelope,
  );

  const counts: FeedRunCounts = {
    sourceRecords: extracted.extraction.sourceRecordCount,
    parsedRecords: extracted.extraction.parsedRecordCount,
    acceptedRecords: normalized.jobs.length,
    invalidRecords: extracted.extraction.invalidRecordCount,
    filteredRecords,
    quarantinedRecords,
    destinationDropped: extracted.destinationDroppedCount,
  };

  const persisted = await options.store.applySnapshot({
    feedKey: config.feedKey,
    runAt,
    complete: completeness.complete,
    errorCodes: completeness.errorCodes,
    seenExternalIds: normalized.jobs.map((job) => job.external_id),
    envelopes,
    jobs: normalized.jobs,
    counts,
  });

  return {
    ran: true,
    metrics: {
      ...counts,
      feedKey: config.feedKey,
      startedAt,
      completedAt: new Date().toISOString(),
      outcome: completeness.complete ? "complete" : "partial",
      inserted: persisted.inserted,
      updated: persisted.updated,
      unchanged: persisted.unchanged,
      closed: persisted.closed,
      snapshotComplete: completeness.complete,
      errorCodes: completeness.errorCodes,
    },
  };
}

/**
 * The public entrypoint: gate first, then run. An ineligible feed makes no
 * request of any kind.
 */
export async function runEmployerFeed(
  config: EmployerFeedConfig,
  options: RunEmployerFeedOptions,
): Promise<FeedRunOutcome> {
  const now = options.now ?? new Date();
  const eligibility = feedRunEligibility(config, now);
  if (!eligibility.runnable) {
    return {
      ran: false,
      reason: eligibility.reason,
      policyCode: eligibility.policyCode,
    };
  }
  return runAuthorizedFeedSnapshot(config, options, eligibility.allowedFields);
}

/**
 * Registry loader: the feeds eligible to run at `now`. The committed registry
 * is empty, so this returns [] and the dispatcher performs no work and makes
 * no network request.
 */
export function loadRunnableEmployerFeeds(now: Date): EmployerFeedConfig[] {
  return parseEmployerFeedRegistry(registryConfig).feeds.filter(
    (feed) => feedRunEligibility(feed, now).runnable,
  );
}

export { FEED_PARSER_VERSION };
