import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverSecondaryJobs,
  DISCOVERY_COUNTRIES,
  initialDiscoveryCheckpoint,
} from "./secondary-discovery";
import { AFRICAN_APPLICANT_COUNTRIES } from "./eligibility";
const mocks = vi.hoisted(() => ({ himalayas: vi.fn(), jobicy: vi.fn() }));
vi.mock("./himalayas-adapter", () => ({ readHimalayasPage: mocks.himalayas }));
vi.mock("./jobicy-adapter", () => ({ fetchJobicyJobs: mocks.jobicy }));
const now = new Date("2026-10-22T05:00:00.000Z");
const options = { now, pageDelayMs: 0 };
beforeEach(() => {
  mocks.himalayas.mockReset();
  mocks.jobicy.mockReset();
});
describe("resumable Africa discovery", () => {
  it("covers every supported country before taking another page and retains short-page progress", async () => {
    mocks.himalayas.mockResolvedValue({
      jobs: [{ id: "one" }],
      checkedAt: now.toISOString(),
    });
    let checkpoint = initialDiscoveryCheckpoint();
    for (let i = 0; i < Math.ceil(DISCOVERY_COUNTRIES.length / 6); i++)
      checkpoint = (
        await discoverSecondaryJobs("himalayas", checkpoint, options)
      ).checkpoint;
    const urls = mocks.himalayas.mock.calls.map(([url]) => new URL(url));
    for (const { code } of AFRICAN_APPLICANT_COUNTRIES)
      expect(urls.some((url) => url.searchParams.get("country") === code)).toBe(
        true,
      );
    expect(
      urls
        .slice(0, DISCOVERY_COUNTRIES.length)
        .every((url) => url.searchParams.get("page") === "1"),
    ).toBe(true);
    expect(checkpoint.pages.worldwide).toBeGreaterThanOrEqual(2);
  });
  it("refreshes new arrivals without losing deep pagination progress", async () => {
    mocks.himalayas.mockResolvedValue({
      jobs: [{ id: "one" }],
      checkedAt: now.toISOString(),
    });
    const state = initialDiscoveryCheckpoint();
    state.pages.worldwide = 35;
    state.headsCheckedAt.worldwide = "2026-10-21T00:00:00.000Z";
    const result = await discoverSecondaryJobs("himalayas", state, options);
    expect(
      new URL(mocks.himalayas.mock.calls[0]![0]).searchParams.get("page"),
    ).toBe("1");
    expect(result.checkpoint.pages.worldwide).toBe(35);
  });
  it("restarts an expired Jobicy cursor within the request budget", async () => {
    mocks.jobicy.mockRejectedValueOnce({ status: 400 }).mockResolvedValue({
      jobs: [],
      checkedAt: now.toISOString(),
      nextCursor: null,
    });
    const state = initialDiscoveryCheckpoint();
    state.cursor = "expired";
    const result = await discoverSecondaryJobs("jobicy", state, options);
    expect(mocks.jobicy.mock.calls[1]![0].cursor).toBeNull();
    expect(result.checkpoint.completedAt).toBe(now.toISOString());
  });

  it("resets only an exhausted country, not short pages", async () => {
    mocks.himalayas.mockResolvedValue({
      jobs: [],
      checkedAt: now.toISOString(),
    });
    const state = initialDiscoveryCheckpoint();
    state.pages.worldwide = 19;
    const result = await discoverSecondaryJobs("himalayas", state, options);
    expect(result.checkpoint.pages.worldwide).toBe(1);
    expect(result.successfulRequests).toBe(6);
  });
  it("retains a failed page for retry without discarding successful pages", async () => {
    mocks.himalayas
      .mockResolvedValueOnce({
        jobs: [{ id: "one" }],
        checkedAt: now.toISOString(),
      })
      .mockRejectedValueOnce(new Error("503"));
    const result = await discoverSecondaryJobs(
      "himalayas",
      initialDiscoveryCheckpoint(),
      options,
    );
    expect(result.partial).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.checkpoint.pages.NG).toBeUndefined();
    expect(result.checkpoint.position).toBe(6);
  });
  it("resumes opaque Jobicy cursors across batches and pauses only after completion", async () => {
    let page = 0;
    mocks.jobicy.mockImplementation(async () => ({
      jobs: [],
      checkedAt: now.toISOString(),
      nextCursor: ++page < 6 ? `cursor-${page}` : null,
    }));
    const first = await discoverSecondaryJobs(
      "jobicy",
      initialDiscoveryCheckpoint(),
      options,
    );
    expect(first.checkpoint.cursor).toBe("cursor-4");
    const second = await discoverSecondaryJobs(
      "jobicy",
      first.checkpoint,
      options,
    );
    expect(mocks.jobicy.mock.calls[4]![0].cursor).toBe("cursor-4");
    expect(second.checkpoint.completedAt).toBe(now.toISOString());
    expect(
      (await discoverSecondaryJobs("jobicy", second.checkpoint, options))
        .skipped,
    ).toBe(true);
    expect(mocks.jobicy).toHaveBeenCalledTimes(6);
  });
});
