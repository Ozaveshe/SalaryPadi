import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  claimBudget: vi.fn(),
  fetchPayload: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnvironment: mocks.environment }));
vi.mock("@/lib/jobs/source-fetch-budget", () => ({
  claimRemotiveFetchBudget: mocks.claimBudget,
  SourceFetchBudgetError: class SourceFetchBudgetError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/lib/jobs/remotive-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/jobs/remotive-adapter")>();
  return { ...actual, fetchRemotivePayload: mocks.fetchPayload };
});

import { GET } from "./route";

const token = "test-source-sync-token-0000000000000000";
const payload = {
  jobs: [
    {
      id: 1,
      url: "https://remotive.com/remote-jobs/software-dev/example-1",
      title: "Engineer",
      company_name: "Example Ltd",
      company_logo: null,
      company_logo_url: null,
      category: "Software Development",
      tags: [],
      job_type: "full_time",
      publication_date: "2026-07-10T08:00:00Z",
      candidate_required_location: "Worldwide",
      salary: null,
      description: "<p>Build systems.</p>",
    },
  ],
};

function request(bearer = token) {
  return new Request("https://salarypadi.com/api/internal/remotive-source", {
    headers: { Authorization: `Bearer ${bearer}` },
  });
}

beforeEach(() => {
  mocks.environment.mockReturnValue({
    JOB_SOURCE_SYNC_TOKEN: token,
    REMOTIVE_SOURCE_ENABLED: true,
  });
  mocks.claimBudget.mockReset();
  mocks.fetchPayload.mockReset();
});

describe("budgeted Remotive source proxy", () => {
  it("rejects an invalid bearer before a budget or provider call", async () => {
    const response = await GET(request("wrong-token"));

    expect(response.status).toBe(401);
    expect(mocks.claimBudget).not.toHaveBeenCalled();
    expect(mocks.fetchPayload).not.toHaveBeenCalled();
  });

  it("does not contact the provider after the rolling budget is exhausted", async () => {
    mocks.claimBudget.mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "remotive_fetch_budget_exhausted",
    });
    expect(mocks.fetchPayload).not.toHaveBeenCalled();
  });

  it("honors the emergency source kill switch before claiming budget", async () => {
    mocks.environment.mockReturnValue({
      JOB_SOURCE_SYNC_TOKEN: token,
      REMOTIVE_SOURCE_ENABLED: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "remotive_environment_disabled",
    });
    expect(mocks.claimBudget).not.toHaveBeenCalled();
    expect(mocks.fetchPayload).not.toHaveBeenCalled();
  });

  it("returns one validated provider payload after consuming a claim", async () => {
    mocks.claimBudget.mockResolvedValue(true);
    mocks.fetchPayload.mockResolvedValue({
      payload,
      checkedAt: "2026-07-10T13:05:00.000Z",
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(payload);
    expect(mocks.claimBudget).toHaveBeenCalledOnce();
    expect(mocks.fetchPayload).toHaveBeenCalledOnce();
  });
});
