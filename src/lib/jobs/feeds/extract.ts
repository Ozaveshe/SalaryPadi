import {
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  MAX_FEED_RECORDS,
  type EmployerFeedConfig,
  type ExtractedFeedRecord,
  type FeedExtractionReasonCode,
  type FeedFieldMap,
} from "./types";
import { readChildText, scanXmlRecords, XmlStructureError } from "./xml";

/**
 * Extraction turns a feed payload into flat records plus the counts that decide
 * whether the resulting snapshot may be treated as authoritative.
 *
 * The governing rule: nothing is discarded silently. A record that is missing a
 * required field, carries an unusable URL, or sits beyond the record cap is
 * excluded from canonical normalization, but it is counted and it contributes a
 * reason code. Those counts are what stop a mapping failure or a clipped feed
 * from closing an employer's entire inventory.
 */

/** What extraction produces before destination authorization is applied. */
export interface RawExtraction {
  records: ExtractedFeedRecord[];
  sourceRecordCount: number;
  mappedRecordCount: number;
  invalidRecordCount: number;
  truncated: boolean;
  containerFound: boolean;
  providerReportedCount: number | null;
  reasonCodes: Set<FeedExtractionReasonCode>;
}

function assertPayloadSize(payload: string) {
  // Measured in UTF-8 bytes, not UTF-16 string length: a feed of multi-byte
  // characters must be bounded by its real transfer/parse cost.
  if (Buffer.byteLength(payload, "utf8") > MAX_FEED_PAYLOAD_BYTES) {
    throw new EmployerFeedError("feed_payload_too_large");
  }
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** A record URL must be a syntactically usable absolute https URL. */
function usableUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

type BuildOutcome =
  | { kind: "mapped"; record: ExtractedFeedRecord }
  | { kind: "invalid"; reason: FeedExtractionReasonCode };

function buildRecord(
  fieldMap: FeedFieldMap,
  read: (fieldSource: string) => string | null,
): BuildOutcome {
  const externalId = cleanValue(read(fieldMap.externalId));
  const title = cleanValue(read(fieldMap.title));
  const rawSourceUrl = cleanValue(read(fieldMap.sourceUrl));
  if (!externalId || !title || !rawSourceUrl) {
    return { kind: "invalid", reason: "required_field_missing" };
  }

  const sourceUrl = usableUrl(rawSourceUrl);
  if (!sourceUrl) return { kind: "invalid", reason: "malformed_record_url" };

  const rawApplicationUrl = fieldMap.applicationUrl
    ? cleanValue(read(fieldMap.applicationUrl))
    : null;
  // An application URL is optional; when the feed supplies one it must be
  // usable, because falling back silently would send candidates elsewhere.
  const applicationUrl = rawApplicationUrl
    ? usableUrl(rawApplicationUrl)
    : sourceUrl;
  if (!applicationUrl) {
    return { kind: "invalid", reason: "malformed_record_url" };
  }

  return {
    kind: "mapped",
    record: {
      externalId,
      title,
      location: fieldMap.location ? cleanValue(read(fieldMap.location)) : null,
      workplaceType: fieldMap.workplaceType
        ? cleanValue(read(fieldMap.workplaceType))
        : null,
      employmentType: fieldMap.employmentType
        ? cleanValue(read(fieldMap.employmentType))
        : null,
      description: fieldMap.description
        ? cleanValue(read(fieldMap.description))
        : null,
      publishedAt: fieldMap.publishedAt
        ? cleanValue(read(fieldMap.publishedAt))
        : null,
      sourceUrl,
      applicationUrl,
    },
  };
}

function collect(
  fragments: readonly unknown[],
  fieldMap: FeedFieldMap,
  readerFor: (fragment: never) => (fieldSource: string) => string | null,
): {
  records: ExtractedFeedRecord[];
  invalid: number;
  reasons: Set<FeedExtractionReasonCode>;
} {
  const records: ExtractedFeedRecord[] = [];
  const reasons = new Set<FeedExtractionReasonCode>();
  let invalid = 0;
  for (const fragment of fragments) {
    const outcome = buildRecord(fieldMap, readerFor(fragment as never));
    if (outcome.kind === "mapped") {
      records.push(outcome.record);
    } else {
      invalid += 1;
      reasons.add(outcome.reason);
    }
  }
  return { records, invalid, reasons };
}

/* ------------------------------- XML ---------------------------------- */

export function extractXmlFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): RawExtraction {
  assertPayloadSize(payload);
  const element = config.recordElement;
  if (!element) throw new EmployerFeedError("feed_malformed");

  let scan;
  try {
    scan = scanXmlRecords(payload, element, MAX_FEED_RECORDS);
  } catch (reason) {
    if (reason instanceof XmlStructureError) {
      throw new EmployerFeedError("feed_malformed");
    }
    throw reason;
  }

  const reasonCodes = new Set<FeedExtractionReasonCode>();

  // The expected root proves the employer served the document we asked for,
  // which is what separates "no open roles" from "an error page".
  const rootMatches = config.expectedRootElement
    ? scan.rootElement !== null &&
      stripNamespace(scan.rootElement) ===
        stripNamespace(config.expectedRootElement)
    : scan.rootElement !== null;
  if (!rootMatches) reasonCodes.add("root_element_unexpected");
  if (scan.truncated) reasonCodes.add("record_limit_exceeded");

  const { records, invalid, reasons } = collect(
    scan.fragments,
    config.fieldMap,
    (fragment: string) => (fieldSource) => readChildText(fragment, fieldSource),
  );
  for (const reason of reasons) reasonCodes.add(reason);

  return {
    records,
    sourceRecordCount: scan.totalRecordCount,
    mappedRecordCount: records.length,
    invalidRecordCount: invalid,
    truncated: scan.truncated,
    containerFound: rootMatches,
    providerReportedCount: null,
    reasonCodes,
  };
}

