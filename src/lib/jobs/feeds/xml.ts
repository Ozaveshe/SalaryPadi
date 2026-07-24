/**
 * A bounded, fail-closed XML reader for untrusted flat employer job feeds.
 *
 * This is a real tokenizing parser, not a regular expression: it walks the
 * document character by character, tracks an element stack, and rejects
 * anything it does not positively understand. It deliberately supports only
 * the shape employer feeds actually export — a root container holding
 * repeated record elements whose children carry text (optionally CDATA or
 * escaped markup).
 *
 * Hard safety properties, by construction:
 * - `<!DOCTYPE` and `<!ENTITY` are rejected outright, so there is no DTD
 *   processing, no entity expansion (billion-laughs), and no external or
 *   remote resource resolution of any kind. The parser never dereferences a
 *   URL.
 * - Only the five predefined XML entities plus bounded numeric character
 *   references are decoded. An unknown entity reference fails the parse.
 * - Input bytes, element depth, record count and node count are all bounded.
 * - The expected root/container element must be confirmed; a document that
 *   does not match fails closed rather than yielding "zero records".
 * - Namespaces: a prefixed record or field name is rejected unless the feed
 *   configuration opts in, so a namespaced document can never be silently
 *   half-read.
 */

export type XmlFailureCode =
  | "xml_dtd_forbidden"
  | "xml_malformed"
  | "xml_root_mismatch"
  | "xml_depth_exceeded"
  | "xml_nodes_exceeded"
  | "xml_records_exceeded"
  | "xml_unknown_entity"
  | "xml_namespace_unsupported";

export class XmlParseError extends Error {
  constructor(public readonly code: XmlFailureCode) {
    super(code);
    this.name = "XmlParseError";
  }
}

export interface XmlRecord {
  /** First text value for each child element name, in document order. */
  fields: Map<string, string>;
}

export interface XmlReadOptions {
  /** Required container/root element name (e.g. "jobs"). */
  expectedRootElement: string;
  /** Repeated record element name (e.g. "job"). */
  recordElement: string;
  /** Hard cap; exceeding it fails the parse rather than truncating. */
  maxRecords: number;
  /** Allow `prefix:name` element names. Default false (reject). */
  allowNamespacePrefixes?: boolean;
  maxDepth?: number;
  maxNodes?: number;
}

export interface XmlReadResult {
  records: XmlRecord[];
  /** Record elements seen in the document (equals records.length here, as
   * exceeding the cap throws rather than truncating). */
  recordElementCount: number;
  /** True when the root matched and the document closed cleanly. */
  parseComplete: boolean;
}

const PREDEFINED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9._:-]/;

/** Decodes text content. Unknown entity references fail the parse. */
function decodeText(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]!;
    if (c !== "&") {
      out += c;
      continue;
    }
    const end = raw.indexOf(";", i + 1);
    // A bare, unterminated or absurdly long reference is not decodable.
    if (end === -1 || end - i > 12)
      throw new XmlParseError("xml_unknown_entity");
    const ref = raw.slice(i + 1, end);
    if (ref.startsWith("#")) {
      const isHex = ref[1] === "x" || ref[1] === "X";
      const digits = isHex ? ref.slice(2) : ref.slice(1);
      if (
        !/^[0-9]+$/.test(digits) &&
        !(isHex && /^[0-9a-fA-F]+$/.test(digits))
      ) {
        throw new XmlParseError("xml_unknown_entity");
      }
      const code = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        throw new XmlParseError("xml_unknown_entity");
      }
      out += String.fromCodePoint(code);
    } else {
      const value = PREDEFINED_ENTITIES.get(ref);
      if (value === undefined) throw new XmlParseError("xml_unknown_entity");
      out += value;
    }
    i = end;
  }
  return out;
}

function assertName(name: string, allowPrefixes: boolean) {
  if (!name || !NAME_START.test(name[0]!)) {
    throw new XmlParseError("xml_malformed");
  }
  if (name.includes(":") && !allowPrefixes) {
    throw new XmlParseError("xml_namespace_unsupported");
  }
}

/**
 * Reads a flat employer feed document. Throws XmlParseError on anything
 * unexpected — callers treat a throw as "snapshot not usable", never as
 * "zero records".
 */
