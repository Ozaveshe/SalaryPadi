import { describe, expect, it, vi } from "vitest";

import { fetchReliefWebJobs, reliefWebEndpoint } from "./reliefweb-adapter";

const checkedAt = "2026-07-24T09:00:00.000Z";

function payload(fieldOverrides: Record<string, unknown> = {}) {
  return {
    totalCount: 1,
    count: 1,
    data: [
      {
        id: 4182312,
        fields: {
          id: 4182312,
          title: "WASH Programme Officer",
          url: "https://reliefweb.int/job/4182312/wash-programme-officer",
          date: {
            created: "2026-07-20T00:00:00+00:00",
            closing: "2026-08-15T00:00:00+00:00",
          },
          source: [{ name: "Norwegian Refugee Council" }],
          country: [{ name: "Nigeria" }],
          type: [{ name: "Job" }],
          career_categories: [{ name: "Program/Project Management" }],
          ...fieldOverrides,
        },
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

describe("ReliefWeb adapter", () => {
  it("refuses to build a request without the pre-approved appname", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(fetchReliefWebJobs({ fetch })).rejects.toMatchObject({
      code: "reliefweb_appname_missing",
    });
    await expect(
      fetchReliefWebJobs({ fetch, appName: "  " }),
    ).rejects.toMatchObject({ code: "reliefweb_appname_missing" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes registry-permitted metadata without retaining a body", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(payload()));

    const result = await fetchReliefWebJobs({
      fetch,
      appName: "salarypadi",
      requestedAt: new Date(checkedAt),
    });

    expect(result.checkedAt).toBe(checkedAt);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: "reliefweb-4182312",
      sourceUrl: "https://reliefweb.int/job/4182312/wash-programme-officer",
      applicationUrl:
        "https://reliefweb.int/job/4182312/wash-programme-officer",
      title: "WASH Programme Officer",
      company: { name: "Norwegian Refugee Council" },
      locationDisplay: "Nigeria",
      workMode: "unclear",
      category: "Program/Project Management",
      salary: null,
      postedAt: "2026-07-20T00:00:00+00:00",
      validThrough: "2026-08-15T00:00:00+00:00",
      eligibility: { scope: "nigeria", nigeria: "eligible" },
      description: "Open the attributed source listing for full details.",
    });
    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestedUrl.origin).toBe("https://api.reliefweb.int");
    expect(requestedUrl.searchParams.get("appname")).toBe("salarypadi");
    expect(reliefWebEndpoint("salarypadi")).toContain("appname=salarypadi");
  });

  it("rejects a destination outside ReliefWeb", async () => {
    await expect(
      fetchReliefWebJobs({
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(
            response(payload({ url: "https://evil.test/job" })),
          ),
        appName: "salarypadi",
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "reliefweb_normalization_failed" });
  });

  it("rejects a record without a duty-station country", async () => {
    await expect(
      fetchReliefWebJobs({
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(response(payload({ country: [] }))),
        appName: "salarypadi",
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "reliefweb_normalization_failed" });
  });

  it("fails closed on undocumented payloads and content types", async () => {
    await expect(
      fetchReliefWebJobs({
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(response({ data: [{ id: 1 }] })),
        appName: "salarypadi",
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "reliefweb_invalid_payload" });

    await expect(
      fetchReliefWebJobs({
        fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
          new Response("not json", {
            headers: { "Content-Type": "text/plain" },
          }),
        ),
        appName: "salarypadi",
        requestedAt: new Date(checkedAt),
      }),
    ).rejects.toMatchObject({ code: "reliefweb_invalid_content_type" });
  });
});
