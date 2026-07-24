import { describe, expect, it, vi } from "vitest";

import { registrableDomain } from "./domain";
import { extractCsvFeedRecords, parseCsv } from "./extract";
import {
  runEmployerFeed,
  type FeedFetcher,
  type FeedPersistResult,
  type FeedRunStore,
  type FeedSnapshot,
} from "./runtime";
import { employerFeedConfigSchema, type EmployerFeedConfig } from "./types";

const now = new Date("2026-07-24T12:00:00.000Z");

function feed(overrides: Partial<EmployerFeedConfig> = {}): EmployerFeedConfig {
  return employerFeedConfigSchema.parse({
    feedKey: "acme_xml",
    employerSlug: "acme",
    employerName: "Acme Nigeria",
    kind: "xml",
    url: "https://careers.acme.com/jobs.xml",
    recordElement: "job",
    fieldMap: {
      externalId: "id",
      title: "title",
      location: "location",
      sourceUrl: "url",
    },
    allowedDestinationHosts: ["acme.com"],
    rightsBasis: "written_employer_authorization",
    rightsEvidenceRef: "docs/authorizations/acme.pdf",
    authorizedAt: "2026-07-01T00:00:00.000Z",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    reviewDueAt: "2026-10-01T00:00:00.000Z",
    authorizationExpiresAt: "2027-07-01T00:00:00.000Z",
    enabled: true,
    ...overrides,
  });
}

