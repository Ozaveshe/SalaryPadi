import { describe, expect, it, vi } from "vitest";

import {
  AtsAdapterError,
  type AtsAdapterErrorCode,
  type AtsAuthorizedSource,
  type AtsDisabledSource,
  type AtsFetch,
  buildAshbyEndpoint,
  buildAtsEndpoint,
  buildGreenhouseEndpoint,
  buildLeverEndpoint,
  buildWorkableEndpoint,
  fetchAtsSourceRecords,
} from "./index";

const requestedAt = new Date("2026-07-10T12:00:00.000Z");

function signal() {
  return AbortSignal.timeout(30_000);
}

function authorization(
  allowedDestinations: Array<{
    host: string;
    pathPrefixes?: string[];
  }> = [],
) {
  return {
    kind: "employer" as const,
    authorizedBy: "Example employer operations",
    reviewedAt: "2026-07-10T10:00:00.000Z",
    expiresAt: null,
    evidenceReference: "approval-ticket-123",
    allowedDestinations,
  };
}

function greenhouseSource(): AtsAuthorizedSource<"greenhouse"> {
  return {
    key: "greenhouse-example",
    employerName: "Example Employer",
    provider: "greenhouse",
    tenant: "example",
    state: "authorized",
    authorization: authorization(),
  };
}

function leverSource(
  region: "global" | "eu" = "global",
): AtsAuthorizedSource<"lever"> {
  return {
    key: "lever-example",
    employerName: "Example Employer",
    provider: "lever",
    tenant: "example",
    region,
    state: "authorized",
    authorization: authorization(),
  };
}

function ashbySource(): AtsAuthorizedSource<"ashby"> {
  return {
    key: "ashby-example",
    employerName: "Example Employer",
    provider: "ashby",
    tenant: "example",
    state: "authorized",
    authorization: authorization(),
  };
}

function workableSource(): AtsAuthorizedSource<"workable"> {
  return {
    key: "workable-example",
    employerName: "Example Employer",
    provider: "workable",
    tenant: "example",
    state: "authorized",
    authorization: authorization(),
  };
}

function workableJob(overrides: Record<string, unknown> = {}) {
  return {
    title: "Product Engineer",
    shortcode: "61C3B27064",
    code: "",
    employment_type: "Full-time",
    telecommuting: false,
    department: "Engineering",
    url: "https://apply.workable.com/j/61C3B27064",
    shortlink: "https://apply.workable.com/j/61C3B27064",
    application_url: "https://apply.workable.com/j/61C3B27064/apply",
    published_on: "2026-06-08",
    created_at: "2026-06-03",
    country: "Nigeria",
    city: "Abuja",
    state: "",
    locations: [
      {
        country: "Nigeria",
        countryCode: "NG",
        city: "Abuja",
        region: null,
        hidden: false,
      },
    ],
    ...overrides,
  };
}

function greenhouseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    internal_job_id: 456,
    title: "Product Engineer",
    updated_at: "2026-07-09T08:00:00.000Z",
    requisition_id: "ENG-123",
    location: { name: "Lagos, Nigeria" },
    absolute_url: "https://boards.greenhouse.io/example/jobs/123",
    language: "en",
    metadata: null,
    content: "<p>Build useful products.</p>",
    departments: [
      { id: 10, name: "Engineering", parent_id: null, child_ids: [] },
    ],
    offices: [],
    ...overrides,
  };
}

function leverJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "posting-123",
    text: "Product Engineer",
    categories: {
      location: "Lagos, Nigeria",
      commitment: "Full-time",
      team: "Platform",
      department: "Engineering",
      allLocations: ["Lagos, Nigeria"],
    },
    country: "NG",
    createdAt: Date.parse("2026-07-09T08:00:00.000Z"),
    description: "<p>Build useful products.</p>",
    descriptionPlain: "Build useful products.",
    lists: [],
    hostedUrl: "https://jobs.lever.co/example/posting-123",
    applyUrl: "https://jobs.lever.co/example/posting-123/apply",
    workplaceType: "hybrid",
    ...overrides,
  };
}

function ashbyJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "posting-123",
    title: "Product Engineer",
    location: "Lagos, Nigeria",
    secondaryLocations: [],
    department: "Engineering",
    team: "Platform",
    isListed: true,
    isRemote: false,
    workplaceType: "Hybrid",
    descriptionHtml: "<p>Build useful products.</p>",
    descriptionPlain: "Build useful products.",
    publishedAt: "2026-07-09T08:00:00.000Z",
    employmentType: "FullTime",
    jobUrl: "https://jobs.ashbyhq.com/example/posting-123",
    applyUrl: "https://jobs.ashbyhq.com/example/posting-123/application",
    ...overrides,
  };
}