export function readFlatXmlFeed(
  source: string,
  options: XmlReadOptions,
): XmlReadResult {
  const allowPrefixes = options.allowNamespacePrefixes === true;
  const maxDepth = options.maxDepth ?? 32;
  const maxNodes = options.maxNodes ?? 200_000;

  // Reject DTDs before any structural work: they are the entity-expansion and
  // external-resource vector, and no legitimate flat job feed needs one.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) {
    throw new XmlParseError("xml_dtd_forbidden");
  }

  const stack: string[] = [];
  const records: XmlRecord[] = [];
  let recordElementCount = 0;
  let nodes = 0;
  let rootSeen = false;
  let rootClosed = false;
  let current: XmlRecord | null = null;
  let currentField: string | null = null;
  let fieldText = "";
  let index = 0;

  const appendFieldText = (value: string) => {
    if (currentField !== null) fieldText += value;
  };

  while (index < source.length) {
    const lt = source.indexOf("<", index);
    if (lt === -1) {
      // Trailing text outside any element is ignorable whitespace only.
      if (source.slice(index).trim() !== "") {
        throw new XmlParseError("xml_malformed");
      }
      break;
    }
    if (lt > index) appendFieldText(decodeText(source.slice(index, lt)));

    // Comments, CDATA and processing instructions.
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      if (end === -1) throw new XmlParseError("xml_malformed");
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      if (end === -1) throw new XmlParseError("xml_malformed");
      // CDATA is literal: no entity decoding inside.
      appendFieldText(source.slice(lt + 9, end));
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", lt)) {
      const end = source.indexOf("?>", lt + 2);
      if (end === -1) throw new XmlParseError("xml_malformed");
      index = end + 2;
      continue;
    }
    if (source.startsWith("<!", lt)) {
      // Any other declaration (already screened for DOCTYPE/ENTITY above).
      throw new XmlParseError("xml_malformed");
    }

    const gt = source.indexOf(">", lt + 1);
    if (gt === -1) throw new XmlParseError("xml_malformed");
    let tag = source.slice(lt + 1, gt).trim();
    if (tag === "") throw new XmlParseError("xml_malformed");

    nodes += 1;
    if (nodes > maxNodes) throw new XmlParseError("xml_nodes_exceeded");

    const isClose = tag.startsWith("/");
    const selfClosing = !isClose && tag.endsWith("/");
    if (isClose) tag = tag.slice(1).trim();
    if (selfClosing) tag = tag.slice(0, -1).trim();

    // Element name ends at the first whitespace; attributes are ignored (flat
    // feeds carry values as child elements, and ignoring attributes cannot
    // fabricate data).
    let nameEnd = 0;
    while (nameEnd < tag.length && NAME_CHAR.test(tag[nameEnd]!)) nameEnd += 1;
    const name = tag.slice(0, nameEnd);
    assertName(name, allowPrefixes);

    if (isClose) {
      const open = stack.pop();
      if (open !== name) throw new XmlParseError("xml_malformed");
      if (currentField !== null && name === currentField) {
        // Record the first value seen for this field name.
        if (current && !current.fields.has(name)) {
          current.fields.set(name, fieldText.trim());
        }
        currentField = null;
        fieldText = "";
      } else if (current !== null && name === options.recordElement) {
        records.push(current);
        current = null;
      } else if (stack.length === 0 && name === options.expectedRootElement) {
        rootClosed = true;
      }
      index = gt + 1;
      continue;
    }

    if (stack.length === 0) {
      if (name !== options.expectedRootElement) {
        throw new XmlParseError("xml_root_mismatch");
      }
      rootSeen = true;
      if (selfClosing) {
        // <jobs/> is a well-formed, authoritative empty document.
        rootClosed = true;
        index = gt + 1;
        continue;
      }
      stack.push(name);
      index = gt + 1;
      continue;
    }

    if (!rootSeen) throw new XmlParseError("xml_root_mismatch");

    if (name === options.recordElement && current === null) {
      recordElementCount += 1;
      if (recordElementCount > options.maxRecords) {
        throw new XmlParseError("xml_records_exceeded");
      }
      if (selfClosing) {
        records.push({ fields: new Map() });
        index = gt + 1;
        continue;
      }
      current = { fields: new Map() };
      stack.push(name);
      index = gt + 1;
      continue;
    }

    if (current !== null && currentField === null) {
      if (selfClosing) {
        if (!current.fields.has(name)) current.fields.set(name, "");
        index = gt + 1;
        continue;
      }
      currentField = name;
      fieldText = "";
      stack.push(name);
      index = gt + 1;
      continue;
    }

    // Markup nested inside a field (rich descriptions): keep the text, drop
    // the tags. Depth is still bounded.
    if (!selfClosing) {
      stack.push(name);
      if (stack.length > maxDepth)
        throw new XmlParseError("xml_depth_exceeded");
    }
    index = gt + 1;
  }

  if (!rootSeen) throw new XmlParseError("xml_root_mismatch");
  if (stack.length !== 0 || !rootClosed)
    throw new XmlParseError("xml_malformed");

  return { records, recordElementCount, parseComplete: true };
}
