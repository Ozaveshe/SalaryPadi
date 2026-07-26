import type { FeedExtractionResult } from "./types";

/**
 * The single snapshot-completeness contract for generic employer feeds.
 *
 * A "complete" snapshot authorises absence handling: any job previously seen
 * for this feed but absent from the snapshot is closed. That is destructive and
 * irreversible from the candidate's point of view, so completeness is proven,
 * never assumed.
 *
 * This formula is the ONLY place the decision is made. `snapshot.complete`,
 * the `snapshotComplete` metric, absence handling and logging all read the same
 * computed boolean, so persistence and metrics cannot drift apart.
 */

/** Why a snapshot could not be treated as authoritative. */
export type FeedIncompletenessReason =
  | "retrieval_incomplete"
  | "payload_too_large"
  | "parse_incomplete"
  | "record_limit_exceeded"
  | "container_missing"
  | "records_unaccounted"
  | "invalid_records_discarded"
  | "records_quarantined"
  | "destination_dropped"
  | "provider_count_mismatch"
  | "empty_not_authoritative";

export interface FeedCompletenessInput {
  /** The full response body was retrieved (no fetch failure, no truncation). */
  retrievalComplete: boolean;
  /** The payload was within MAX_FEED_PAYLOAD_BYTES. */
  withinByteLimit: boolean;
  extraction: Pick<
    FeedExtractionResult,
    | "sourceRecordCount"
    | "mappedRecordCount"
    | "invalidRecordCount"
    | "destinationDroppedCount"
    | "truncated"
    | "parseComplete"
    | "containerFound"
    | "authoritativeEmpty"
    | "providerReportedCount"
  >;
  /** Records the canonical normalizer quarantined. */
  quarantinedCount: number;
  /** Records the canonical normalizer accepted. */
  acceptedCount: number;
}

export interface FeedCompleteness {
  complete: boolean;
  reasons: FeedIncompletenessReason[];
}

/**
 * Computes whether a snapshot may close absent jobs.
 *
 * Every condition below is necessary. The default answer is "not complete";
 * a snapshot earns completeness only by satisfying all of them.
 */
export function computeFeedSnapshotCompleteness(
  input: FeedCompletenessInput,
): FeedCompleteness {
  const { extraction } = input;
  const reasons: FeedIncompletenessReason[] = [];

  // 1. The complete response was retrieved.
  if (!input.retrievalComplete) reasons.push("retrieval_incomplete");
  // 2. The byte limit was not exceeded.
  if (!input.withinByteLimit) reasons.push("payload_too_large");
  // 3. Parsing completed successfully.
  if (!extraction.parseComplete) reasons.push("parse_incomplete");
  // 4. No record-limit truncation occurred.
  if (extraction.truncated) reasons.push("record_limit_exceeded");
  // 5. The expected feed container was found.
  if (!extraction.containerFound) reasons.push("container_missing");
  // 6. No structurally invalid source record was discarded.
  if (extraction.invalidRecordCount > 0) {
    reasons.push("invalid_records_discarded");
  }
  // 7. Every source record is accounted for: mapped + invalid must equal the
  //    number of records the source actually held. A shortfall means records
  //    disappeared without a reason code, which is exactly the silent loss
  //    this contract exists to prevent.
  if (
    extraction.mappedRecordCount + extraction.invalidRecordCount !==
    extraction.sourceRecordCount
  ) {
    reasons.push("records_unaccounted");
  }
  // 8. No record was quarantined. This matches the established ATS rule: an
  //    isolated bad record must never close a job that is still open.
  if (input.quarantinedCount > 0) reasons.push("records_quarantined");
  // 9. No destination was dropped for leaving the authorization boundary. A
  //    dropped destination means we cannot see the employer's full inventory.
  if (extraction.destinationDroppedCount > 0) {
    reasons.push("destination_dropped");
  }
  // 10. A provider-reported total, where available, matches what we saw.
  if (
    extraction.providerReportedCount !== null &&
    extraction.providerReportedCount !== extraction.sourceRecordCount
  ) {
    reasons.push("provider_count_mismatch");
  }
  // 11. A zero-record result is explicitly proven authoritative. Reaching zero
  //     accepted records is the single most destructive outcome available, so
  //     it requires the feed's own authorization to permit it.
  if (input.acceptedCount === 0 && !extraction.authoritativeEmpty) {
    reasons.push("empty_not_authoritative");
  }

  return { complete: reasons.length === 0, reasons };
}
