import { describe, expect, it } from "vitest";

import { normalizeAtsImportRecords } from "@/lib/jobs/ats-import";

import registryFile from "../../../../config/employer-feed-registry.json";
import {
  employerFeedConfigSchema,
  extractEmployerFeedRecords,
  isAuthorizedDestination,
  isValidDestinationHost,
  MAX_FEED_RECORDS,
  parseCsv,
  parseEmployerFeedRegistry,
  registrableDomain,
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
    expectedRootElement: "jobs",
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

  it("refuses an expiry that precedes its own authorization date", () => {
    expect(() =>
      xmlConfig({
        authorizedAt: "2026-07-24T00:00:00.000Z",
        authorizationExpiresAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toThrow(/expiry must follow/);
  });

  it("requires an expected root before permitting authoritative empty XML", () => {
    expect(() =>
      xmlConfig({
        allowAuthoritativeEmpty: true,
        expectedRootElement: undefined,
      }),
    ).toThrow(/expected root element/);
  });
});

describe("destination host validation (real public suffix list)", () => {
  it("rejects genuine public suffixes the old curated table accepted", () => {
    for (const host of [
      "com",
      "co.uk",
      "com.ng",
      "com.au",
      "co.jp",
      "com.br",
      "co.in",
      "org.au",
    ]) {
      expect(isValidDestinationHost(host), host).toBe(false);
    }
  });

  it("rejects IP literals, localhost and malformed hosts", () => {
    for (const host of [
      "127.0.0.1",
      "192.168.1.10",
      "localhost",
      "not a host",
      "https://acme.example",
      "acme.example:443",
    ]) {
      expect(isValidDestinationHost(host), host).toBe(false);
    }
  });

  it("accepts registrable domains, including under multi-label suffixes", () => {
    expect(registrableDomain("acme.com")).toBe("acme.com");
    expect(registrableDomain("careers.acme.com")).toBe("acme.com");
    expect(registrableDomain("kuda.com.ng")).toBe("kuda.com.ng");
    expect(registrableDomain("jobs.employer.com.au")).toBe("employer.com.au");
  });

  it("never lets one employer's authorization cover a lookalike domain", () => {
    const allowed = ["employer.com"];
    expect(isAuthorizedDestination("https://employer.com/j/1", allowed)).toBe(
      true,
    );
    expect(
      isAuthorizedDestination("https://careers.employer.com/j/1", allowed),
    ).toBe(true);
    // The critical case: suffix string matching would have accepted this.
    expect(
      isAuthorizedDestination("https://not-employer.com/j/1", allowed),
    ).toBe(false);
    expect(
      isAuthorizedDestination("https://employer.com.evil.io/j/1", allowed),
    ).toBe(false);
  });

  it("rejects non-https, credentialed and off-port destinations", () => {
    const allowed = ["employer.com"];
    expect(isAuthorizedDestination("http://employer.com/j", allowed)).toBe(
      false,
    );
    expect(isAuthorizedDestination("https://u:p@employer.com/j", allowed)).toBe(
      false,
    );
    expect(
      isAuthorizedDestination("https://employer.com:8443/j", allowed),
    ).toBe(false);
  });
});

describe("XML feed extraction", () => {
  it("extracts records, decodes CDATA and entities, and pins destinations", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig(),
      XML_FIXTURE,
      checkedAt,
    );
    expect(result.destinationDroppedCount).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.sourceRecordCount).toBe(2);
    expect(result.mappedRecordCount).toBe(2);
    expect(result.invalidRecordCount).toBe(0);
    expect(result.containerFound).toBe(true);
    expect(result.reasonCodes).toContain("destination_not_authorized");
    expect(result.records[0]).toMatchObject({
      provider: "employer_xml_feed",
      sourceKey: "acme_ng_xml",
      employerName: "Acme Nigeria",
      externalId: "101",
      title: "Accountant & Payroll Officer",
      location: "Lagos, Nigeria",
      employmentType: "Full-time",
      sourceUrl: "https://careers.acme.example/jobs/101",
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
    expect(result.jobs[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("counts a record whose required field is missing instead of dropping it", () => {
    const payload = `<jobs><job><id>1</id><url>https://careers.acme.example/1</url></job></jobs>`;
    const result = extractEmployerFeedRecords(xmlConfig(), payload, checkedAt);
    expect(result.sourceRecordCount).toBe(1);
    expect(result.invalidRecordCount).toBe(1);
    expect(result.mappedRecordCount).toBe(0);
    expect(result.reasonCodes).toContain("required_field_missing");
  });

  it("counts a record whose URL is unusable instead of dropping it", () => {
    const payload = `<jobs><job><id>1</id><title>Role</title><url>not-a-url</url></job></jobs>`;
    const result = extractEmployerFeedRecords(xmlConfig(), payload, checkedAt);
    expect(result.invalidRecordCount).toBe(1);
    expect(result.reasonCodes).toContain("malformed_record_url");
  });

  it("reports an unexpected root element rather than an empty feed", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig(),
      "<error><message>Service unavailable</message></error>",
      checkedAt,
    );
    expect(result.containerFound).toBe(false);
    expect(result.reasonCodes).toContain("root_element_unexpected");
  });

  it("resolves namespaced elements against unprefixed field names", () => {
    const payload = `<ns:jobs xmlns:ns="urn:x"><ns:job><ns:id>7</ns:id><ns:title>Role</ns:title><ns:url>https://careers.acme.example/7</ns:url></ns:job></ns:jobs>`;
    const result = extractEmployerFeedRecords(xmlConfig(), payload, checkedAt);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.externalId).toBe("7");
  });
});

describe("XML parser refuses unsafe constructs", () => {
  const billionLaughs = `<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<jobs><job><id>&lol2;</id><title>x</title><url>https://careers.acme.example/1</url></job></jobs>`;

  it("fails closed on a DTD rather than expanding entities", () => {
    expect(() =>
      extractEmployerFeedRecords(xmlConfig(), billionLaughs, checkedAt),
    ).toThrow("feed_malformed");
  });

  it("fails closed on an entity declaration", () => {
    expect(() =>
      extractEmployerFeedRecords(
        xmlConfig(),
        `<!ENTITY x "y"><jobs></jobs>`,
        checkedAt,
      ),
    ).toThrow("feed_malformed");
  });

  it("fails closed on an unresolvable custom entity reference", () => {
    expect(() =>
      extractEmployerFeedRecords(
        xmlConfig(),
        `<jobs><job><id>&custom;</id><title>x</title><url>https://careers.acme.example/1</url></job></jobs>`,
        checkedAt,
      ),
    ).toThrow("feed_malformed");
  });

  it("fails closed on an unterminated record element", () => {
    expect(() =>
      extractEmployerFeedRecords(
        xmlConfig(),
        `<jobs><job><id>1</id><title>x</title>`,
        checkedAt,
      ),
    ).toThrow("feed_malformed");
  });

  it("still decodes the five predefined entities and numeric references", () => {
    const payload = `<jobs><job><id>1</id><title>R&amp;D &#65;nalyst</title><url>https://careers.acme.example/1</url></job></jobs>`;
    const result = extractEmployerFeedRecords(xmlConfig(), payload, checkedAt);
    expect(result.records[0]?.title).toBe("R&D Analyst");
  });
});

describe("JSON feed extraction", () => {
  const config = xmlConfig({
    feedKey: "acme_ng_json",
    kind: "json",
    recordElement: undefined,
    expectedRootElement: undefined,
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
    const result = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(result.records).toHaveLength(1);
    expect(result.sourceRecordCount).toBe(2);
    expect(result.invalidRecordCount).toBe(1);
    expect(result.records[0]).toMatchObject({
      provider: "employer_json_feed",
      externalId: "7",
      applicationUrl: "https://careers.acme.example/jobs/7/apply",
    });
  });

  it("reports a missing container rather than an empty feed", () => {
    const result = extractEmployerFeedRecords(config, "{}", checkedAt);
    expect(result.containerFound).toBe(false);
    expect(result.sourceRecordCount).toBe(0);
    expect(result.reasonCodes).toContain("container_missing");
  });

  it("fails closed on malformed JSON", () => {
    expect(() =>
      extractEmployerFeedRecords(config, "not json", checkedAt),
    ).toThrow("feed_malformed");
  });

  it("flags a provider-reported count that disagrees with what was seen", () => {
    const counted = xmlConfig({
      ...config,
      providerReportedCountPath: "meta.total",
    } as Partial<EmployerFeedConfig>);
    const payload = JSON.stringify({
      meta: { total: 9 },
      data: {
        jobs: [
          {
            meta: { id: 1 },
            title: "Role",
            links: { self: "https://careers.acme.example/1" },
          },
        ],
      },
    });
    const result = extractEmployerFeedRecords(counted, payload, checkedAt);
    expect(result.providerReportedCount).toBe(9);
    expect(result.reasonCodes).toContain("provider_count_mismatch");
  });
});

describe("CSV import extraction", () => {
  const config = xmlConfig({
    feedKey: "acme_ng_csv",
    kind: "csv",
    url: null,
    recordElement: undefined,
    expectedRootElement: undefined,
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
    const result = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(result.records).toHaveLength(1);
    expect(result.containerFound).toBe(true);
    expect(result.records[0]).toMatchObject({
      provider: "employer_csv_import",
      externalId: "ACME-9",
      title: "Warehouse Supervisor",
    });
  });

  it("reports a header mismatch as a missing container", () => {
    const payload = [
      "Ref,Title,URL",
      "ACME-9,Supervisor,https://careers.acme.example/jobs/9",
    ].join("\n");
    const result = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(result.containerFound).toBe(false);
    expect(result.reasonCodes).toContain("container_missing");
  });

  it("fails closed on an unterminated quote", () => {
    expect(() =>
      extractEmployerFeedRecords(config, 'a,"unterminated', checkedAt),
    ).toThrow("feed_malformed");
  });
});

describe("record-limit truncation is never silent", () => {
  function xmlWith(count: number): string {
    const rows = Array.from(
      { length: count },
      (_, index) =>
        `<job><id>${index}</id><title>Role ${index}</title><url>https://careers.acme.example/jobs/${index}</url></job>`,
    ).join("");
    return `<jobs>${rows}</jobs>`;
  }

  it("reports XML truncation with a real source total", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig(),
      xmlWith(MAX_FEED_RECORDS + 1),
      checkedAt,
    );
    expect(result.truncated).toBe(true);
    expect(result.sourceRecordCount).toBe(MAX_FEED_RECORDS + 1);
    expect(result.records).toHaveLength(MAX_FEED_RECORDS);
    expect(result.reasonCodes).toContain("record_limit_exceeded");
  });

  it("reports JSON truncation with a real source total", () => {
    const config = xmlConfig({
      kind: "json",
      recordElement: undefined,
      expectedRootElement: undefined,
      recordsPath: "jobs",
      fieldMap: {
        externalId: "id",
        title: "title",
        sourceUrl: "url",
      },
    });
    const payload = JSON.stringify({
      jobs: Array.from({ length: MAX_FEED_RECORDS + 1 }, (_, index) => ({
        id: index,
        title: `Role ${index}`,
        url: `https://careers.acme.example/jobs/${index}`,
      })),
    });
    const result = extractEmployerFeedRecords(config, payload, checkedAt);
    expect(result.truncated).toBe(true);
    expect(result.sourceRecordCount).toBe(MAX_FEED_RECORDS + 1);
    expect(result.records).toHaveLength(MAX_FEED_RECORDS);
  });

  it("reports CSV truncation with a real source total", () => {
    const config = xmlConfig({
      kind: "csv",
      url: null,
      recordElement: undefined,
      expectedRootElement: undefined,
      fieldMap: { externalId: "id", title: "title", sourceUrl: "url" },
    });
    const rows = ["id,title,url"];
    for (let index = 0; index < MAX_FEED_RECORDS + 1; index += 1) {
      rows.push(
        `${index},Role ${index},https://careers.acme.example/jobs/${index}`,
      );
    }
    const result = extractEmployerFeedRecords(
      config,
      rows.join("\n"),
      checkedAt,
    );
    expect(result.truncated).toBe(true);
    expect(result.sourceRecordCount).toBe(MAX_FEED_RECORDS + 1);
    expect(result.records).toHaveLength(MAX_FEED_RECORDS);
  });
});

