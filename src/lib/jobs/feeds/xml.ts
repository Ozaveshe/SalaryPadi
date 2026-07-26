import he from "he";

/**
 * A bounded, non-validating XML reader for untrusted employer feeds.
 *
 * Written rather than taken from a dependency because the security properties
 * matter more than generality, and they are easier to guarantee by refusing
 * features than by configuring a general parser to disable them:
 *
 *   - No DTD processing. `<!DOCTYPE ...>` fails the document closed, which
 *     removes entity-expansion ("billion laughs") exposure entirely rather
 *     than bounding it.
 *   - No entity declarations, so no custom or external entities exist.
 *   - No external resource resolution of any kind: this reader only ever looks
 *     at the string it was given.
 *   - Only the five predefined XML entities plus numeric character references
 *     are decoded, via `he`, with a bounded output.
 *   - Bounded input (the caller enforces the byte cap) and bounded record
 *     count (the caller stops reading and records truncation).
 *
 * It is a tokenizer, not a tree builder: employer job feeds are a repeated flat
 * element with text children, and never materialising a document tree keeps
 * memory proportional to one record.
 */

/** Maximum characters accepted for a single element's text content. */
const MAX_TEXT_LENGTH = 200_000;

export class XmlStructureError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "XmlStructureError";
  }
}

/** Rejects the constructs this reader refuses to process at all. */
function assertNoProhibitedConstructs(payload: string): void {
  // A DOCTYPE is the entry point for entity declarations; refuse the document.
  if (/<!DOCTYPE/i.test(payload)) {
    throw new XmlStructureError("dtd_not_permitted");
  }
  if (/<!ENTITY/i.test(payload)) {
    throw new XmlStructureError("entity_not_permitted");
  }
  // A custom entity reference cannot resolve without a DTD, so its presence
  // means the document expects processing this reader will not perform.
  const customEntity =
    /&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});)[A-Za-z][\w.-]{0,63};/.exec(
      payload,
    );
  if (customEntity) {
    throw new XmlStructureError("custom_entity_not_permitted");
  }
}

/** Strips comments and processing instructions, preserving CDATA verbatim. */
function stripNonContent(payload: string): string {
  let output = "";
  let index = 0;
  while (index < payload.length) {
    if (payload.startsWith("<![CDATA[", index)) {
      const end = payload.indexOf("]]>", index);
      if (end === -1) throw new XmlStructureError("unterminated_cdata");
      output += payload.slice(index, end + 3);
      index = end + 3;
      continue;
    }
    if (payload.startsWith("<!--", index)) {
      const end = payload.indexOf("-->", index);
      if (end === -1) throw new XmlStructureError("unterminated_comment");
      index = end + 3;
      continue;
    }
    if (payload.startsWith("<?", index)) {
      const end = payload.indexOf("?>", index);
      if (end === -1) throw new XmlStructureError("unterminated_pi");
      index = end + 2;
      continue;
    }
    output += payload[index];
    index += 1;
  }
  return output;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The document's root element name, or null when the payload has no element.
 * Namespace prefixes are preserved so a caller can require an exact root.
 */
export function readRootElement(payload: string): string | null {
  const cleaned = stripNonContent(payload);
  const match = /<\s*([A-Za-z_][\w.:-]*)/.exec(cleaned);
  return match?.[1] ?? null;
}

/**
 * Reads the text content of the first `<element>` child within one record
 * fragment. Supports plain text and CDATA; predefined entities and numeric
 * references are decoded. Nested markup (rich descriptions) is returned raw
 * for the downstream HTML-to-text/sanitisation step, which is the only place
 * markup is interpreted.
 *
 * Namespaces: an unprefixed field name matches an unprefixed element or any
 * prefixed local name (`<job:title>` matches `title`). A field name written
 * with an explicit prefix matches only that exact prefixed element.
 */
export function readChildText(
  fragment: string,
  element: string,
): string | null {
  const name = escapeForPattern(element);
  const pattern = element.includes(":")
    ? new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}\\s*>`, "i")
    : new RegExp(
        `<(?:[A-Za-z_][\\w.-]*:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`,
        "i",
      );
  const match = pattern.exec(fragment);
  if (!match) return null;
  const inner = match[1] ?? "";
  if (inner.length > MAX_TEXT_LENGTH) {
    throw new XmlStructureError("element_text_too_large");
  }
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  const raw = cdata ? (cdata[1] ?? "") : inner;
  // `he` decodes only the predefined entities and numeric references here;
  // no custom entity can reach this point (rejected above).
  return he.decode(raw.trim());
}

export interface XmlRecordScan {
  /** Record fragments, capped at `limit`. */
  fragments: string[];
  /** True when the document held more records than `limit`. */
  truncated: boolean;
  /** The document's root element name. */
  rootElement: string | null;
  /** Total record elements present, counted even beyond `limit`. */
  totalRecordCount: number;
}

/**
 * Scans a payload for repeated `<recordElement>` fragments.
 *
 * Records beyond `limit` are counted but not materialised, so a feed larger
 * than the cap is reported as truncated with a real total rather than being
 * silently clipped into an authoritative-looking result.
 */
export function scanXmlRecords(
  payload: string,
  recordElement: string,
  limit: number,
): XmlRecordScan {
  assertNoProhibitedConstructs(payload);
  const cleaned = stripNonContent(payload);
  const rootElement = readRootElement(cleaned);

  const name = escapeForPattern(recordElement);
  const pattern = recordElement.includes(":")
    ? new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}\\s*>`, "gi")
    : new RegExp(
        `<(?:[A-Za-z_][\\w.-]*:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`,
        "gi",
      );

  const fragments: string[] = [];
  let totalRecordCount = 0;
  for (const match of cleaned.matchAll(pattern)) {
    totalRecordCount += 1;
    if (fragments.length < limit) fragments.push(match[1] ?? "");
  }

  // An unclosed record element means the document was cut short. Detect it by
  // comparing opening tags against the closed fragments actually recovered.
  const openPattern = recordElement.includes(":")
    ? new RegExp(`<${name}(?:\\s[^>]*)?>`, "gi")
    : new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}(?:\\s[^>]*)?>`, "gi");
  const openCount = [...cleaned.matchAll(openPattern)].length;
  if (openCount !== totalRecordCount) {
    throw new XmlStructureError("unterminated_record_element");
  }

  return {
    fragments,
    truncated: totalRecordCount > limit,
    rootElement,
    totalRecordCount,
  };
}
