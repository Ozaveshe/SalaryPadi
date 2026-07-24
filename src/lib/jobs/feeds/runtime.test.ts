import { describe, expect, it, vi } from "vitest";

import { checkDestinationUrl, registrableDomain } from "./domain";
import { parseCsv } from "./extract";
import {
  evaluateSnapshotCompleteness,
  loadRunnableEmployerFeeds,
  runAuthorizedFeedSnapshot,
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
    expectedRootElement: "jobs",
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

function xml(records: Array<{ id: string; host?: string; title?: string }>) {
  return `<jobs>${records
    .map(
      (r) =>
        `<job><id>${r.id}</id><title>${r.title ?? `Role ${r.id}`}</title><location>Lagos, Nigeria</location><url>https://${r.host ?? "careers.acme.com"}/jobs/${r.id}</url></job>`,
    )
    .join("")}</jobs>`;
}

class MemoryStore implements FeedRunStore {
  envelopes: FeedSnapshot["envelopes"] = [];
  jobs = new Map<string, { hash: string; open: boolean }>();
  snapshots: FeedSnapshot[] = [];

  async applySnapshot(snapshot: FeedSnapshot): Promise<FeedPersistResult> {
    this.snapshots.push(snapshot);
    this.envelopes.push(...snapshot.envelopes);
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const job of snapshot.jobs) {
      const key = `${snapshot.feedKey}:${job.external_id}`;
      const existing = this.jobs.get(key);
      if (!existing) inserted += 1;
      else if (existing.hash !== job.content_hash) updated += 1;
      else unchanged += 1;
      this.jobs.set(key, { hash: job.content_hash, open: true });
    }
    let closed = 0;
    // The store honours the runtime's completeness decision: a partial
    // snapshot can never close an absent job.
    if (snapshot.complete) {
      const seen = new Set(snapshot.seenExternalIds);
      for (const [key, value] of this.jobs) {
        if (!key.startsWith(`${snapshot.feedKey}:`)) continue;
        if (!seen.has(key.slice(snapshot.feedKey.length + 1)) && value.open) {
          value.open = false;
          closed += 1;
        }
      }
    }
    return { inserted, updated, unchanged, closed };
  }

  openCount(feedKey: string): number {
    let n = 0;
    for (const [key, value] of this.jobs) {
      if (key.startsWith(`${feedKey}:`) && value.open) n += 1;
    }
    return n;
  }
  lastSnapshot() {
    return this.snapshots.at(-1)!;
  }
}

const ok: FeedFetcher = async () => ({ ok: true, text: xml([{ id: "1" }]) });

/* -------------------------- domain validation ------------------------- */

describe("destination host authorization (tldts)", () => {
  it("rejects bare public suffixes and accepts registrable domains", () => {
    for (const suffix of ["com", "co.uk", "com.ng"]) {
      expect(registrableDomain(suffix)).toBeNull();
    }
    expect(registrableDomain("employer.com")).toBe("employer.com");
    expect(registrableDomain("careers.employer.com")).toBe("employer.com");
    expect(registrableDomain("employer.co.uk")).toBe("employer.co.uk");
    expect(registrableDomain("kuda.com.ng")).toBe("kuda.com.ng");
  });

  it("canonicalises trailing dots, case and punycode", () => {
    expect(registrableDomain("EMPLOYER.COM")).toBe("employer.com");
    expect(registrableDomain("employer.com.")).toBe("employer.com");
    // Unicode is converted to ASCII punycode, so a homograph cannot match a
    // different allowlisted ASCII host.
    const unicode = registrableDomain("employér.com");
    expect(unicode).not.toBe("employer.com");
  });

  it("rejects unrelated, lookalike, non-https, credentialed and local hosts", () => {
    const rules = { allowedHosts: ["employer.com"] };
    const reject = (url: string) =>
      (checkDestinationUrl(url, rules) as { reason: string }).reason;

    expect(checkDestinationUrl("https://employer.com/j/1", rules).ok).toBe(
      true,
    );
    expect(
      checkDestinationUrl("https://careers.employer.com/j/1", rules).ok,
    ).toBe(true);
    expect(reject("https://unrelated-employer.com/j/1")).toBe(
      "host_not_authorized",
    );
    // Lookalike: employer.com.evil.test must not match employer.com.
    expect(reject("https://employer.com.evil.test/j/1")).toBe(
      "host_not_authorized",
    );
    expect(reject("http://employer.com/j/1")).toBe("not_https");
    expect(reject("https://user:pw@employer.com/j/1")).toBe(
      "credentials_present",
    );
    expect(reject("https://employer.com:8443/j/1")).toBe("unexpected_port");
    expect(reject("https://127.0.0.1/j/1")).toBe("ip_literal");
    expect(reject("https://localhost/j/1")).toBe("localhost");
    // Uppercase and trailing dot still match the authorized host.
    expect(checkDestinationUrl("https://EMPLOYER.COM./j/1", rules).ok).toBe(
      true,
    );
  });

  it("blocks a config whose destination host is a bare suffix", () => {
    expect(() => feed({ allowedDestinationHosts: ["com"] })).toThrow(
      /registrable domains/,
    );
  });
});

/* ------------------------ completeness formula ------------------------ */

describe("snapshot completeness formula", () => {
  const base = {
    retrievalOk: true,
    truncated: false,
    parseComplete: true,
    invalidRecordCount: 0,
    quarantinedCount: 0,
    destinationDroppedCount: 0,
    sourceRecordCount: 2,
    parsedRecordCount: 2,
    reportedTotal: null,
    authoritativeEmpty: false,
  };

  it("is complete only when every clause holds", () => {
    expect(evaluateSnapshotCompleteness(base).complete).toBe(true);
  });

  it.each([
    ["retrieval failure", { retrievalOk: false }, "feed_retrieval_failed"],
    ["truncation", { truncated: true }, "feed_response_truncated"],
    ["parse incomplete", { parseComplete: false }, "feed_parse_incomplete"],
    [
      "invalid records",
      { invalidRecordCount: 1, parsedRecordCount: 1 },
      "feed_invalid_records",
    ],
    ["quarantine", { quarantinedCount: 1 }, "feed_import_quarantine"],
    [
      "destination drop",
      { destinationDroppedCount: 1 },
      "feed_destination_rejected",
    ],
    [
      "provider total mismatch",
      { reportedTotal: 5 },
      "feed_provider_total_mismatch",
    ],
    [
      "unproven empty",
      { sourceRecordCount: 0, parsedRecordCount: 0 },
      "feed_unproven_empty",
    ],
  ])("forces partial on %s", (_label, patch, code) => {
    const result = evaluateSnapshotCompleteness({ ...base, ...patch });
    expect(result.complete).toBe(false);
    expect(result.errorCodes).toContain(code);
  });

  it("accepts a proven authoritative zero", () => {
    expect(
      evaluateSnapshotCompleteness({
        ...base,
        sourceRecordCount: 0,
        parsedRecordCount: 0,
        authoritativeEmpty: true,
      }).complete,
    ).toBe(true);
  });

  it("flags unaccounted records", () => {
    const result = evaluateSnapshotCompleteness({
      ...base,
      sourceRecordCount: 5,
      parsedRecordCount: 2,
    });
    expect(result.errorCodes).toContain("feed_record_accounting_mismatch");
  });
});

/* --------------------------- eligibility gates ------------------------ */

describe("no request is made for an ineligible feed", () => {
  const cases: Array<[string, Partial<EmployerFeedConfig>, string]> = [
    ["disabled", { enabled: false }, "disabled"],
    [
      "expired authorization",
      { authorizationExpiresAt: "2026-07-01T00:00:00.000Z" },
      "authorization_expired",
    ],
    [
      "overdue review",
      {
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewDueAt: "2026-07-01T00:00:00.000Z",
      },
      "review_overdue",
    ],
  ];

  it.each(cases)("%s performs no fetch", async (_label, patch, reason) => {
    const fetcher = vi.fn<FeedFetcher>();
    const result = await runEmployerFeed(feed(patch), {
      now,
      fetcher,
      store: new MemoryStore(),
    });
    expect(result).toMatchObject({ ran: false, reason });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks when the GLOBAL source policy is disabled, even if the feed is enabled", async () => {
    // employer_xml_json_feeds is registered as disabled in the source-policy
    // registry, so an enabled per-feed record must still not run.
    const fetcher = vi.fn<FeedFetcher>();
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store: new MemoryStore(),
    });
    expect(result.ran).toBe(false);
    expect(result.reason).toBe("global_policy_blocked");
    expect(result.policyCode).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("registry is empty, so the dispatcher has nothing to run", () => {
    expect(loadRunnableEmployerFeeds(now)).toHaveLength(0);
  });
});

/* ---------------- lifecycle with the global gate stubbed -------------- */

/**
 * The global policy for generic feeds is correctly disabled in the registry
 * (no employer has authorized one), so `runEmployerFeed` never reaches the
 * snapshot path today. The lifecycle rules are proven directly against
 * `runAuthorizedFeedSnapshot`, the post-gate half of the same runtime — no
 * module mocking, and the gate keeps its own tests above.
 */
const runWithGlobalGateOpen = runAuthorizedFeedSnapshot;

describe("snapshot lifecycle", () => {
  it("a failed retrieval records a partial snapshot and closes nothing", async () => {
    const store = new MemoryStore();
    await runWithGlobalGateOpen(feed(), { now, fetcher: ok, store });
    expect(store.openCount("acme_xml")).toBe(1);

    const failing: FeedFetcher = async () => ({ ok: false, text: "" });
    const result = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: failing,
      store,
    });
    expect(result).toMatchObject({ ran: true, reason: "fetch_failed" });
    expect(store.lastSnapshot().complete).toBe(false);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a malformed document cannot close an existing job", async () => {
    const store = new MemoryStore();
    await runWithGlobalGateOpen(feed(), { now, fetcher: ok, store });
    const broken: FeedFetcher = async () => ({
      ok: true,
      text: "<jobs><job><id>1</id>",
    });
    await runWithGlobalGateOpen(feed(), { now, fetcher: broken, store });
    expect(store.lastSnapshot().complete).toBe(false);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a destination-dropped record forces partial and closes nothing", async () => {
    const store = new MemoryStore();
    await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: async () => ({
        ok: true,
        text: xml([{ id: "1" }, { id: "2" }]),
      }),
      store,
    });
    expect(store.openCount("acme_xml")).toBe(2);

    const withForeign: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }, { id: "2", host: "evil.test" }]),
    });
    const result = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: withForeign,
      store,
    });
    expect(result.metrics?.destinationDropped).toBe(1);
    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(result.metrics?.errorCodes).toContain("feed_destination_rejected");
    // Job 2 vanished from the authorized set but MUST NOT be closed.
    expect(store.openCount("acme_xml")).toBe(2);
  });

  it("an over-limit feed fails closed rather than truncating", async () => {
    const store = new MemoryStore();
    const many = Array.from({ length: 5_001 }, (_, i) => ({ id: String(i) }));
    const result = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: async () => ({ ok: true, text: xml(many) }),
      store,
    });
    expect(result).toMatchObject({ ran: true, reason: "feed_error" });
    expect(store.lastSnapshot().errorCodes).toContain(
      "feed_record_limit_exceeded",
    );
    expect(store.lastSnapshot().complete).toBe(false);
  });

  it("an unproven empty parse cannot close prior jobs, but a proven zero can", async () => {
    const store = new MemoryStore();
    await runWithGlobalGateOpen(feed(), { now, fetcher: ok, store });
    expect(store.openCount("acme_xml")).toBe(1);

    // Wrong root: this is a shape change, not "no jobs".
    const wrongRoot: FeedFetcher = async () => ({
      ok: true,
      text: "<vacancies></vacancies>",
    });
    await runWithGlobalGateOpen(feed(), { now, fetcher: wrongRoot, store });
    expect(store.lastSnapshot().complete).toBe(false);
    expect(store.openCount("acme_xml")).toBe(1);

    // Correct, well-formed, empty container: a proven authoritative zero.
    const provenZero: FeedFetcher = async () => ({
      ok: true,
      text: "<jobs></jobs>",
    });
    const result = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: provenZero,
      store,
    });
    expect(result.metrics?.snapshotComplete).toBe(true);
    expect(result.metrics?.closed).toBe(1);
    expect(store.openCount("acme_xml")).toBe(0);
  });

  it("is idempotent, updates on change, and closes on a clean complete snapshot", async () => {
    const store = new MemoryStore();
    const two: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }, { id: "2" }]),
    });
    const first = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: two,
      store,
    });
    expect(first.metrics).toMatchObject({
      inserted: 2,
      snapshotComplete: true,
    });

    const second = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: two,
      store,
    });
    expect(second.metrics).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 2,
      closed: 0,
    });

    const changed: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1", title: "Renamed Role" }, { id: "2" }]),
    });
    const third = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: changed,
      store,
    });
    expect(third.metrics?.updated).toBe(1);

    const one: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "1" }]),
    });
    const fourth = await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: one,
      store,
    });
    expect(fourth.metrics?.snapshotComplete).toBe(true);
    expect(fourth.metrics?.closed).toBe(1);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("retains evidence for every source record, including rejected ones", async () => {
    const store = new MemoryStore();
    await runWithGlobalGateOpen(feed(), {
      now,
      fetcher: async () => ({
        ok: true,
        text: xml([{ id: "1" }, { id: "2", host: "evil.test" }]),
      }),
      store,
    });
    expect(store.envelopes).toHaveLength(2);
    const rejected = store.envelopes.find((e) => e.externalId === "2")!;
    expect(rejected.extractionOutcome).toBe("destination_rejected");
    expect(rejected.extractionReason).toBe("host_not_authorized");
    expect(rejected.sourceRecordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rejected.parserVersion).toBeTruthy();
  });
});

describe("strict CSV parsing", () => {
  it("rejects characters after a closing quote", () => {
    expect(() => parseCsv('a,"quoted"garbage,c')).toThrow("feed_malformed");
  });
  it("accepts a well-formed quoted row", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });
});
