import { describe, expect, it, vi } from "vitest";

import { fetchHimalayasJobs, HIMALAYAS_ENDPOINTS } from "./himalayas-adapter";

const checkedAt = "2026-07-15T01:00:00.000Z";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    comments: "Public API fixture",
    updatedAt: 1_784_070_000,
    offset: 0,
    limit: 20,
    totalCount: 626,
    jobs: [
      {
        title: "Product Operations Lead",
        excerpt: "Build reliable operations for a distributed team.",
        companyName: "Example Africa",
        companySlug: "example-africa",
        employmentType: "Full Time",
        minSalary: 70_000,
        maxSalary: 90_000,
        salaryPeriod: "annual",
        seniority: ["Lead"],
        currency: "USD",
        locationRestrictions: ["Nigeria", "Ghana", "Kenya"],
        timezoneRestrictions: [0, 1, 2, 3],
        categories: ["Operations", "Product-Operations"],
        parentCategories: ["Operations"],
        description: "The full provider description is not retained.",
        pubDate: 1_784_070_000,
        expiryDate: 1_789_254_000,
        applicationLink:
          "https://himalayas.app/companies/example-africa/jobs/product-operations-lead",
        guid: "https://himalayas.app/companies/example-africa/jobs/product-operations-lead",
        ...overrides,
      },
    ],
  };
}

function response(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Date", checkedAt);
  return Response.json(body, { ...init, headers });
}

describe("Himalayas adapter", () => {
  it("normalizes bounded Nigeria pages with attribution-only destinations", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response(payload()));

    const result = await fetchHimalayasJobs({
      pageDelayMs: 0,
      fetch,
      requestedAt: new Date(checkedAt),
      requestInit: { next: { revalidate: 86_400, tags: ["himalayas"] } },
    });

    expect(result).toMatchObject({
      checkedAt,
      partial: false,
      successfulRequestCount: HIMALAYAS_ENDPOINTS.length,
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      sourceUrl:
        "https://himalayas.app/companies/example-africa/jobs/product-operations-lead",
      workMode: "remote",
      employmentType: "full_time",
      description: "Build reliable operations for a distributed team.",
      eligibility: {
        scope: "named_countries",
        nigeria: "eligible",
        africa: "eligible",
        requiredTimezone: "0, 1, 2, 3",
      },
      salary: {
        currency: "USD",
        minimum: 70_000,
        maximum: 90_000,
        payPeriod: "annual",
      },
    });
    expect(result.jobs[0]?.description).not.toContain("full provider");
    expect(fetch).toHaveBeenCalledTimes(HIMALAYAS_ENDPOINTS.length);
    expect(fetch).toHaveBeenCalledWith(
      HIMALAYAS_ENDPOINTS[0],
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        next: { revalidate: 86_400, tags: ["himalayas"] },
      }),
    );
  });

  it("keeps successful pages when one reviewed query fails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        response(
          payload({
            applicationLink:
              "https://himalayas.app/companies/another/jobs/customer-success",
            guid: "https://himalayas.app/companies/another/jobs/customer-success",
          }),
        ),
      );

    const result = await fetchHimalayasJobs({
      pageDelayMs: 0,
      fetch,
      requestedAt: new Date(checkedAt),
    });

    expect(result.partial).toBe(true);
    expect(result.successfulRequestCount).toBe(2);
    expect(result.jobs).toHaveLength(2);
  });

  it("accepts the provider's large multi-country restriction lists", async () => {
    const locations = [
      "Nigeria",
      ...Array.from({ length: 147 }, (_, index) => `Region ${index + 1}`),
    ];
    const result = await fetchHimalayasJobs({
      pageDelayMs: 0,
      fetch: vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
        response(
          payload({
            locationRestrictions: locations,
          }),
        ),
      ),
      requestedAt: new Date(checkedAt),
    });

    expect(result.partial).toBe(false);
    expect(result.jobs[0]).toMatchObject({
      locationDisplay: expect.stringContaining("+142 countries"),
      eligibility: { nigeria: "eligible", africa: "eligible" },
    });
  });

  it("fails closed when all pages fail or a destination leaves Himalayas", async () => {
    await expect(
      fetchHimalayasJobs({
        pageDelayMs: 0,
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(new Response(null, { status: 429 })),
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "himalayas_http_error", status: 429 });

    await expect(
      fetchHimalayasJobs({
        pageDelayMs: 0,
        fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
          response(
            payload({
              applicationLink: "https://evil.test/job",
              guid: "https://evil.test/job",
            }),
          ),
        ),
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "himalayas_normalization_failed" });
  });
});