function jsonResponse(
  payload: unknown,
  headers: HeadersInit = {},
  status = 200,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function fixedFetch(response: Response): AtsFetch {
  return vi.fn(async () => response) as unknown as AtsFetch;
}

async function captureAdapterError(
  run: () => Promise<unknown>,
  code: AtsAdapterErrorCode,
) {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AtsAdapterError);
  expect(caught).toMatchObject({ code });
  return caught as AtsAdapterError;
}

describe("ATS endpoint allowlist", () => {
  it("constructs only the fixed provider list endpoints", () => {
    expect(
      buildGreenhouseEndpoint({ provider: "greenhouse", tenant: "Acme-1" })
        .href,
    ).toBe(
      "https://boards-api.greenhouse.io/v1/boards/Acme-1/jobs?content=true",
    );
    expect(buildLeverEndpoint({ provider: "lever", tenant: "acme" }).href).toBe(
      "https://api.lever.co/v0/postings/acme?mode=json",
    );
    expect(
      buildLeverEndpoint({ provider: "lever", tenant: "acme", region: "eu" })
        .href,
    ).toBe("https://api.eu.lever.co/v0/postings/acme?mode=json");
    expect(buildAshbyEndpoint({ provider: "ashby", tenant: "Acme" }).href).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/Acme",
    );
    expect(
      buildWorkableEndpoint({ provider: "workable", tenant: "acme" }).href,
    ).toBe("https://apply.workable.com/api/v1/widget/accounts/acme");
  });

  it.each(["https://evil.example", "../other", "acme/path", "acme.example"])(
    "rejects a caller-controlled endpoint disguised as a tenant: %s",
    (tenant) => {
      expect(() =>
        buildAtsEndpoint({ provider: "greenhouse", tenant }),
      ).toThrowError(expect.objectContaining({ code: "ats_invalid_source" }));
    },
  );

  it("rejects a runtime Lever region outside the fixed host allowlist", () => {
    expect(() =>
      buildLeverEndpoint({
        provider: "lever",
        tenant: "acme",
        region: "unknown" as never,
      }),
    ).toThrowError(expect.objectContaining({ code: "ats_invalid_source" }));
  });
});

