import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { normalizeRemotiveJob } from "@/lib/jobs/normalize";
import type { RemotiveJob } from "@/lib/jobs/remotive-schema";

const mocks = vi.hoisted(() => ({
  getEnvironment: vi.fn(),
  getRemotiveJobFeed: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getServerEnvironment: mocks.getEnvironment,
}));
vi.mock("@/lib/jobs/repository", () => ({
  getRemotiveJobFeed: mocks.getRemotiveJobFeed,
}));
import { POST } from "./route";

const sourceJob: RemotiveJob = {
  id: 88,
  url: "https://remotive.com/remote-jobs/software-dev/source-88",
  title: "Backend Engineer",
  company_name: "Example Ltd",
  company_logo: null,
  category: "Software Development",
  tags: ["TypeScript"],
  job_type: "full_time",
  publication_date: "2026-07-09T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$80,000",
  description: "<p>Private source description.</p>",
};

const sourceSyncToken = "test-source-sync-token-0000000000000000";

function request(token = sourceSyncToken) {
  return new Request(
    "https://salarypadi.com/api/internal/job-source-snapshot",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

beforeEach(() => {
  mocks.getEnvironment.mockReturnValue({
    JOB_SOURCE_SYNC_TOKEN: sourceSyncToken,
  });
  mocks.getRemotiveJobFeed.mockReset();
});

describe("protected job source snapshot", () => {
  it("rejects an invalid token before acquisition", async () => {
    const response = await POST(request("wrong-key"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.getRemotiveJobFeed).not.toHaveBeenCalled();
  });

  it("warms the shared cache and returns only a validated redacted snapshot", async () => {
    const checkedAt = "2026-07-10T13:05:00.000Z";
    const job = normalizeRemotiveJob(sourceJob, checkedAt);
    mocks.getRemotiveJobFeed.mockResolvedValue({
      key: "remotive",
      state: "live",
      jobs: [job],
      checkedAt,
      count: 1,
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      schemaVersion: 1,
      checkedAt,
      jobs: [
        {
          id: "remotive-88",
          description: "",
          requirements: null,
          benefits: null,
          riskIndicators: [],
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("Private source description");
  });

  it("fails safely when the reviewed source is paused", async () => {
    mocks.getRemotiveJobFeed.mockResolvedValue({
      key: "remotive",
      state: "disabled",
      jobs: [],
      checkedAt: "2026-07-10T13:05:00.000Z",
      count: 0,
      code: "remotive_policy_disabled",
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "remotive_policy_disabled",
      source_state: "disabled",
    });
  });
});
