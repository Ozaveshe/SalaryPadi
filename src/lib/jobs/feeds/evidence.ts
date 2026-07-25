import { createHash } from "node:crypto";

import type { AtsSourceRecord } from "@/lib/jobs/ats/types";

import type { EmployerFeedConfig, FeedExtractionReasonCode } from "./types";

/**
 * Rights-compliant source evidence, built BEFORE normalization.
 *
 * The previous runtime derived its "raw" record from normalized output and,
 * under the default policy, retained only an external id — a normalized
 * derivative described as raw evidence. That cannot answer "what did this
 * employer actually send us?", which is the only question evidence exists to
 * answer when a takedown or a rights dispute arrives.
 *
 * What is retained is decided by policy, not convenience:
 *   - always: a SHA-256 of the record as received, its byte length, the
 *     identifiers, the timestamps, the parser and field-map versions, and the
 *     extraction/normalization outcome with its reason code;
 *   - the permitted payload only where the source policy allows full
 *     description storage — and the database re-checks that independently, so
 *     a caller cannot widen it.
 *
 * Records that never reach normalization (missing fields, malformed URLs,
 * unauthorized destinations, over the record cap) still produce evidence.
 * Those are precisely the records someone will later ask about.
 */

/** Bumped when extraction semantics change, so old evidence stays readable. */
export const FEED_PARSER_VERSION = "employer-feed/2026-07-25";

export type FeedExtractionOutcome =
  | "mapped"
  | "required_field_missing"
  | "malformed_record_url"
  | "destination_not_authorized"
  | "record_limit_exceeded";

export type FeedNormalizationOutcome = "accepted" | "filtered" | "quarantined";

export interface FeedEvidenceRecord {
  feedKey: string;
  importRunId: string | null;
  runAt: string;
  externalId: string | null;
  payloadSha256: string;
  payloadBytes: number;
  sourceUrl: string | null;
  applicationUrl: string | null;
  fetchedAt: string;
  parserVersion: string;
  fieldMapVersion: string;
  extractionOutcome: FeedExtractionOutcome;
  normalizationOutcome: FeedNormalizationOutcome | null;
  reasonCode: FeedExtractionReasonCode | string | null;
  /** Only populated where the policy permits full payload retention. */
  permittedPayload: Record<string, unknown> | null;
}

/**
 * A stable fingerprint of the field map. Two feeds mapping different columns
 * produce different evidence even for identical payloads, so a mapping change
 * is visible in the evidence trail rather than silently reinterpreting history.
 */
export function fieldMapVersion(config: EmployerFeedConfig): string {
  const canonical = Object.entries(config.fieldMap)
    .filter(([, value]) => typeof value === "string")
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function hashRecord(value: unknown): {
  sha256: string;
  bytes: number;
} {
  const serialised = JSON.stringify(value ?? null);
  return {
    sha256: createHash("sha256").update(serialised).digest("hex"),
    bytes: Buffer.byteLength(serialised, "utf8"),
  };
}

export interface BuildEvidenceOptions {
  config: EmployerFeedConfig;
  runAt: string;
  importRunId: string | null;
  /** Whether the source policy permits retaining the full payload. */
  mayStoreFullDescription: boolean;
}

/**
 * Evidence for one record that survived extraction, before normalization has
 * decided anything about it. The normalization outcome is attached later.
 */
export function buildAcceptedEvidence(
  record: AtsSourceRecord,
  options: BuildEvidenceOptions,
): FeedEvidenceRecord {
  const { sha256, bytes } = hashRecord(record);
  return {
    feedKey: options.config.feedKey,
    importRunId: options.importRunId,
    runAt: options.runAt,
    externalId: record.externalId,
    payloadSha256: sha256,
    payloadBytes: bytes,
    sourceUrl: record.sourceUrl,
    applicationUrl: record.applicationUrl,
    fetchedAt: record.checkedAt,
    parserVersion: FEED_PARSER_VERSION,
    fieldMapVersion: fieldMapVersion(options.config),
    extractionOutcome: "mapped",
    normalizationOutcome: null,
    reasonCode: null,
    permittedPayload: options.mayStoreFullDescription
      ? (record as unknown as Record<string, unknown>)
      : null,
  };
}

/**
 * Evidence for a record that never reached normalization. Only the counts and
 * the reason are known, so only those are recorded — but the record is still
 * accounted for rather than vanishing.
 */
export function buildExcludedEvidence(
  reason: FeedExtractionOutcome,
  count: number,
  options: BuildEvidenceOptions,
): FeedEvidenceRecord[] {
  if (count <= 0) return [];
  // Excluded records are summarised rather than enumerated: extraction has
  // already refused to interpret them, so per-record identifiers would be
  // fabricated. One row per reason carries the count in its payload hash input.
  const { sha256, bytes } = hashRecord({ reason, count });
  return [
    {
      feedKey: options.config.feedKey,
      importRunId: options.importRunId,
      runAt: options.runAt,
      externalId: null,
      payloadSha256: sha256,
      payloadBytes: bytes,
      sourceUrl: null,
      applicationUrl: null,
      fetchedAt: options.runAt,
      parserVersion: FEED_PARSER_VERSION,
      fieldMapVersion: fieldMapVersion(options.config),
      extractionOutcome: reason,
      normalizationOutcome: null,
      reasonCode: reason,
      permittedPayload: null,
    },
  ];
}

/** The wire shape the worker_store_feed_evidence RPC accepts. */
export function toEvidenceRow(
  evidence: FeedEvidenceRecord,
): Record<string, unknown> {
  return {
    import_run_id: evidence.importRunId,
    run_at: evidence.runAt,
    external_id: evidence.externalId,
    payload_sha256: evidence.payloadSha256,
    payload_bytes: evidence.payloadBytes,
    source_url: evidence.sourceUrl,
    application_url: evidence.applicationUrl,
    fetched_at: evidence.fetchedAt,
    parser_version: evidence.parserVersion,
    field_map_version: evidence.fieldMapVersion,
    extraction_outcome: evidence.extractionOutcome,
    normalization_outcome: evidence.normalizationOutcome,
    reason_code: evidence.reasonCode,
    permitted_payload: evidence.permittedPayload,
  };
}
