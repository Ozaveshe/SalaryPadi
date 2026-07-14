import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/seo/sitemap-data", () => ({ loadSitemapData: vi.fn() }));

import { loadSitemapData } from "@/lib/seo/sitemap-data";

import { createSitemapResponse } from "./sitemap-response";

const states = {
  jobs: "ready" as const,
  companies: "ready" as const,
  salaries: "ready" as const,
  tools: "ready" as const,
  guides: "ready" as const,
  insights: "ready" as const,
};

beforeEach(() => {
  vi.mocked(loadSitemapData).mockResolvedValue({
    groups: {
      jobs: [{ url: "https://salarypadi.com/jobs/example" }],
      companies: [],
      salaries: [],
      tools: [],
      guides: [],
      insights: [],
    },
    states,
  });
});

describe("sitemap response state", () => {
  it("serves a ready inventory with the normal shared-cache policy", async () => {
    const response = await createSitemapResponse("jobs");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-salarypadi-sitemap-state")).toBe("ready");
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    await expect(response.text()).resolves.toContain("/jobs/example");
  });

  it("returns a retryable 503 instead of publishing an unavailable empty inventory", async () => {
    vi.mocked(loadSitemapData).mockResolvedValue({
      groups: {
        jobs: [],
        companies: [],
        salaries: [],
        tools: [],
        guides: [],
        insights: [],
      },
      states: { ...states, jobs: "unavailable" },
    });

    const response = await createSitemapResponse("jobs");

    expect(response.status).toBe(503);
    expect(response.headers.get("x-salarypadi-sitemap-state")).toBe(
      "unavailable",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("serves partial evidence briefly and labels it degraded", async () => {
    vi.mocked(loadSitemapData).mockResolvedValue({
      groups: {
        jobs: [{ url: "https://salarypadi.com/jobs/verified" }],
        companies: [],
        salaries: [],
        tools: [],
        guides: [],
        insights: [],
      },
      states: { ...states, jobs: "degraded" },
    });

    const response = await createSitemapResponse("jobs");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-salarypadi-sitemap-state")).toBe("degraded");
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });
});
