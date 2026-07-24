import he from "he";

import {
  EmployerFeedError,
  MAX_FEED_PAYLOAD_BYTES,
  MAX_FEED_RECORDS,
  type EmployerFeedConfig,
  type ExtractedFeedRecord,
  type FeedFieldMap,
} from "./types";

/**
 * Extraction turns a feed payload into flat records. It is deliberately
 * strict and flat: the supported feed shapes are the simple job feeds
 * employers actually export (a repeated XML element with text children, a
 * JSON array of objects, or a CSV with a header row). Anything the
 * extractor does not positively recognize is dropped or fails closed —
 * extraction never guesses.
 */

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

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reads the text content of the first `<element>` child inside one record
 * fragment. Supports plain text and CDATA; entities are decoded. Nested
 * markup inside a field (rich descriptions) is returned raw for the
 * downstream HTML-to-text step.
 */
function xmlChildText(fragment: string, element: string): string | null {
  const name = escapeForPattern(element);
  const pattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "i",
  );
  const match = pattern.exec(fragment);
  if (!match) return null;
  const inner = match[1] ?? "";
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return he.decode((cdata ? (cdata[1] ?? "") : inner).trim());
}

export function extractXmlFeedRecords(
  payload: string,
  config: EmployerFeedConfig,
): ExtractedFeedRecord[] {
  assertPayloadSize(payload);
  const element = config.recordElement;
  if (!element) throw new EmployerFeedError("feed_malformed");
  const name = escapeForPattern(element);
  const recordPattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "gi",
  );
  const records: ExtractedFeedRecord[] = [];
  for (const match of payload.matchAll(recordPattern)) {
    if (records.length >= MAX_FEED_RECORDS) break;
    const fragment = match[1] ?? "";
    const record = buildRecord(config.fieldMap, (fieldSource) =>
      xmlChildText(fragment, fieldSource),
    );
    if (record) records.push(record);
  }
  if (records.length === 0 && !recordPattern.test(payload)) {
    throw new EmployerFeedError("feed_records_missing");
  }
  return records;
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
): ExtractedFeedRecord[] {
  assertPayloadSize(payload);
  if (!config.recordsPath) throw new EmployerFeedError("feed_malformed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new EmployerFeedError("feed_malformed");
  }
  const rows = resolvePath(parsed, config.recordsPath);
  if (!Array.isArray(rows)) {
    throw new EmployerFeedError("feed_records_missing");
  }
  const records: ExtractedFeedRecord[] = [];
  for (const row of rows.slice(0, MAX_FEED_RECORDS)) {
    if (row === null || typeof row !== "object") continue;
    const record = buildRecord(config.fieldMap, (fieldSource) =>
      scalarToString(resolvePath(row, fieldSource)),
    );
    if (record) records.push(record);
  }
  return records;
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
): ExtractedFeedRecord[] {
  assertPayloadSize(payload);
  const rows = parseCsv(payload);
  const header = rows[0];
  if (!header || rows.length < 2) {
    throw new EmployerFeedError("feed_records_missing");
  }
  const columnIndex = new Map(
    header.map((name, index) => [name.trim().toLowerCase(), index] as const),
  );
  const records: ExtractedFeedRecord[] = [];
  for (const cells of rows.slice(1, MAX_FEED_RECORDS + 1)) {
    const record = buildRecord(config.fieldMap, (fieldSource) => {
      const index = columnIndex.get(fieldSource.trim().toLowerCase());
      return index === undefined ? null : (cells[index] ?? null);
    });
    if (record) records.push(record);
  }
  return records;
}
