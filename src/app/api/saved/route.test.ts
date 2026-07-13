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
});
