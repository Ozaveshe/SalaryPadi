import { describe, expect, it } from "vitest";

import { readFlatXmlFeed, XmlParseError } from "./xml";

const options = {
  expectedRootElement: "jobs",
  recordElement: "job",
  maxRecords: 10,
};

function read(source: string, overrides: Partial<typeof options> = {}) {
  return readFlatXmlFeed(source, { ...options, ...overrides });
}

describe("bounded XML feed parser", () => {
  it("reads flat records and their first field values", () => {
    const result = read(
      "<jobs><job><id>1</id><title>Engineer</title></job>" +
        "<job><id>2</id><title>Analyst</title></job></jobs>",
    );
    expect(result.records).toHaveLength(2);
    expect(result.recordElementCount).toBe(2);
    expect(result.parseComplete).toBe(true);
    expect(result.records[0]!.fields.get("title")).toBe("Engineer");
    expect(result.records[1]!.fields.get("id")).toBe("2");
  });

  it("decodes predefined and numeric entities in text", () => {
    const result = read(
      "<jobs><job><id>1</id><title>R&amp;D &lt;lead&gt; &#65;</title></job></jobs>",
    );
    expect(result.records[0]!.fields.get("title")).toBe("R&D <lead> A");
  });

  it("treats CDATA as literal text and keeps nested markup as text", () => {
    const result = read(
      "<jobs><job><id>1</id><title><![CDATA[A & B]]></title>" +
        "<desc><p>Build <b>things</b></p></desc></job></jobs>",
    );
    // Per the XML spec, CDATA content is not entity-decoded.
    expect(result.records[0]!.fields.get("title")).toBe("A & B");
    // Nested markup inside a field keeps its text and drops the tags.
    expect(result.records[0]!.fields.get("desc")).toContain("Build");
    expect(result.records[0]!.fields.get("desc")).not.toContain("<b>");
  });

  it("confirms an empty container instead of guessing", () => {
    const empty = read("<jobs></jobs>");
    expect(empty.recordElementCount).toBe(0);
    expect(empty.parseComplete).toBe(true);
    const selfClosed = read("<jobs/>");
    expect(selfClosed.parseComplete).toBe(true);
  });

  it("rejects DTDs and entity declarations outright", () => {
    const billion =
      '<!DOCTYPE lolz [<!ENTITY lol "lol">]><jobs><job><id>1</id></job></jobs>';
    expect(() => read(billion)).toThrow(XmlParseError);
    try {
      read(billion);
    } catch (error) {
      expect((error as XmlParseError).code).toBe("xml_dtd_forbidden");
    }
  });

  it("rejects an unknown entity reference rather than dropping it", () => {
    expect(() => read("<jobs><job><id>&nbsp;</id></job></jobs>")).toThrow(
      XmlParseError,
    );
  });

  it("rejects a wrong root container", () => {
    try {
      read("<vacancies><job><id>1</id></job></vacancies>");
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as XmlParseError).code).toBe("xml_root_mismatch");
    }
  });

  it("fails closed on malformed and unclosed documents", () => {
    expect(() => read("<jobs><job><id>1</id>")).toThrow(XmlParseError);
    expect(() => read("<jobs><job></wrong></job></jobs>")).toThrow(
      XmlParseError,
    );
    expect(() => read("not xml at all")).toThrow(XmlParseError);
  });

  it("rejects namespace prefixes unless explicitly allowed", () => {
    const doc = "<jobs><ns:job><id>1</id></ns:job></jobs>";
    try {
      read(doc);
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as XmlParseError).code).toBe("xml_namespace_unsupported");
    }
    expect(() => read(doc, { recordElement: "ns:job" } as never)).toThrow(
      XmlParseError,
    );
  });

  it("refuses to truncate: exceeding the record cap throws", () => {
    const many = Array.from(
      { length: 11 },
      (_, i) => `<job><id>${i}</id></job>`,
    ).join("");
    try {
      read(`<jobs>${many}</jobs>`);
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as XmlParseError).code).toBe("xml_records_exceeded");
    }
  });

  it("bounds node count and depth", () => {
    expect(() =>
      read("<jobs><job><id>1</id></job></jobs>", { maxNodes: 2 } as never),
    ).toThrow(XmlParseError);
  });
});
