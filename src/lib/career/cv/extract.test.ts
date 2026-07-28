import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  CV_CONTENT_TYPES,
  extractCvText,
  isCvContentType,
  normalizeExtractedText,
} from "./extract";

/**
 * Builds the smallest ZIP a DOCX reader has to accept: one stored-or-deflated
 * `word/document.xml` entry reachable through the central directory.
 */
function buildDocx(documentXml: string): Buffer {
  const name = Buffer.from("word/document.xml", "utf8");
  const uncompressed = Buffer.from(documentXml, "utf8");
  const compressed = deflateRawSync(uncompressed);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(8, 8); // deflate
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(uncompressed.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const local = Buffer.concat([localHeader, name, compressed]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(8, 10); // deflate
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(uncompressed.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(0, 42); // local header offset

  const central = Buffer.concat([centralHeader, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);

  return Buffer.concat([local, central, end]);
}

describe("CV text extraction", () => {
  it("accepts only the three formats the bucket accepts", () => {
    expect(isCvContentType(CV_CONTENT_TYPES.pdf)).toBe(true);
    expect(isCvContentType(CV_CONTENT_TYPES.docx)).toBe(true);
    expect(isCvContentType("image/png")).toBe(false);
  });

  it("reads a DOCX main document part, keeping paragraph breaks", async () => {
    const docx = buildDocx(
      "<w:document><w:body>" +
        "<w:p><w:r><w:t>Amaka Okafor</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Senior Backend Engineer with 7 years of experience</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>TypeScript &amp; PostgreSQL</w:t></w:r></w:p>" +
        "</w:body></w:document>",
    );

    const result = await extractCvText(docx, CV_CONTENT_TYPES.docx);

    expect(result.state).toBe("parsed");
    if (result.state !== "parsed") return;
    expect(result.text).toContain("Amaka Okafor");
    expect(result.text).toContain("TypeScript & PostgreSQL");
    expect(result.text.split("\n").length).toBeGreaterThan(1);
  });

  it("reports an unreadable file rather than an empty CV", async () => {
    const result = await extractCvText(
      Buffer.from("not a zip at all"),
      CV_CONTENT_TYPES.docx,
    );

    expect(result.state).toBe("unreadable");
    if (result.state !== "unreadable") return;
    expect(result.note).toMatch(/DOCX/);
  });

  it("treats a nearly empty document as unreadable, not as a blank CV", async () => {
    const result = await extractCvText(
      Buffer.from("hi", "utf8"),
      CV_CONTENT_TYPES.txt,
    );

    expect(result.state).toBe("unreadable");
  });

  it("reads plain text as itself", async () => {
    const text =
      "Chidi Eze\nProduct Manager\n5 years of experience shipping software in Lagos.";
    const result = await extractCvText(
      Buffer.from(text, "utf8"),
      CV_CONTENT_TYPES.txt,
    );

    expect(result.state).toBe("parsed");
    if (result.state !== "parsed") return;
    expect(result.text).toContain("Product Manager");
  });

  it("collapses whitespace without losing line structure", () => {
    expect(normalizeExtractedText("a  \t b\r\n\r\n\r\n c ")).toBe("a b\n\nc");
  });
});