describe("authoritative empty versus mapping failure", () => {
  it("treats a permitted, structurally proven empty feed as authoritative", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig({ allowAuthoritativeEmpty: true }),
      "<jobs></jobs>",
      checkedAt,
    );
    expect(result.authoritativeEmpty).toBe(true);
    expect(result.containerFound).toBe(true);
    expect(result.sourceRecordCount).toBe(0);
  });

  it("refuses authoritative empty when the feed does not permit it", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig({ allowAuthoritativeEmpty: false }),
      "<jobs></jobs>",
      checkedAt,
    );
    expect(result.authoritativeEmpty).toBe(false);
    expect(result.reasonCodes).toContain("empty_not_authoritative");
  });

  it("refuses authoritative empty when every record failed mapping", () => {
    // The employer renamed <id> to <job_id>: records exist, none map.
    const payload = `<jobs><job><job_id>1</job_id><title>Role</title><url>https://careers.acme.example/1</url></job></jobs>`;
    const result = extractEmployerFeedRecords(
      xmlConfig({ allowAuthoritativeEmpty: true }),
      payload,
      checkedAt,
    );
    expect(result.authoritativeEmpty).toBe(false);
    expect(result.sourceRecordCount).toBe(1);
    expect(result.invalidRecordCount).toBe(1);
  });

  it("refuses authoritative empty when the container is missing", () => {
    const result = extractEmployerFeedRecords(
      xmlConfig({ allowAuthoritativeEmpty: true }),
      "<error/>",
      checkedAt,
    );
    expect(result.authoritativeEmpty).toBe(false);
    expect(result.containerFound).toBe(false);
  });
});