describe("employer-authorized ATS adapter", () => {
  it("is disabled when authorization state is omitted", async () => {
    const source = {
      key: "greenhouse-example",
      employerName: "Example Employer",
      provider: "greenhouse",
      tenant: "example",
    } satisfies AtsDisabledSource;
    const fetchImpl = vi.fn();

    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(source, {
          fetch: fetchImpl as unknown as AtsFetch,
          signal: signal(),
        }),
      "ats_source_disabled",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the caller to supply a cancellation/deadline signal", async () => {
    const fetchImpl = vi.fn();
    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fetchImpl as unknown as AtsFetch,
          signal: undefined as never,
        }),
      "ats_deadline_required",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects future-reviewed or expired authorization before fetching", async () => {
    const fetchImpl = vi.fn();
    const futureReviewed = greenhouseSource();
    futureReviewed.authorization.reviewedAt = "2026-07-10T12:05:00.001Z";
    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(futureReviewed, {
          fetch: fetchImpl as unknown as AtsFetch,
          signal: signal(),
          requestedAt,
        }),
      "ats_invalid_source",
    );

    const expired = greenhouseSource();
    expired.authorization.expiresAt = "2026-07-10T11:59:59.999Z";
    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(expired, {
          fetch: fetchImpl as unknown as AtsFetch,
          signal: signal(),
          requestedAt,
        }),
      "ats_invalid_source",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches Greenhouse without credentials or redirects and normalizes records", async () => {
    const deadline = signal();
    const fetchImpl = vi.fn(async (input, init) => {
      expect(input.toString()).toBe(
        "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true",
      );
      expect(init).toMatchObject({
        method: "GET",
        body: null,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: deadline,
      });
      expect(new Headers(init?.headers).get("accept")).toBe("application/json");
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      return jsonResponse(
        {
          jobs: [
            greenhouseJob(),
            greenhouseJob({ id: 999, internal_job_id: null }),
          ],
          meta: { total: 2 },
        },
        { Date: "Fri, 10 Jul 2026 06:00:00 GMT" },
      );
    }) as unknown as AtsFetch;

    const result = await fetchAtsSourceRecords(greenhouseSource(), {
      fetch: fetchImpl,
      signal: deadline,
      requestedAt,
    });

    expect(result.checkedAt).toBe("2026-07-10T06:00:00.000Z");
    expect(result.records).toEqual([
      expect.objectContaining({
        provider: "greenhouse",
        externalId: "123",
        employerName: "Example Employer",
        title: "Product Engineer",
        location: "Lagos, Nigeria",
        department: "Engineering",
        sourceUrl: "https://boards.greenhouse.io/example/jobs/123",
        checkedAt: result.checkedAt,
      }),
    ]);
    expect(result.invalidRecords).toEqual([]);
    expect(result.snapshot).toEqual({
      status: "complete",
      providerRecordCount: 2,
      providerReportedTotal: 2,
      acceptedRecordCount: 1,
      filteredRecordCount: 1,
      invalidRecordCount: 0,
      isEmpty: false,
    });
  });

  it("normalizes Lever's EU endpoint and distinct application URL", async () => {
    const result = await fetchAtsSourceRecords(leverSource("eu"), {
      fetch: fixedFetch(
        jsonResponse([
          leverJob({
            hostedUrl: "https://jobs.eu.lever.co/example/posting-123",
            applyUrl:
              "https://jobs.eu.lever.co/example/posting-123/application",
          }),
        ]),
      ),
      signal: signal(),
      requestedAt,
    });

    expect(result.endpoint).toBe(
      "https://api.eu.lever.co/v0/postings/example?mode=json",
    );
    expect(result.records[0]).toMatchObject({
      provider: "lever",
      externalId: "posting-123",
      employmentType: "Full-time",
      workplaceType: "hybrid",
      publishedAt: "2026-07-09T08:00:00.000Z",
      applicationUrl:
        "https://jobs.eu.lever.co/example/posting-123/application",
    });
  });

  it.each(["onsite", "on-site"])(
    "canonicalizes Lever workplaceType %s",
    async (workplaceType) => {
      const result = await fetchAtsSourceRecords(leverSource(), {
        fetch: fixedFetch(jsonResponse([leverJob({ workplaceType })])),
        signal: signal(),
        requestedAt,
      });

      expect(result.records[0]?.workplaceType).toBe("on-site");
    },
  );

  it("quarantines a Lever destination on the wrong regional host", async () => {
    const result = await fetchAtsSourceRecords(leverSource("global"), {
      fetch: fixedFetch(
        jsonResponse([
          leverJob({
            hostedUrl: "https://jobs.eu.lever.co/example/posting-123",
            applyUrl: "https://jobs.eu.lever.co/example/posting-123/apply",
          }),
        ]),
      ),
      signal: signal(),
    });

    expect(result.records).toEqual([]);
    expect(result.invalidRecords).toEqual([
      { index: 0, stage: "normalization", issuePaths: [] },
    ]);
  });

  it("normalizes only publicly listed Ashby jobs", async () => {
    const result = await fetchAtsSourceRecords(ashbySource(), {
      fetch: fixedFetch(
        jsonResponse({
          apiVersion: "1",
          jobs: [ashbyJob(), ashbyJob({ id: "hidden", isListed: false })],
        }),
      ),
      signal: signal(),
      requestedAt,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      provider: "ashby",
      externalId: "posting-123",
      workplaceType: "Hybrid",
      employmentType: "FullTime",
      team: "Platform",
    });
  });

  it("normalizes the Workable widget shape distilled from Kuda", async () => {
    const result = await fetchAtsSourceRecords(workableSource(), {
      fetch: fixedFetch(
        jsonResponse({
          name: "Example Employer",
          description: null,
          jobs: [
            workableJob(),
            workableJob({
              shortcode: "REMOTE1",
              url: "https://apply.workable.com/j/REMOTE1",
              application_url: "https://apply.workable.com/j/REMOTE1/apply",
              telecommuting: true,
              city: "Lagos",
              locations: [],
            }),
          ],
        }),
      ),
      signal: signal(),
      requestedAt,
    });

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      provider: "workable",
      externalId: "61C3B27064",
      location: "Abuja, Nigeria",
      workplaceType: null,
      employmentType: "Full-time",
      publishedAt: "2026-06-08T00:00:00.000Z",
      sourceUrl: "https://apply.workable.com/j/61C3B27064",
      applicationUrl: "https://apply.workable.com/j/61C3B27064/apply",
    });
    expect(result.records[1]).toMatchObject({
      externalId: "REMOTE1",
      location: "Lagos, Nigeria",
      workplaceType: "remote",
    });
  });

  it("quarantines a Workable destination outside the apply host", async () => {
    const result = await fetchAtsSourceRecords(workableSource(), {
      fetch: fixedFetch(
        jsonResponse({
          name: "Example Employer",
          jobs: [
            workableJob({
              url: "https://evil.example/j/61C3B27064",
              application_url: "https://evil.example/j/61C3B27064/apply",
            }),
          ],
        }),
      ),
      signal: signal(),
      requestedAt,
    });

    expect(result.records).toHaveLength(0);
    expect(result.invalidRecords).toMatchObject([
      { index: 0, stage: "normalization" },
    ]);
  });

  it("accepts the additive Greenhouse shape distilled from Moniepoint", async () => {
    const result = await fetchAtsSourceRecords(greenhouseSource(), {
      fetch: fixedFetch(
        jsonResponse({
          jobs: [
            greenhouseJob({
              company_name: "Example Employer",
              first_published: "2026-07-08T08:00:00.000Z",
              application_deadline: null,
              ai_disclaimer: null,
              include_ai_disclaimer: false,
              ai_opt_out_request_url: null,
              offices: [
                {
                  id: 1,
                  name: "Africa",
                  parent_id: null,
                  child_ids: [],
                  location: null,
                },
              ],
            }),
          ],
          meta: { total: 1, provider_extension: true },
          provider_extension: "additive",
        }),
      ),
      signal: signal(),
    });

    expect(result.records).toHaveLength(1);
    expect(result.invalidRecords).toEqual([]);
  });

  it("accepts the nested Ashby postalAddress shape distilled from M-KOPA", async () => {
    const result = await fetchAtsSourceRecords(ashbySource(), {
      fetch: fixedFetch(
        jsonResponse({
          apiVersion: "1",
          jobs: [
            ashbyJob({
              secondaryLocations: [
                {
                  location: "Kampala, Uganda",
                  address: {
                    postalAddress: {
                      addressLocality: "Kampala",
                      addressCountry: "UG",
                      postalCode: "10001",
                    },
                  },
                },
              ],
            }),
          ],
        }),
      ),
      signal: signal(),
    });

    expect(result.records).toHaveLength(1);
    expect(result.invalidRecords).toEqual([]);
  });

  it("rejects an oversized streamed response even when Content-Length lies", async () => {
    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fixedFetch(
            jsonResponse(
              {
                jobs: [greenhouseJob({ content: "x".repeat(1_024) })],
                meta: { total: 1 },
              },
              { "Content-Length": "1" },
            ),
          ),
          signal: signal(),
          maxResponseBytes: 256,
        }),
      "ats_response_too_large",
    );
  });

  it("rejects declared oversized, non-JSON and malformed JSON feeds", async () => {
    const oversizedResponse = new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "257",
      },
    });
    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fixedFetch(oversizedResponse),
          signal: signal(),
          maxResponseBytes: 256,
        }),
      "ats_response_too_large",
    );
    expect(oversizedResponse.bodyUsed).toBe(true);

    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fixedFetch(
            new Response("<html></html>", {
              headers: { "Content-Type": "text/html" },
            }),
          ),
          signal: signal(),
        }),
      "ats_invalid_content_type",
    );

    await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fixedFetch(
            new Response("{not-json", {
              headers: { "Content-Type": "application/json" },
            }),
          ),
          signal: signal(),
        }),
      "ats_invalid_json",
    );
  });

  it("returns a successful complete snapshot when the provider has zero jobs", async () => {
    const result = await fetchAtsSourceRecords(greenhouseSource(), {
      fetch: fixedFetch(jsonResponse({ jobs: [], meta: { total: 0 } })),
      signal: signal(),
      requestedAt,
    });

    expect(result.records).toEqual([]);
    expect(result.invalidRecords).toEqual([]);
    expect(result.snapshot).toEqual({
      status: "complete",
      providerRecordCount: 0,
      providerReportedTotal: 0,
      acceptedRecordCount: 0,
      filteredRecordCount: 0,
      invalidRecordCount: 0,
      isEmpty: true,
    });
  });

  it("returns safe typed transport and HTTP errors", async () => {
    const transport = vi.fn(async () => {
      throw new Error("socket and network details must remain private");
    }) as unknown as AtsFetch;
    const transportError = await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: transport,
          signal: signal(),
        }),
      "ats_request_failed",
    );
    expect(transportError.message).not.toContain("socket");

    const httpError = await captureAdapterError(
      () =>
        fetchAtsSourceRecords(greenhouseSource(), {
          fetch: fixedFetch(
            new Response("private provider detail", { status: 429 }),
          ),
          signal: signal(),
        }),
      "ats_http_error",
    );
    expect(httpError).toMatchObject({ provider: "greenhouse", status: 429 });
    expect(httpError.message).not.toContain("private provider detail");
  });

  it("quarantines cross-tenant and unapproved HTTPS destinations", async () => {
    for (const absoluteUrl of [
      "https://boards.greenhouse.io/another/jobs/123",
      "https://evil.example/example/jobs/123",
    ]) {
      const result = await fetchAtsSourceRecords(greenhouseSource(), {
        fetch: fixedFetch(
          jsonResponse({
            jobs: [greenhouseJob({ absolute_url: absoluteUrl })],
            meta: { total: 1 },
          }),
        ),
        signal: signal(),
      });

      expect(result.records).toEqual([]);
      expect(result.invalidRecords).toEqual([
        { index: 0, stage: "normalization", issuePaths: [] },
      ]);
      expect(result.snapshot.invalidRecordCount).toBe(1);
    }
  });

  it("rejects an insecure provider destination at the schema boundary", async () => {
    const result = await fetchAtsSourceRecords(greenhouseSource(), {
      fetch: fixedFetch(
        jsonResponse({
          jobs: [
            greenhouseJob({
              absolute_url: "http://boards.greenhouse.io/example/jobs/123",
            }),
          ],
          meta: { total: 1 },
        }),
      ),
      signal: signal(),
    });

    expect(result.records).toEqual([]);
    expect(result.invalidRecords).toEqual([
      { index: 0, stage: "validation", issuePaths: ["absolute_url"] },
    ]);
    expect(result.snapshot.invalidRecordCount).toBe(1);
  });

  it("keeps valid jobs when another record is invalid without leaking its data", async () => {
    const result = await fetchAtsSourceRecords(greenhouseSource(), {
      fetch: fixedFetch(
        jsonResponse({
          jobs: [
            greenhouseJob(),
            greenhouseJob({
              id: 999,
              title: 123,
              applicant_email: "private.person@example.com",
            }),
          ],
          meta: { total: 2 },
        }),
      ),
      signal: signal(),
    });

    expect(result.records).toHaveLength(1);
    expect(result.invalidRecords).toEqual([
      { index: 1, stage: "validation", issuePaths: ["title"] },
    ]);
    expect(result.snapshot).toMatchObject({
      status: "complete",
      providerRecordCount: 2,
      acceptedRecordCount: 1,
      invalidRecordCount: 1,
      isEmpty: false,
    });
    expect(JSON.stringify(result.invalidRecords)).not.toContain("private");
  });

  it("allows an exact custom employer destination only when recorded in authorization", async () => {
    const source: AtsAuthorizedSource<"greenhouse"> = {
      ...greenhouseSource(),
      authorization: authorization([{ host: "careers.example.com" }]),
    };
    const result = await fetchAtsSourceRecords(source, {
      fetch: fixedFetch(
        jsonResponse({
          jobs: [
            greenhouseJob({
              absolute_url: "https://careers.example.com/jobs/123#apply",
            }),
          ],
          meta: { total: 1 },
        }),
      ),
      signal: signal(),
      requestedAt,
    });

    expect(result.records[0]?.sourceUrl).toBe(
      "https://careers.example.com/jobs/123",
    );
  });

  it("enforces configured path prefixes on an exact custom destination", async () => {
    const source: AtsAuthorizedSource<"greenhouse"> = {
      ...greenhouseSource(),
      authorization: authorization([
        { host: "careers.example.com", pathPrefixes: ["/approved/jobs"] },
      ]),
    };
    const result = await fetchAtsSourceRecords(source, {
      fetch: fixedFetch(
        jsonResponse({
          jobs: [
            greenhouseJob({
              absolute_url: "https://careers.example.com/approved/jobs/123",
            }),
            greenhouseJob({
              id: 999,
              absolute_url: "https://careers.example.com/unapproved/jobs/999",
            }),
          ],
          meta: { total: 2 },
        }),
      ),
      signal: signal(),
    });

    expect(result.records).toHaveLength(1);
    expect(result.invalidRecords).toEqual([
      { index: 1, stage: "normalization", issuePaths: [] },
    ]);
  });
});
