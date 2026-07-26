import { describe, expect, it, vi } from "vitest";

import {
  employerFeedConfigSchema,
  type EmployerFeedConfig,
} from "../../../src/lib/jobs/feeds/types";
import { runEmployerFeedSync, selectDueFeeds } from "../employer-feed-sync.mjs";
import type { WorkerExecution } from "./runtime";

const now = new Date("2026-07-26T06:19:00.000Z");

function execution(remainingMs = 20_000): WorkerExecution {
  return {
    signal: new AbortController().signal,
    remainingMs: () => remainingMs,
  };
}

function feed(overrides: Partial<EmployerFeedConfig> = {}): EmployerFeedConfig {
  return employerFeedConfigSchema.parse({
    feedKey: "acme_xml",
    employerSlug: "acme",
    employerName: "Acme Nigeria",
    kind: "xml",
    url: "https://careers.acme.com/jobs.xml",
    recordElement: "job",
    expectedRootElement: "jobs",
    fieldMap: { externalId: "id", title: "title", sourceUrl: "url" },
    allowedDestinationHosts: ["acme.com"],
    rightsBasis: "written_employer_authorization",
    rightsEvidenceRef: "docs/authorizations/acme.pdf",
    authorizedAt: "2026-07-01T00:00:00.000Z",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    reviewDueAt: "2026-10-01T00:00:00.000Z",
    enabled: true,
    ...overrides,
  });
}

describe("employer feed sync worker", () => {
  it("no-ops honestly and makes no request when no feed is eligible", async () => {
    // The current production state: the registry is empty AND both global
    // source policies are disabled.
    const fetchFeed = vi.fn();
    const callRpc = vi.fn();

    const outcome = await runEmployerFeedSync(execution(), {
      now: () => now.valueOf(),
      callRpc: callRpc as never,
      fetchFeed: fetchFeed as never,
      loadFeeds: () => [],
    });

    expect(outcome).toEqual({
      status: "skipped",
      summary: { reason: "no_eligible_feed" },
    });
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("reports skipped, never succeeded, when nothing was eligible", async () => {
    const outcome = await runEmployerFeedSync(execution(), {
      now: () => now.valueOf(),
      callRpc: vi.fn() as never,
      fetchFeed: vi.fn() as never,
      loadFeeds: () => [],
    });
    // A no-op is not a success. Claiming otherwise is the overstatement this
    // worker's summary exists to avoid.
    expect(outcome.status).toBe("skipped");
    expect(outcome.status).not.toBe("succeeded");
  });

  it("uses the committed registry and real policy gate by default", async () => {
    // No loadFeeds injection: this exercises the production path, where the
    // empty registry and disabled policies must yield an honest skip.
    const fetchFeed = vi.fn();
    const outcome = await runEmployerFeedSync(execution(), {
      now: () => now.valueOf(),
      callRpc: vi.fn() as never,
      fetchFeed: fetchFeed as never,
    });
    expect(outcome).toMatchObject({ status: "skipped" });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("stops before the reserve so terminal metrics can still be written", async () => {
    const fetchFeed = vi.fn();
    const outcome = await runEmployerFeedSync(execution(1_000), {
      now: () => now.valueOf(),
      callRpc: vi.fn() as never,
      fetchFeed: fetchFeed as never,
      loadFeeds: () => [feed()],
    });

    expect(fetchFeed).not.toHaveBeenCalled();
    expect(outcome.summary).toMatchObject({
      eligible_feeds: 1,
      attempted_feeds: 0,
      reasons: ["worker_budget_exhausted"],
    });
  });
});

describe("fair due-feed selection", () => {
  const feeds = ["a", "b", "c", "d", "e"].map((key) =>
    feed({ feedKey: `feed_${key}` }),
  );

  it("returns every feed when they fit in one invocation", () => {
    expect(selectDueFeeds(feeds.slice(0, 2), now, 3)).toHaveLength(2);
  });

  it("bounds the number attempted per invocation", () => {
    expect(selectDueFeeds(feeds, now, 3)).toHaveLength(3);
  });

  it("rotates across ticks so no feed is starved", () => {
    const seen = new Set<string>();
    for (let tick = 0; tick < 5; tick += 1) {
      const at = new Date(now.valueOf() + tick * 900_000);
      for (const selected of selectDueFeeds(feeds, at, 3)) {
        seen.add(selected.feedKey);
      }
    }
    expect(seen.size).toBe(feeds.length);
  });

  it("is deterministic within one tick, so a retry attempts the same feeds", () => {
    expect(selectDueFeeds(feeds, now, 3).map((f) => f.feedKey)).toEqual(
      selectDueFeeds(feeds, new Date(now.valueOf() + 1_000), 3).map(
        (f) => f.feedKey,
      ),
    );
  });
});
