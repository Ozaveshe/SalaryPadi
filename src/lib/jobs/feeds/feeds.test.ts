import { describe, expect, it } from "vitest";

import { normalizeAtsImportRecords } from "@/lib/jobs/ats-import";

import registryFile from "../../../../config/employer-feed-registry.json";
import {
  employerFeedConfigSchema,
  extractEmployerFeedRecords,
  parseCsv,
  parseEmployerFeedRegistry,
  type EmployerFeedConfig,
} from "./index";

const checkedAt = "2026-07-24T12:00:00.000Z";

function xmlConfig(
  overrides: Partial<EmployerFeedConfig> = {},
): EmployerFeedConfig {
  return employerFeedConfigSchema.parse({
    feedKey: "acme_ng_xml",
    employerSlug: "acme-nigeria",
    employerName: "Acme Nigeria",
    kind: "xml",
    url: "https://careers.acme.example/jobs.xml",
    recordElement: "job",
    fieldMap: {
      externalId: "id",
      title: "title",
      location: "location",
      employmentType: "type",
      description: "description",
      publishedAt: "published",
      sourceUrl: "url",
    },
    allowedDestinationHosts: ["acme.example"],
    rightsBasis: "written_employer_authorization",
    rightsEvidenceRef: "test-fixture-authorization",
    authorizedAt: "2026-07-24T00:00:00.000Z",
    enabled: false,
    ...overrides,
  });
}

const XML_FIXTURE = `<?xml version="1.0"?>
<jobs>
  <job>
    <id>101</id>
    <title><![CDATA[Accountant &amp; Payroll Officer]]></title>
    <location>Lagos, Nigeria</location>
    <type>Full-time</type>
    <description><![CDATA[<p>Prepare statutory accounts.</p>]]></description>
    <published>2026-07-20T00:00:00+00:00</published>
    <url>https://careers.acme.example/jobs/101</url>
  </job>
  <job>
    <id>102</id>
    <title>Field Engineer</title>
    <location>Abuja, Nigeria</location>
    <type>Contract</type>
    <description>Maintain field equipment.</description>
    <published>2026-07-21T00:00:00+00:00</published>
    <url>https://evil.example/jobs/102</url>
  </job>
</jobs>`;

describe("employer feed registry", () => {
  it("parses the committed registry file (currently empty, no invented feeds)", () => {
    const registry = parseEmployerFeedRegistry(registryFile);
    expect(registry.feeds).toHaveLength(0);
  });

  it("refuses to enable a feed without a recorded rights basis", () => {
    expect(() =>
      xmlConfig({ enabled: true, rightsBasis: null, authorizedAt: null }),
    ).toThrow(/rights basis/);
  });
});

describe("XML feed extraction", () => {
  it("extracts records, decodes CDATA and entities, and pins destinations", () => {
    const { records, droppedDestinationCount } = extractEmployerFeedRecords(
      xmlConfig(),
      XML_FIXTURE,
      checkedAt,
    );
    expect(droppedDestinationCount).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "employer_xml_feed",
      sourceKey: "acme_ng_xml",
      employerName: "Acme Nigeria",
      externalId: "101",
      title: "Accountant & Payroll Officer",
      location: "Lagos, Nigeria",
      employmentType: "Full-time",
      sourceUrl: "https://careers.acme.example/jobs/101",
      applicationUrl: "https://careers.acme.example/jobs/101",
      checkedAt,
    });
  });

  it("flows into the shared canonical normalization pipeline", () => {
    const { records } = extractEmployerFeedRecords(
      xmlConfig(),
      XML_FIXTURE,
      checkedAt,
    );
    const result = normalizeAtsImportRecords(
      records,
      {
        sourceKey: "acme_ng_xml",
        employerName: "Acme Nigeria",
        mayStoreFullDescription: false,
      },
      new Date(checkedAt),
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      external_id: "101",
      title: "Accountant & Payroll Officer",
      employment_type: "full_time",
      eligibility: { scope: "nigeria" },
    });
    expect(result.jobs[0]?.dedup_fingerprint).toBeTruthy();
    expect(result.jobs[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when the record element never appears", () => {
    expect(() =>
      extractEmployerFeedRecords(xmlConfig(), "<jobs></jobs>", checkedAt),
    ).toThrow("feed_records_missing");
  });
});

describe("JSON feed extraction", () => {
  const config = xmlConfig({
    feedKey: "acme_ng_json",
    kind: "json",
    recordElement: undefined,
    recordsPath: "data.jobs",
    fieldMap: {
      externalId: "meta.id",
      title: "title",
      location: "location.name",
      sourceUrl: "links.self",
      applicationUrl: "links.apply",
    },
  });

  it("resolves dot paths and coerces numeric identifiers", () => {
    const payload = JSON.stringify({
      data: {
        jobs: [
          {
            meta: { id: 7 },
            title: "Data Analyst",
            location: { name: "Lagos, Nigeria" },
            links: {
              self: "https://careers.acme.example/jobs/7",
              apply: "https://careers.acme.example/jobs/7/apply",
            },
          },
          { title: "No identifier" },
        ],
      },
    });
    const { records } = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "employer_json_feed",
      externalId: "7",
      applicationUrl: "https://careers.acme.example/jobs/7/apply",
    });
  });

  it("fails closed on malformed JSON and a missing record array", () => {
    expect(() =>
      extractEmployerFeedRecords(config, "not json", checkedAt),
    ).toThrow("feed_malformed");
    expect(() => extractEmployerFeedRecords(config, "{}", checkedAt)).toThrow(
      "feed_records_missing",
    );
  });
});

describe("CSV import extraction", () => {
  const config = xmlConfig({
    feedKey: "acme_ng_csv",
    kind: "csv",
    url: null,
    recordElement: undefined,
    fieldMap: {
      externalId: "Reference",
      title: "Job Title",
      location: "Location",
      sourceUrl: "Posting URL",
    },
  });

  it("parses quoted fields, escaped quotes and CRLF rows", () => {
    const rows = parseCsv(
      'a,"b ""quoted"", still b",c\r\nd,"line\nbreak",f\r\n',
    );
    expect(rows).toEqual([
      ["a", 'b "quoted", still b', "c"],
      ["d", "line\nbreak", "f"],
    ]);
  });

  it("maps header names case-insensitively into records", () => {
    const payload = [
      "Reference,Job Title,Location,Posting URL",
      'ACME-9,"Warehouse Supervisor","Kano, Nigeria",https://careers.acme.example/jobs/9',
    ].join("\n");
    const { records } = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "employer_csv_import",
      externalId: "ACME-9",
      title: "Warehouse Supervisor",
      location: "Kano, Nigeria",
    });
  });

  it("fails closed on an unterminated quote and a header-only file", () => {
    expect(() =>
      extractEmployerFeedRecords(config, 'a,"unterminated', checkedAt),
    ).toThrow("feed_malformed");
    expect(() =>
      extractEmployerFeedRecords(config, "Reference,Job Title", checkedAt),
    ).toThrow("feed_records_missing");
  });
});
