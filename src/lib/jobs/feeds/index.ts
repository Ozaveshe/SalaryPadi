import { createHash } from "node:crypto";

import type {
  AtsSourceRecord,
  AtsSourceRecordProvider,
} from "@/lib/jobs/ats/types";

import { checkDestinationUrl, type DestinationRejection } from "./domain";
import {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
  type ExtractionResult,
} from "./extract";
import { employerFeedRegistrySchema, type EmployerFeedConfig } from "./types";

export {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
  parseCsv,
  type ExtractionResult,
} from "./extract";
export * from "./types";
export * from "./domain";
export * from "./xml";

/** Bumped whenever extraction or envelope semantics change. */
export const FEED_PARSER_VERSION = "employer-feed/2";

const PROVIDER_BY_KIND: Record<
  EmployerFeedConfig["kind"],
  AtsSourceRecordProvider
> = {
  xml: "employer_xml_feed",
  json: "employer_json_feed",
  csv: "employer_csv_import",
};

/**
 * Immutable evidence for one source record, captured BEFORE normalization so
 * that filtered, quarantined and destination-rejected records keep their
 * provenance instead of existing only as counts.
 *
 * Only fields the source policy permits are retained: the caller passes the
 * allowed-field list from the reviewed policy and anything outside it is
 * dropped from `sourceFields`.
 */
export interface FeedSourceRecordEnvelope {
  feedKey: string;
  externalId: string | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  /** SHA-256 over the permitted source fields. */
  sourceRecordHash: string;
  fetchedAt: string;
  sourceFields: Record<string, string>;
  extractionOutcome: "accepted" | "invalid" | "destination_rejected";
  extractionReason: DestinationRejection | "missing_required_field" | null;
  parserVersion: string;
}

export interface EmployerFeedExtractionResult {
  /** Records that passed destination authorization, ready to normalize. */
  records: AtsSourceRecord[];
  /** Evidence for every source record, whatever its outcome. */
  envelopes: FeedSourceRecordEnvelope[];
  extraction: ExtractionResult;
  destinationDroppedCount: number;
  /** Reason counts for operator reporting. */
  destinationRejections: Partial<Record<DestinationRejection, number>>;
}

function hashFields(fields: Record<string, string>): string {
  return createHash("sha256")
    .update(JSON.stringify(fields, Object.keys(fields).sort()))
    .digest("hex");
}

/**
 * Extraction boundary: payload in, authorized records + immutable evidence
 * out. Records whose source or application URL leaves the feed's authorized
 * hosts are rejected with an explicit reason and never repaired.
 *
 * `allowedFields` comes from the reviewed source policy; only those keys are
 * retained in the stored evidence.
 */
export function extractEmployerFeedRecords(
  config: EmployerFeedConfig,
  payload: string,
  checkedAt: string,
  allowedFields?: readonly string[],
): EmployerFeedExtractionResult {
  const extraction: ExtractionResult =
    config.kind === "xml"
      ? extractXmlFeedRecords(payload, config)
      : config.kind === "json"
        ? extractJsonFeedRecords(payload, config)
        : extractCsvFeedRecords(payload, config);

  const permitted = allowedFields ? new Set(allowedFields) : null;
  const keepField = (key: string) => !permitted || permitted.has(key);

  const records: AtsSourceRecord[] = [];
  const envelopes: FeedSourceRecordEnvelope[] = [];
  const destinationRejections: Partial<Record<DestinationRejection, number>> =
    {};
  let destinationDroppedCount = 0;

  const rules = {
    allowedHosts: config.allowedDestinationHosts,
    allowSubdomains: true,
  };

  for (const record of extraction.records) {
    const candidateFields: Record<string, string> = {
      external_id: record.externalId,
      title: record.title,
      source_url: record.sourceUrl,
      application_url: record.applicationUrl,
      ...(record.location ? { location: record.location } : {}),
      ...(record.workplaceType ? { workplace_type: record.workplaceType } : {}),
      ...(record.employmentType
        ? { employment_type: record.employmentType }
        : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(record.publishedAt ? { published_at: record.publishedAt } : {}),
    };
    const sourceFields = Object.fromEntries(
      Object.entries(candidateFields).filter(([key]) => keepField(key)),
    );

    const sourceCheck = checkDestinationUrl(record.sourceUrl, rules);
    const applyCheck = checkDestinationUrl(record.applicationUrl, rules);
    const rejection = !sourceCheck.ok
      ? sourceCheck.reason
      : !applyCheck.ok
        ? applyCheck.reason
        : null;

    envelopes.push({
      feedKey: config.feedKey,
      externalId: record.externalId,
      sourceUrl: record.sourceUrl,
      applicationUrl: record.applicationUrl,
      sourceRecordHash: hashFields(sourceFields),
      fetchedAt: checkedAt,
      sourceFields,
      extractionOutcome: rejection ? "destination_rejected" : "accepted",
      extractionReason: rejection,
      parserVersion: FEED_PARSER_VERSION,
    });

    if (rejection) {
      destinationDroppedCount += 1;
      destinationRejections[rejection] =
        (destinationRejections[rejection] ?? 0) + 1;
      continue;
    }

    records.push({
      provider: PROVIDER_BY_KIND[config.kind],
      sourceKey: config.feedKey,
      employerName: config.employerName,
      externalId: record.externalId,
      title: record.title,
      location: record.location,
      workplaceType: record.workplaceType,
      employmentType: record.employmentType,
      department: null,
      team: null,
      descriptionHtml: record.description,
      descriptionText: null,
      publishedAt: record.publishedAt,
      updatedAt: null,
      sourceUrl: record.sourceUrl,
      applicationUrl: record.applicationUrl,
      checkedAt,
    });
  }

  return {
    records,
    envelopes,
    extraction,
    destinationDroppedCount,
    destinationRejections,
  };
}

/** Parses and validates the employer feed registry file contents. */
export function parseEmployerFeedRegistry(contents: unknown) {
  return employerFeedRegistrySchema.parse(contents);
}