function stripNamespace(name: string): string {
  const index = name.indexOf(":");
  return (index === -1 ? name : name.slice(index + 1)).toLowerCase();
}

/* ------------------------------- JSON --------------------------------- */

function resolvePath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function scalarToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function extractJsonFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): RawExtraction {
  assertPayloadSize(payload);
  if (!config.recordsPath) throw new EmployerFeedError("feed_malformed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new EmployerFeedError("feed_malformed");
  }

  const reasonCodes = new Set<FeedExtractionReasonCode>();
  const rows = resolvePath(parsed, config.recordsPath);
  if (!Array.isArray(rows)) {
    // The named container is absent: this is not an empty feed, it is a feed
    // we could not read. Report it rather than returning zero records.
    return {
      records: [],
      sourceRecordCount: 0,
      mappedRecordCount: 0,
      invalidRecordCount: 0,
      truncated: false,
      containerFound: false,
      providerReportedCount: null,
      reasonCodes: new Set(["container_missing"]),
    };
  }

  const providerReportedCount = config.providerReportedCountPath
    ? toCount(resolvePath(parsed, config.providerReportedCountPath))
    : null;

  const truncated = rows.length > MAX_FEED_RECORDS;
  if (truncated) reasonCodes.add("record_limit_exceeded");
  const bounded = rows.slice(0, MAX_FEED_RECORDS);

  const { records, invalid, reasons } = collect(
    bounded,
    config.fieldMap,
    (row: unknown) => (fieldSource) =>
      row === null || typeof row !== "object"
        ? null
        : scalarToString(resolvePath(row, fieldSource)),
  );
  for (const reason of reasons) reasonCodes.add(reason);

  if (providerReportedCount !== null && providerReportedCount !== rows.length) {
    reasonCodes.add("provider_count_mismatch");
  }

  return {
    records,
    sourceRecordCount: rows.length,
    mappedRecordCount: records.length,
    invalidRecordCount: invalid,
    truncated,
    containerFound: true,
    providerReportedCount,
    reasonCodes,
  };
}

function toCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/* -------------------------------- CSV --------------------------------- */

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF rows. */
export function parseCsv(payload: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // After a field's closing quote, only a delimiter, row break or EOF is
  // valid — anything else (e.g. `"abc"def`) is a malformed record.
  let justClosedQuote = false;
  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (inQuotes) {
      if (character === '"') {
        if (payload[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (
      justClosedQuote &&
      character !== "," &&
      character !== "\n" &&
      character !== "\r"
    ) {
      throw new EmployerFeedError("feed_malformed");
    }
    if (character === '"' && field === "") {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      justClosedQuote = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && payload[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      justClosedQuote = false;
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (inQuotes) throw new EmployerFeedError("feed_malformed");
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function extractCsvFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): RawExtraction {
  assertPayloadSize(payload);
  const rows = parseCsv(payload);
  const header = rows[0];
  if (!header) {
    return {
      records: [],
      sourceRecordCount: 0,
      mappedRecordCount: 0,
      invalidRecordCount: 0,
      truncated: false,
      containerFound: false,
      providerReportedCount: null,
      reasonCodes: new Set(["container_missing"]),
    };
  }

  const columnIndex = new Map(
    header.map((name, index) => [name.trim().toLowerCase(), index] as const),
  );
  // A header that does not carry the mapped columns is a structural mismatch,
  // not an empty file: every row would "fail mapping" for the same reason.
  const requiredColumns = [
    config.fieldMap.externalId,
    config.fieldMap.title,
    config.fieldMap.sourceUrl,
  ];
  const headerMatches = requiredColumns.every((column) =>
    columnIndex.has(column.trim().toLowerCase()),
  );

  const reasonCodes = new Set<FeedExtractionReasonCode>();
  if (!headerMatches) reasonCodes.add("container_missing");

  const dataRows = rows.slice(1);
  const truncated = dataRows.length > MAX_FEED_RECORDS;
  if (truncated) reasonCodes.add("record_limit_exceeded");
  const bounded = dataRows.slice(0, MAX_FEED_RECORDS);

  const { records, invalid, reasons } = headerMatches
    ? collect(bounded, config.fieldMap, (cells: string[]) => (fieldSource) => {
        const index = columnIndex.get(fieldSource.trim().toLowerCase());
        return index === undefined ? null : (cells[index] ?? null);
      })
    : { records: [], invalid: 0, reasons: new Set<FeedExtractionReasonCode>() };
  for (const reason of reasons) reasonCodes.add(reason);

  return {
    records,
    sourceRecordCount: dataRows.length,
    mappedRecordCount: records.length,
    invalidRecordCount: invalid,
    truncated,
    containerFound: headerMatches,
    providerReportedCount: null,
    reasonCodes,
  };
}
