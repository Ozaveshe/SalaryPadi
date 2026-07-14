import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedApiContext: vi.fn(),
  getAppOrigin: vi.fn(),
  getJobBySlug: vi.fn(),
  rejectCrossOriginRequest: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  getAuthenticatedApiContext: mocks.getAuthenticatedApiContext,
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/jobs/repository", () => ({
  getJobBySlug: mocks.getJobBySlug,
}));
vi.mock("@/lib/security/origin", () => ({
  rejectCrossOriginRequest: mocks.rejectCrossOriginRequest,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://salarypadi.com");
  mocks.rejectCrossOriginRequest.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getAuthenticatedApiContext.mockResolvedValue({
    ok: true,
    supabase: { schema: () => ({ rpc: mocks.rpc }) },
  });
  mocks.getJobBySlug.mockResolvedValue({
    feed: { state: "live" },
    job: {
      databaseId: "aa000000-0000-4000-8000-000000000001",
      slug: "platform-engineer-acme",
      title: "Platform Engineer",
      company: { name: "Acme & Sons" },
    },
  });
});

describe("save job route", () => {
  it("returns salary contribution context after a successful save", async () => {
    const response = await POST(
      new Request("https://salarypadi.com/api/saved", {
        method: "POST",
        body: new URLSearchParams({
          job_slug: "platform-engineer-acme",
          return_to: "/jobs/platform-engineer-acme",
        }),
      }),
    );

    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/jobs/platform-engineer-acme");
    expect(location.searchParams.get("saved")).toBe("true");
    expect(location.searchParams.get("salary_company")).toBe("Acme & Sons");
    expect(location.searchParams.get("salary_role")).toBe("Platform Engineer");
  });

  it("returns unavailable instead of a success redirect when persistence throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("transport unavailable"));

    const response = await POST(
      new Request("https://salarypadi.com/api/saved", {
        method: "POST",
        body: new URLSearchParams({ job_slug: "platform-engineer-acme" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps an inconclusive job lookup distinct from a confirmed absence", async () => {
    mocks.getJobBySlug.mockResolvedValueOnce({
      feed: { state: "unavailable" },
      job: null,
    });
    const unavailable = await POST(
      new Request("https://salarypadi.com/api/saved", {
        method: "POST",
        body: new URLSearchParams({ job_slug: "missing-job" }),
      }),
    );

    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    expect(unavailable.headers.get("retry-after")).toBe("60");
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.getJobBySlug.mockResolvedValueOnce({
      feed: { state: "live" },
      job: null,
    });
    const missing = await POST(
      new Request("https://salarypadi.com/api/saved", {
        method: "POST",
        body: new URLSearchParams({ job_slug: "missing-job" }),
      }),
    );

    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("allows a confirmed job to be saved from a partially available feed", async () => {
    mocks.getJobBySlug.mockResolvedValueOnce({
      feed: { state: "degraded" },
      job: {
        databaseId: "aa000000-0000-4000-8000-000000000001",
        slug: "platform-engineer-acme",
        title: "Platform Engineer",
        company: { name: "Acme & Sons" },
      },
    });

    const response = await POST(
      new Request("https://salarypadi.com/api/saved", {
        method: "POST",
        body: new URLSearchParams({ job_slug: "platform-engineer-acme" }),
      }),
    );

    expect(response.status).toBe(303);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
