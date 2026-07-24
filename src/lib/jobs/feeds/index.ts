import type {
  AtsSourceRecord,
  AtsSourceRecordProvider,
} from "@/lib/jobs/ats/types";

import {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
} from "./extract";
import {
  employerFeedRegistrySchema,
  type EmployerFeedConfig,
  type ExtractedFeedRecord,
} from "./types";

export {
  extractCsvFeedRecords,
  extractJsonFeedRecords,
  extractXmlFeedRecords,
  parseCsv,
} from "./extract";
export * from "./types";

const PROVIDER_BY_KIND: Record<
  EmployerFeedConfig["kind"],
  AtsSourceRecordProvider
> = {
  xml: "employer_xml_feed",
  json: "employer_json_feed",
  csv: "employer_csv_import",
};

function hostAllowed(url: string, allowedHosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443")
  ) {
    return false;
  }
  return allowedHosts.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
}

export interface EmployerFeedExtractionResult {
  records: AtsSourceRecord[];
  /** Extracted records dropped because a URL left the authorized hosts. */
  droppedDestinationCount: number;
}

/**
 * The generic-feed connector boundary: payload in, provider-agnostic
 * AtsSourceRecords out. Everything downstream — publication gates,
 * eligibility classification, quarantine codes, content hashes,
 * fingerprints and the bounded worker store — is the existing
 * normalizeAtsImportRecords pipeline; generic feeds add no second path.
 *
 * Records whose source or application URL points outside the feed's
 * authorized destination hosts are dropped and counted, never repaired.
 */
export function extractEmployerFeedRecords(
  config: EmployerFeedConfig,
  payload: string,
  checkedAt: string,
): EmployerFeedExtractionResult {
  const extracted: ExtractedFeedRecord[] =
    config.kind === "xml"
      ? extractXmlFeedRecords(payload, config)
      : config.kind === "json"
        ? extractJsonFeedRecords(payload, config)
        : extractCsvFeedRecords(payload, config);

  const records: AtsSourceRecord[] = [];
  let droppedDestinationCount = 0;
  for (const record of extracted) {
    if (
      !hostAllowed(record.sourceUrl, config.allowedDestinationHosts) ||
      !hostAllowed(record.applicationUrl, config.allowedDestinationHosts)
    ) {
      droppedDestinationCount += 1;
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
  return { records, droppedDestinationCount };
}

/** Parses and validates the employer feed registry file contents. */
export function parseEmployerFeedRegistry(contents: unknown) {
  return employerFeedRegistrySchema.parse(contents);
}