function xml(records: Array<{ id: string; host?: string }>): string {
  return `<jobs>${records
    .map(
      (r) =>
        `<job><id>${r.id}</id><title>Role ${r.id}</title><location>Lagos, Nigeria</location><url>https://${r.host ?? "careers.acme.com"}/jobs/${r.id}</url></job>`,
    )
    .join("")}</jobs>`;
}

/** In-memory store that faithfully models raw evidence + canonical upsert +
 * absence handling, so the runtime's lifecycle guarantees are provable. */
class MemoryStore implements FeedRunStore {
  raw: FeedSnapshot["raw"] = [];
  jobs = new Map<string, { hash: string; open: boolean }>();
  snapshots: FeedSnapshot[] = [];

  async applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult> {
    this.snapshots.push(snapshot);
    this.raw.push(...snapshot.raw);
    let inserted = 0;
    let updated = 0;
    for (const job of snapshot.jobs) {
      const key = `${snapshot.feedKey}:${job.external_id}`;
      const existing = this.jobs.get(key);
      if (!existing) {
        inserted += 1;
        this.jobs.set(key, { hash: job.content_hash, open: true });
      } else {
        if (existing.hash !== job.content_hash) updated += 1;
        this.jobs.set(key, { hash: job.content_hash, open: true });
      }
    }
    let closed = 0;
    if (snapshot.complete) {
      const seen = new Set(snapshot.seenExternalIds);
      for (const [key, value] of this.jobs) {
        if (!key.startsWith(`${snapshot.feedKey}:`)) continue;
        const externalId = key.slice(snapshot.feedKey.length + 1);
        if (!seen.has(externalId) && value.open) {
          value.open = false;
          closed += 1;
        }
      }
    }
    return { inserted, updated, closed };
  }

  openCount(feedKey: string): number {
    let n = 0;
    for (const [key, value] of this.jobs) {
      if (key.startsWith(`${feedKey}:`) && value.open) n += 1;
    }
    return n;
  }
}

describe("registrable-domain validation", () => {
  it("rejects bare public suffixes and accepts registrable domains", () => {
    expect(registrableDomain("com")).toBeNull();
    expect(registrableDomain("co.uk")).toBeNull();
    expect(registrableDomain("com.ng")).toBeNull();
    expect(registrableDomain("acme.com")).toBe("acme.com");
    expect(registrableDomain("careers.acme.com")).toBe("acme.com");
    expect(registrableDomain("acme.co.uk")).toBe("acme.co.uk");
    expect(registrableDomain("kuda.com.ng")).toBe("kuda.com.ng");
    expect(registrableDomain("not a host")).toBeNull();
  });

  it("blocks a config whose destination host is a bare suffix", () => {
    expect(() => feed({ allowedDestinationHosts: ["com"] })).toThrow(
      /registrable domains/,
    );
  });
});

describe("strict CSV parsing", () => {
  it("rejects characters after a closing quote", () => {
    expect(() => parseCsv('a,"quoted"garbage,c')).toThrow("feed_malformed");
  });

  it("accepts a well-formed quoted row", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("still validates through the CSV extractor", () => {
    const csvFeed = feed({
      feedKey: "acme_csv",
      kind: "csv",
      url: null,
      recordElement: undefined,
      fieldMap: {
        externalId: "id",
        title: "title",
        sourceUrl: "url",
      },
    });
    const rows = extractCsvFeedRecords(
      "id,title,url\n1,Engineer,https://careers.acme.com/jobs/1",
      csvFeed,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("feed authorization enforces gates before any network call", () => {
  it("does not fetch a disabled feed", async () => {
    const fetcher = vi.fn<FeedFetcher>();
    const result = await runEmployerFeed(feed({ enabled: false }), {
      now,
      fetcher,
      store: new MemoryStore(),
    });
    expect(result).toMatchObject({ ran: false, reason: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not fetch when the authorization has expired", async () => {
    const fetcher = vi.fn<FeedFetcher>();
    const result = await runEmployerFeed(
      feed({ authorizationExpiresAt: "2026-07-01T00:00:00.000Z" }),
      { now, fetcher, store: new MemoryStore() },
    );
    expect(result).toMatchObject({
      ran: false,
      reason: "authorization_expired",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not fetch when the review is overdue", async () => {
    const fetcher = vi.fn<FeedFetcher>();
    const result = await runEmployerFeed(
      feed({
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewDueAt: "2026-07-01T00:00:00.000Z",
      }),
      { now, fetcher, store: new MemoryStore() },
    );
    expect(result).toMatchObject({ ran: false, reason: "review_overdue" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("end-to-end feed run and lifecycle", () => {
  it("drops an unauthorized destination and persists only authorized jobs", async () => {
    const store = new MemoryStore();
    const fetcher: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }, { id: "2", host: "evil.example" }]),
    });
    const result = await runEmployerFeed(feed(), { now, fetcher, store });
    expect(result.metrics).toMatchObject({
      accepted: 1,
      destinationDropped: 1,
      inserted: 1,
      closed: 0,
    });
    expect(store.raw).toHaveLength(1);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("is idempotent on a repeated identical snapshot", async () => {
    const store = new MemoryStore();
    const fetcher: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }]),
    });
    await runEmployerFeed(feed(), { now, fetcher, store });
    const second = await runEmployerFeed(feed(), { now, fetcher, store });
    expect(second.metrics).toMatchObject({
      inserted: 0,
      updated: 0,
      closed: 0,
    });
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("closes a job that disappears from a complete snapshot", async () => {
    const store = new MemoryStore();
    let payload = xml([{ id: "1" }, { id: "2" }]);
    const fetcher: FeedFetcher = async () => ({ ok: true, text: payload });
    await runEmployerFeed(feed(), { now, fetcher, store });
    expect(store.openCount("acme_xml")).toBe(2);

    payload = xml([{ id: "1" }]); // job 2 gone
    const result = await runEmployerFeed(feed(), { now, fetcher, store });
    expect(result.metrics?.closed).toBe(1);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("never closes a job on a failed retrieval (partial snapshot)", async () => {
    const store = new MemoryStore();
    const good: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }]),
    });
    await runEmployerFeed(feed(), { now, fetcher: good, store });
    expect(store.openCount("acme_xml")).toBe(1);

    const failing: FeedFetcher = async () => ({ ok: false, text: "" });
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: failing,
      store,
    });
    expect(result).toMatchObject({ ran: true, reason: "fetch_failed" });
    // Existing job remains open; the partial snapshot closed nothing.
    expect(store.openCount("acme_xml")).toBe(1);
    expect(store.snapshots.at(-1)).toMatchObject({ complete: false });
  });

  it("accepts an authenticated CSV upload without a fetcher", async () => {
    const store = new MemoryStore();
    const csvFeed = feed({
      feedKey: "acme_csv",
      kind: "csv",
      url: null,
      recordElement: undefined,
      fieldMap: {
        externalId: "id",
        title: "title",
        location: "location",
        sourceUrl: "url",
      },
    });
    const result = await runEmployerFeed(csvFeed, {
      now,
      store,
      uploadedPayload:
        'id,title,location,url\n10,Engineer,"Lagos, Nigeria",https://careers.acme.com/jobs/10',
    });
    expect(result.metrics).toMatchObject({ accepted: 1, inserted: 1 });
    expect(store.openCount("acme_csv")).toBe(1);
  });
});
