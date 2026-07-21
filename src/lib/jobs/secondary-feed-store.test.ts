import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mocks.get, setJSON: mocks.setJSON }),
}));

import { normalizeRemotiveJob } from "./normalize";
import type { RemotiveJob } from "./remotive-schema";
import {
  readSecondaryFeedSnapshot,
  storeSecondaryFeedSnapshot,
} from "./secondary-feed-store";

const checkedAt = "2026-07-21T06:00:00.000Z";

const sourceJob: RemotiveJob = {
  id: 41,
  url: "https://remotive.com/remote-jobs/software-dev/source-41",
  title: "Data Engineer",
  company_name: "Example Ltd",
  company_logo: null,
  category: "Software Development",
  tags: [],
  job_type: "full_time",
  publication_date: "2026-07-20T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "",
  description: "<p>Ship pipelines.</p>",
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.setJSON.mockReset();
});

describe("secondary feed snapshot store", () => {
  it("persists the redacted catalog projection under the source key", async () => {
    const job = normalizeRemotiveJob(sourceJob, checkedAt);

    const count = await storeSecondaryFeedSnapshot("jobicy", [job], checkedAt);

    expect(count).toBe(1);
    const [key, catalog] = mocks.setJSON.mock.calls[0]!;
    expect(key).toBe("jobicy");
    expect(catalog).toMatchObject({ schemaVersion: 1, checkedAt });
    expect(catalog.jobs[0].description).toBe("");
    expect(catalog.jobs[0].requirements).toBeNull();
  });

  it("round-trips a stored catalog", async () => {
    const job = normalizeRemotiveJob(sourceJob, checkedAt);
    await storeSecondaryFeedSnapshot("himalayas", [job], checkedAt);
    mocks.get.mockResolvedValue(mocks.setJSON.mock.calls[0]![1]);

    const result = await readSecondaryFeedSnapshot("himalayas");

    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.catalog.jobs).toHaveLength(1);
      expect(result.catalog.checkedAt).toBe(checkedAt);
    }
  });

  it("reports a missing snapshot distinctly", async () => {
    mocks.get.mockResolvedValue(null);
    await expect(readSecondaryFeedSnapshot("jobicy")).resolves.toEqual({
      state: "missing",
    });
  });

  it("refuses a malformed snapshot instead of serving it", async () => {
    mocks.get.mockResolvedValue({ schemaVersion: 1, jobs: "not-an-array" });
    await expect(readSecondaryFeedSnapshot("jobicy")).resolves.toEqual({
      state: "invalid",
    });
  });

  it("maps a store outage to unavailable", async () => {
    mocks.get.mockRejectedValue(new Error("blob backend down"));
    await expect(readSecondaryFeedSnapshot("himalayas")).resolves.toEqual({
      state: "unavailable",
    });
  });
});
