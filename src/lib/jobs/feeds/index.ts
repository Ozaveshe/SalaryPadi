import type {
  AtsSourceRecord,
  AtsSourceRecordProvider,
} from "@/lib/jobs/ats/types";

import { isAuthorizedDestination } from "./domain";
import {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
} from "./extract";
import {
  employerFeedRegistrySchema,
  type EmployerFeedConfig,
  type FeedExtractionReasonCode,
  type FeedExtractionResult,
} from "./types";

export {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
  parseCsv,
} from "./extract";
export * from "./types";
export {
  computeFeedSnapshotCompleteness,
  type FeedCompleteness,
  type FeedCompletenessInput,
  type FeedIncompletenessReason,
} from "./completeness";
export {
  isAuthorizedDestination,
  isValidDestinationHost,
  registrableDomain,
} from "./domain";

const PROVIDER_BY_KIND: Record<
  EmployerFeedConfig["kind"],
  AtsSourceRecordProvider
> = {
  xml: "employer_xml_feed",
  json: "employer_json_feed",
  csv: "employer_csv_import",
};

/**
 * The generic-feed connector boundary: payload in, provider-agnostic
 * AtsSourceRecords out, together with the counts that decide whether the
 * resulting snapshot may close absent jobs.
 *
 * Everything downstream — publication gates, eligibility classification,
 * quarantine codes, content hashes, fingerprints — is the existing
 * normalizeAtsImportRecords pipeline; generic feeds add no second path.
 *
 * Records whose source or application URL points outside the feed's authorized
 * destination hosts are dropped, counted and reasoned, never repaired.
 */
export function extractEmployerFeedRecords(
  config: EmployerFeedConfig,
  payload: string,
  checkedAt: string,
): FeedExtractionResult {
  const raw =
    config.kind === "xml"
      ? extractXmlFeedRecords(payload, config)
      : config.kind === "json"
        ? extractJsonFeedRecords(payload, config)
        : extractCsvFeedRecords(payload, config);

  const reasonCodes = new Set<FeedExtractionReasonCode>(raw.reasonCodes);
  const records: AtsSourceRecord[] = [];
  let destinationDroppedCount = 0;

  for (const record of raw.records) {
    if (
      !isAuthorizedDestination(
        record.sourceUrl,
        config.allowedDestinationHosts,
      ) ||
      !isAuthorizedDestination(
        record.applicationUrl,
        config.allowedDestinationHosts,
      )
    ) {
      destinationDroppedCount += 1;
      reasonCodes.add("destination_not_authorized");
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

  /**
   * A zero-record result is authoritative only when the feed's authorization
   * permits it AND the structure proves the source really answered "none":
   * the container was found, parsing completed, nothing was truncated, no
   * record was invalid, and the source itself held zero records.
   *
   * This is what separates "the employer has no open roles" from "the employer
   * renamed a field and every record silently failed to map".
   */
  const authoritativeEmpty =
    config.allowAuthoritativeEmpty &&
    raw.containerFound &&
    !raw.truncated &&
    raw.sourceRecordCount === 0 &&
    raw.invalidRecordCount === 0 &&
    destinationDroppedCount === 0;

  if (raw.sourceRecordCount === 0 && !authoritativeEmpty) {
    reasonCodes.add("empty_not_authoritative");
  }

  return {
    records,
    sourceRecordCount: raw.sourceRecordCount,
    mappedRecordCount: raw.mappedRecordCount,
    invalidRecordCount: raw.invalidRecordCount,
    destinationDroppedCount,
    truncated: raw.truncated,
    // Reaching this point means the payload parsed; structural failures throw.
    parseComplete: true,
    containerFound: raw.containerFound,
    authoritativeEmpty,
    providerReportedCount: raw.providerReportedCount,
    reasonCodes: [...reasonCodes].toSorted(),
  };
}

/** Parses and validates the employer feed registry file contents. */
export function parseEmployerFeedRegistry(contents: unknown) {
  return employerFeedRegistrySchema.parse(contents);
}
