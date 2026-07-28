import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Text extraction from an uploaded CV.
 *
 * Three formats, all read deterministically in-process: PDF through a bundled
 * reader, DOCX by unpacking the document part it is required to contain, and
 * plain text as itself. Nothing is sent anywhere to be interpreted.
 *
 * A document that cannot be read says so. There is no partial-credit outcome
 * where an empty string is passed on as if the CV were blank — the caller
 * turns `unreadable` into a visible message asking the owner to fill the form
 * in themselves, which is the honest result.
 */

export type CvExtraction =
  { state: "parsed"; text: string } | { state: "unreadable"; note: string };

export const CV_CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
} as const;

export type CvContentType =
  (typeof CV_CONTENT_TYPES)[keyof typeof CV_CONTENT_TYPES];

/** The most text worth keeping; a CV past this is not a CV. */
const MAX_TEXT_LENGTH = 200_000;

export function isCvContentType(value: string): value is CvContentType {
  return (Object.values(CV_CONTENT_TYPES) as string[]).includes(value);
}

/**
 * Collapses the whitespace a document extractor leaves behind without losing
 * line structure — the heuristics downstream read line by line.
 */
export function normalizeExtractedText(raw: string): string {
  return (
    raw
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      // Soft hyphens and zero-width characters survive copy-paste into CVs and
      // break every word match downstream.
      .replaceAll(/[­​-‍﻿]/gu, "")
      .replaceAll(/[^\S\n]+/gu, " ")
      .replaceAll(/ *\n */gu, "\n")
      .replaceAll(/\n{3,}/gu, "\n\n")
      .trim()
      .slice(0, MAX_TEXT_LENGTH)
  );
}

/**
 * Reads `word/document.xml` out of a DOCX.
 *
 * A DOCX is a ZIP, and the only entry that matters is the main document part.
 * The central directory is walked rather than the local headers, because a
 * local header may declare sizes of zero and defer them to a data descriptor.
 */
function extractDocx(bytes: Buffer): CvExtraction {
  const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
  const CENTRAL_FILE_HEADER = 0x02014b50;

  let endOffset = -1;
  // The end record is last, but a trailing comment can push it back up to 64KB.
  for (
    let i = bytes.length - 22;
    i >= 0 && i >= bytes.length - 66_000;
    i -= 1
  ) {
    if (bytes.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      endOffset = i;
      break;
    }
  }
  if (endOffset === -1) {
    return { state: "unreadable", note: "The file is not a readable DOCX." };
  }

  const entryCount = bytes.readUInt16LE(endOffset + 10);
  let cursor = bytes.readUInt32LE(endOffset + 16);

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (cursor + 46 > bytes.length) break;
    if (bytes.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) break;

    const compressionMethod = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (name === "word/document.xml") {
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const payload = bytes.subarray(dataStart, dataStart + compressedSize);
      try {
        const xml =
          compressionMethod === 0
            ? payload.toString("utf8")
            : inflateRawSync(payload).toString("utf8");
        return { state: "parsed", text: stripDocumentXml(xml) };
      } catch {
        return {
          state: "unreadable",
          note: "The DOCX document part could not be decompressed.",
        };
      }
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return {
    state: "unreadable",
    note: "The DOCX contained no main document part.",
  };
}

/**
 * Turns WordprocessingML into plain text. Paragraph and break elements become
 * newlines before tags are dropped, so the line structure the heuristics rely
 * on survives.
 */
function stripDocumentXml(xml: string): string {
  const withBreaks = xml
    .replaceAll(/<w:p\b[^>]*\/>/gu, "\n")
    .replaceAll(/<\/w:p>/gu, "\n")
    .replaceAll(/<w:br\b[^>]*\/?>/gu, "\n")
    .replaceAll(/<w:tab\b[^>]*\/?>/gu, " ")
    .replaceAll(/<[^>]+>/gu, "");
  return decodeXmlEntities(withBreaks);
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replaceAll(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/**
 * Reads a PDF's text.
 *
 * `unpdf` carries a serverless build of the same reader browsers use, so an
 * ordinary text-bearing PDF reads correctly including its font encodings. A
 * scanned CV is an image with no text layer and legitimately returns nothing;
 * that is reported as unreadable rather than as an empty CV, because they are
 * not the same claim.
 */
async function extractPdf(bytes: Buffer): Promise<CvExtraction> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const document = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(document, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    if (!merged || merged.trim().length === 0) {
      return {
        state: "unreadable",
        note: "This PDF carries no text layer, so it is likely a scan.",
      };
    }
    return { state: "parsed", text: merged };
  } catch {
    return { state: "unreadable", note: "The PDF could not be read." };
  }
}

/** Best-effort inflate for a plain-text upload that arrived compressed. */
function decodeText(bytes: Buffer): string {
  // A .txt is overwhelmingly likely to be exactly what it says. The zlib magic
  // check exists only so a gzipped export does not land as mojibake.
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      return inflateSync(bytes).toString("utf8");
    } catch {
      return bytes.toString("utf8");
    }
  }
  return bytes.toString("utf8");
}

export async function extractCvText(
  bytes: Buffer,
  contentType: CvContentType,
): Promise<CvExtraction> {
  const result: CvExtraction =
    contentType === CV_CONTENT_TYPES.pdf
      ? await extractPdf(bytes)
      : contentType === CV_CONTENT_TYPES.docx
        ? extractDocx(bytes)
        : { state: "parsed", text: decodeText(bytes) };

  if (result.state === "unreadable") return result;

  const text = normalizeExtractedText(result.text);
  // Anything this short is not a CV that anything can be read out of.
  if (text.length < 40) {
    return {
      state: "unreadable",
      note: "Too little text could be read from this file to use it.",
    };
  }
  return { state: "parsed", text };
}
