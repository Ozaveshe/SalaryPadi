import { describe, expect, it, vi } from "vitest";

import { fetchJobicyJobs, JOBICY_ENDPOINT } from "./jobicy-adapter";

const checkedAt = "2026-07-14T19:00:00.000Z";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    jobCount: 1,
    jobs: [
      {
        id: 146023,
        url: "https://jobicy.com/jobs/146023-senior-product-manager",
        jobTitle: "Senior Product Manager",
        companyName: "Remote",
        jobIndustry: ["Product &amp; Operations"],
        jobType: ["Full-Time"],
        jobGeo: "EMEA",
        jobLevel: "Senior",
        jobExcerpt: "<p>Build products for distributed teams.</p>",
        pubDate: "2026-07-14T12:00:00+00:00",
        salaryMin: 90_000,
        salaryMax: 120_000,
        salaryCurrency: "USD",
        salaryPeriod: "yearly",
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

describe("Jobicy adapter", () => {
  it("normalizes the documented feed without retaining the full description", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response({
        ...payload(),
        jobs: [
          {
            ...payload().jobs[0],
            jobDescription: "This full provider description is not retained.",
          },
        ],
      }),
    );

    const result = await fetchJobicyJobs({
      fetch,
      requestedAt: new Date(checkedAt),
      requestInit: { next: { revalidate: 21_600, tags: ["jobicy"] } },
    });

    expect(result.checkedAt).toBe(checkedAt);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: "jobicy-146023",
      sourceUrl: "https://jobicy.com/jobs/146023-senior-product-manager",
      workMode: "remote",
      employmentType: "full_time",
      description: "Build products for distributed teams.",
      eligibility: {
        scope: "emea",
        nigeria: "unclear",
        africa: "eligible",
      },
      salary: {
        currency: "USD",
        minimum: 90_000,
        maximum: 120_000,
        payPeriod: "annual",
      },
    });
    expect(result.jobs[0]?.description).not.toContain("full provider");
    expect(fetch).toHaveBeenCalledWith(
      JOBICY_ENDPOINT,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        next: { revalidate: 21_600, tags: ["jobicy"] },
      }),
    );
  });

  it("rejects a destination outside Jobicy", async () => {
    await expect(
      fetchJobicyJobs({
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(
            response(payload({ url: "https://evil.test/job" })),
          ),
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "jobicy_normalization_failed" });
  });

  it("fails closed on undocumented payloads and content types", async () => {
    await expect(
      fetchJobicyJobs({
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(response({ jobs: [{ id: 1 }] })),
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "jobicy_invalid_payload" });

    await expect(
      fetchJobicyJobs({
        fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
          new Response("not json", {
            headers: { "Content-Type": "text/plain" },
          }),
        ),
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "jobicy_invalid_content_type" });
  });
});
