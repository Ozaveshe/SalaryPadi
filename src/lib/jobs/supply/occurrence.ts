import { createHash } from "node:crypto";

export interface SourceOccurrenceIdentity {
  sourceId: string;
  externalSourceId: string;
  runId: string;
  contentHash: string;
}

function assertIdentityPart(
  name: "source_id" | "external_source_id" | "run_id",
  value: string,
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`invalid_occurrence_${name}`);
  }
}

export function occurrenceIdempotencyKey(identity: SourceOccurrenceIdentity) {
  assertIdentityPart("source_id", identity.sourceId);
  assertIdentityPart("external_source_id", identity.externalSourceId);
  assertIdentityPart("run_id", identity.runId);
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
