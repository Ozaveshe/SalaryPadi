import { createHash } from "node:crypto";

export interface SourceOccurrenceIdentity {
  sourceId: string;
  externalSourceId: string;
  runId: string;
  contentHash: string;
}

export function occurrenceIdempotencyKey(identity: SourceOccurrenceIdentity) {
  if (!/^[0-9a-f]{64}$/.test(identity.contentHash)) {
    throw new Error("invalid_occurrence_content_hash");
  }
  return createHash("sha256")
    .update(
      JSON.stringify([
        identity.sourceId,
        identity.externalSourceId,
        identity.runId,
        identity.contentHash,
      ]),
    )
    .digest("hex");
}
