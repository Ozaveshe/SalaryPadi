import { readFlatXmlFeed, XmlParseError } from "./xml";
import {
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  MAX_FEED_RECORDS,
  type EmployerFeedConfig,
  type ExtractedFeedRecord,
  type FeedFieldMap,
} from "./types";

/**
 * Extraction turns a feed payload into flat records plus the metadata the
 * runtime needs to decide whether a snapshot may be treated as COMPLETE.
 *
 * Two rules drive the design:
 *
 * 1. Never truncate silently. Exceeding the record cap fails the extraction
 *    instead of slicing, because a sliced feed looks exactly like a feed
 *    whose tail of jobs was closed.
 * 2. Never conflate "zero records" with "could not read records". An
 *    authoritative zero has to be positively proven (a well-formed document
 *    with a confirmed container and no records); anything else is a failure.
 */

export interface ExtractionResult {
  records: ExtractedFeedRecord[];
  /** Record containers the document actually presented. */
  sourceRecordCount: number;
  /** Records that produced a usable flat record. */
  parsedRecordCount: number;
  /** Records dropped because a required field was missing/unusable. */
  invalidRecordCount: number;
  /** Always false here — the extractors throw rather than truncate. */
  truncated: boolean;
  /** The document structure was fully understood and closed cleanly. */
  parseComplete: boolean;
  /** A proven, structurally valid zero-record document. */
  authoritativeEmpty: boolean;
  /** Machine-readable notes for operators; never shown publicly. */
  warnings: string[];
}

function assertPayloadSize(payload: string) {
  // Measured in UTF-8 bytes, not UTF-16 string length.
  if (Buffer.byteLength(payload, "utf8") > MAX_FEED_PAYLOAD_BYTES) {
    throw new EmployerFeedError("feed_payload_too_large");
  }
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildRecord(
  fieldMap: FeedFieldMap,
  read: (fieldSource: string) => string | null,
): ExtractedFeedRecord | null {
  const externalId = cleanValue(read(fieldMap.externalId));
  const title = cleanValue(read(fieldMap.title));
  const sourceUrl = cleanValue(read(fieldMap.sourceUrl));
  if (!externalId || !title || !sourceUrl) return null;
  const applicationUrl = fieldMap.applicationUrl
    ? (cleanValue(read(fieldMap.applicationUrl)) ?? sourceUrl)
    : sourceUrl;
  return {
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
  };
}

/* ------------------------------- XML ---------------------------------- */

export function extractXmlFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): ExtractionResult {
  assertPayloadSize(payload);
  const recordElement = config.recordElement;
  const expectedRootElement = config.expectedRootElement;
  if (!recordElement || !expectedRootElement) {
    throw new EmployerFeedError("feed_malformed");
  }

  let read;
  try {
    read = readFlatXmlFeed(payload, {
      expectedRootElement,
      recordElement,
      maxRecords: MAX_FEED_RECORDS,
      allowNamespacePrefixes: config.allowNamespacePrefixes === true,
    });
  } catch (error) {
    if (error instanceof XmlParseError) {
      // A record cap breach is a distinct, explicit outcome.
      if (error.code === "xml_records_exceeded") {
        throw new EmployerFeedError("feed_record_limit_exceeded");
      }
      throw new EmployerFeedError("feed_malformed");
    }
    throw error;
  }

  const records: ExtractedFeedRecord[] = [];
  let invalidRecordCount = 0;
  for (const raw of read.records) {
    const record = buildRecord(
      config.fieldMap,
      (fieldSource) => raw.fields.get(fieldSource) ?? null,
    );
    if (record) records.push(record);
    else invalidRecordCount += 1;
  }

  return {
    records,
    sourceRecordCount: read.recordElementCount,
    parsedRecordCount: records.length,
    invalidRecordCount,
    truncated: false,
    parseComplete: read.parseComplete,
    // A confirmed root with no record elements at all is a real zero.
    authoritativeEmpty: read.parseComplete && read.recordElementCount === 0,
    warnings: invalidRecordCount > 0 ? ["xml_invalid_records"] : [],
  };
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
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function extractJsonFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): ExtractionResult {
  assertPayloadSize(payload);
  if (!config.recordsPath) throw new EmployerFeedError("feed_malformed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new EmployerFeedError("feed_malformed");
  }
  const rows = resolvePath(parsed, config.recordsPath);
  // A missing container is NOT an empty feed: it usually means the provider
  // changed shape. Only an existing array can be an authoritative zero.
  if (!Array.isArray(rows)) {
    throw new EmployerFeedError("feed_records_missing");
  }
  if (rows.length > MAX_FEED_RECORDS) {
    throw new EmployerFeedError("feed_record_limit_exceeded");
  }

  const records: ExtractedFeedRecord[] = [];
  let invalidRecordCount = 0;
  for (const row of rows) {
    if (row === null || typeof row !== "object") {
      invalidRecordCount += 1;
      continue;
    }
    const record = buildRecord(config.fieldMap, (fieldSource) =>
      scalarToString(resolvePath(row, fieldSource)),
    );
    if (record) records.push(record);
    else invalidRecordCount += 1;
  }

  return {
    records,
    sourceRecordCount: rows.length,
    parsedRecordCount: records.length,
    invalidRecordCount,
    truncated: false,
    parseComplete: true,
    authoritativeEmpty: rows.length === 0,
    warnings: invalidRecordCount > 0 ? ["json_invalid_records"] : [],
  };
}

/* -------------------------------- CSV --------------------------------- */

/** Strict RFC 4180 parser: rejects characters after a closing quote. */
export function parseCsv(payload: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
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
): ExtractionResult {
  assertPayloadSize(payload);
  const rows = parseCsv(payload);
  const header = rows[0];
  if (!header) throw new EmployerFeedError("feed_records_missing");

  // The header must contain every required mapped column, otherwise this is a
  // shape change, not an empty feed.
  const columnIndex = new Map(
    header.map((name, index) => [name.trim().toLowerCase(), index] as const),
  );
  const required = [
    config.fieldMap.externalId,
    config.fieldMap.title,
    config.fieldMap.sourceUrl,
  ];
  for (const column of required) {
    if (!columnIndex.has(column.trim().toLowerCase())) {
      throw new EmployerFeedError("feed_records_missing");
    }
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_FEED_RECORDS) {
    throw new EmployerFeedError("feed_record_limit_exceeded");
  }

  const records: ExtractedFeedRecord[] = [];
  let invalidRecordCount = 0;
  for (const cells of dataRows) {
    const record = buildRecord(config.fieldMap, (fieldSource) => {
      const index = columnIndex.get(fieldSource.trim().toLowerCase());
      return index === undefined ? null : (cells[index] ?? null);
    });
    if (record) records.push(record);
    else invalidRecordCount += 1;
  }

  return {
    records,
    sourceRecordCount: dataRows.length,
    parsedRecordCount: records.length,
    invalidRecordCount,
    truncated: false,
    parseComplete: true,
    // A valid header with no data rows is only an authoritative zero when the
    // feed's authorization explicitly permits empty snapshots.
    authoritativeEmpty:
      dataRows.length === 0 && config.allowAuthoritativeEmpty === true,
    warnings: invalidRecordCount > 0 ? ["csv_invalid_records"] : [],
  };
}
