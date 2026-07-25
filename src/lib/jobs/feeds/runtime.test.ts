import { describe, expect, it, vi } from "vitest";

import { normalizeAtsImportRecords } from "@/lib/jobs/ats-import";
import { AdapterPolicyError } from "@/lib/jobs/supply/policy";

import { computeFeedSnapshotCompleteness } from "./completeness";
import {
  feedRunEligibility,
  loadRunnableEmployerFeeds,
  runEmployerFeed,
  type FeedFetcher,
  type FeedPersistResult,
  type FeedRunStore,
  type FeedSnapshot,
  type SourcePolicyGate,
} from "./runtime";
import {
  employerFeedConfigSchema,
  MAX_FEED_RECORDS,
  type EmployerFeedConfig,
} from "./types";

const now = new Date("2026-07-24T12:00:00.000Z");

/** The committed global policy is disabled, so every run-path test injects an
 * explicitly permissive gate rather than mutating the shipped registry. */
const allowPolicy: SourcePolicyGate = () => {};

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
      publishedAt: "published",
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

type XmlRecord = {
  id: string;
  host?: string;
  title?: string;
  published?: string;
};

function xml(records: XmlRecord[]): string {
  return `<jobs>${records
    .map(
      (record) =>
        `<job><id>${record.id}</id><title>${record.title ?? `Role ${record.id}`}</title>` +
        `<location>Lagos, Nigeria</location>` +
        (record.published ? `<published>${record.published}</published>` : "") +
        `<url>https://${record.host ?? "careers.acme.com"}/jobs/${record.id}</url></job>`,
    )
    .join("")}</jobs>`;
}

/** In-memory store modelling raw evidence, canonical upsert and absence
 * handling, so the runtime's lifecycle guarantees are observable. */
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
    let count = 0;
    for (const [key, value] of this.jobs) {
      if (key.startsWith(`${feedKey}:`) && value.open) count += 1;
    }
    return count;
  }
}

/** Seeds one open job so a later run can be shown not to close it. */
async function seedOneOpenJob(store: MemoryStore): Promise<void> {
  const fetcher: FeedFetcher = async () => ({
    ok: true,
    text: xml([{ id: "1" }]),
  });
  await runEmployerFeed(feed(), {
    now,
    fetcher,
    store,
    policyGate: allowPolicy,
  });
  expect(store.openCount("acme_xml")).toBe(1);
}

describe("global source-policy gate", () => {
  const cases: Array<[string, string]> = [
    ["globally disabled", "policy_disabled"],
    ["globally expired", "policy_expired"],
    ["review overdue", "policy_review_overdue"],
    ["dependencies missing", "policy_dependency_missing"],
    ["required fields disallowed", "policy_field_not_allowed"],
  ];

  for (const [label, code] of cases) {
    it(`makes no network request when the global policy is ${label}`, async () => {
      const fetcher = vi.fn<FeedFetcher>();
      const store = new MemoryStore();
      const blocked: SourcePolicyGate = () => {
        throw new AdapterPolicyError(
          code as ConstructorParameters<typeof AdapterPolicyError>[0],
          "employer_xml_json_feeds",
        );
      };

      const result = await runEmployerFeed(feed(), {
        now,
        fetcher,
        store,
        policyGate: blocked,
      });

      expect(result).toMatchObject({
        ran: false,
        reason: "policy_blocked",
        policyCode: code,
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect(store.snapshots).toHaveLength(0);
    });
  }

  it("blocks a CSV upload before processing the payload", async () => {
    const store = new MemoryStore();
    const blocked: SourcePolicyGate = () => {
      throw new AdapterPolicyError("policy_disabled", "employer_csv_import");
    };
    const result = await runEmployerFeed(
      feed({
        kind: "csv",
        url: null,
        recordElement: undefined,
        expectedRootElement: undefined,
      }),
      {
        now,
        store,
        uploadedPayload: "id,title,url\n1,Role,https://careers.acme.com/1",
        policyGate: blocked,
      },
    );

    expect(result).toMatchObject({ ran: false, reason: "policy_blocked" });
    expect(store.snapshots).toHaveLength(0);
  });

  it("a per-feed enabled record cannot override the global gate", async () => {
    const fetcher = vi.fn<FeedFetcher>();
    const blocked: SourcePolicyGate = () => {
      throw new AdapterPolicyError(
        "policy_disabled",
        "employer_xml_json_feeds",
      );
    };
    const result = await runEmployerFeed(feed({ enabled: true }), {
      now,
      fetcher,
      store: new MemoryStore(),
      policyGate: blocked,
    });
    expect(result.ran).toBe(false);
    expect(result.reason).toBe("policy_blocked");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("the committed registry yields no runnable feed under the real policy", () => {
    // Both gates shut: the registry is empty AND the global policy is disabled.
    expect(loadRunnableEmployerFeeds(now)).toEqual([]);
  });

  it("the real committed global policy blocks generic feeds today", () => {
    // No injected gate: this exercises the production policy path against the
    // committed registry, where employer_xml_json_feeds is disabled with
    // unmet dependencies. A fully authorized per-feed record still cannot run.
    const eligibility = feedRunEligibility(feed({ enabled: true }), now);
    expect(eligibility.runnable).toBe(false);
    expect(eligibility.reason).toBe("policy_blocked");
    expect(eligibility.policyCode).toBe("policy_disabled");
  });

  it("the real committed global policy blocks CSV imports today", () => {
    const eligibility = feedRunEligibility(
      feed({
        kind: "csv",
        url: null,
        recordElement: undefined,
        expectedRootElement: undefined,
      }),
      now,
    );
    expect(eligibility.runnable).toBe(false);
    expect(eligibility.reason).toBe("policy_blocked");
  });

  it("makes no network request under the real policy either", async () => {
    const fetcher = vi.fn<FeedFetcher>();
    const store = new MemoryStore();
    const result = await runEmployerFeed(feed(), { now, fetcher, store });
    expect(result).toMatchObject({ ran: false, reason: "policy_blocked" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.snapshots).toHaveLength(0);
  });
});

describe("per-feed authorization gates run before any network call", () => {
  const blockedCases: Array<[string, Partial<EmployerFeedConfig>, string]> = [
    ["disabled", { enabled: false }, "disabled"],
    [
      // After authorizedAt (2026-07-01) but before `now` (2026-07-24), so the
      // schema's ordering rule is satisfied and only the expiry gate fires.
      "expired authorization",
      { authorizationExpiresAt: "2026-07-10T00:00:00.000Z" },
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
    [
      "future-dated authorization",
      { authorizedAt: "2026-08-01T00:00:00.000Z" },
      "authorization_not_yet_valid",
    ],
    [
      "future-dated review",
      {
        reviewedAt: "2026-08-01T00:00:00.000Z",
        reviewDueAt: "2026-12-01T00:00:00.000Z",
      },
      "authorization_not_yet_valid",
    ],
  ];

  for (const [label, overrides, reason] of blockedCases) {
    it(`does not fetch a feed with ${label}`, async () => {
      const fetcher = vi.fn<FeedFetcher>();
      const result = await runEmployerFeed(feed(overrides), {
        now,
        fetcher,
        store: new MemoryStore(),
        policyGate: allowPolicy,
      });
      expect(result).toMatchObject({ ran: false, reason });
      expect(fetcher).not.toHaveBeenCalled();
    });
  }

  it("tolerates authorization timestamps inside the clock-skew allowance", () => {
    const justAhead = new Date(now.valueOf() + 60_000).toISOString();
    expect(
      feedRunEligibility(
        feed({ authorizedAt: justAhead, reviewedAt: justAhead }),
        now,
        allowPolicy,
      ).runnable,
    ).toBe(true);
  });
});

describe("quarantined records force a partial snapshot", () => {
  it("a duplicate external id never closes an existing job", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const fetcher: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "2" }, { id: "2" }]),
    });
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics?.quarantined).toBeGreaterThan(0);
    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(result.metrics?.incompletenessReasons).toContain(
      "records_quarantined",
    );
    expect(store.snapshots.at(-1)).toMatchObject({ complete: false });
    expect(result.metrics?.closed).toBe(0);
    // Job 1 is absent from this snapshot but must remain open.
    expect(store.openCount("acme_xml")).toBe(2);
  });

  it("an invalid timestamp never closes an existing job", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const fetcher: FeedFetcher = async () => ({
      ok: true,
      text: xml([{ id: "2", published: "not-a-timestamp" }]),
    });
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics?.quarantined).toBeGreaterThan(0);
    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("an unusable record URL never closes an existing job", async () => {
    // Malformed URLs are now rejected at extraction rather than quarantined,
    // which is stricter: the record never reaches normalization. The safety
    // property is unchanged — the snapshot is partial and closes nothing.
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const fetcher: FeedFetcher = async () => ({
      ok: true,
      text: `<jobs><job><id>2</id><title>Role 2</title><url>javascript:alert(1)</url></job></jobs>`,
    });
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics?.invalidRecords).toBe(1);
    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(result.metrics?.incompletenessReasons).toContain(
      "invalid_records_discarded",
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a source identity mismatch is quarantined and blocks completeness", () => {
    // The runtime always builds records from its own config, so this quarantine
    // is proven at the normalizer boundary and then fed through the one
    // completeness formula the runtime uses.
    const normalized = normalizeAtsImportRecords(
      [
        {
          provider: "employer_xml_feed",
          sourceKey: "someone_elses_feed",
          employerName: "Other Employer",
          externalId: "1",
          title: "Role",
          location: null,
          workplaceType: null,
          employmentType: null,
          department: null,
          team: null,
          descriptionHtml: null,
          descriptionText: null,
          publishedAt: null,
          updatedAt: null,
          sourceUrl: "https://careers.acme.com/jobs/1",
          applicationUrl: "https://careers.acme.com/jobs/1",
          checkedAt: now.toISOString(),
        },
      ],
      {
        sourceKey: "acme_xml",
        employerName: "Acme Nigeria",
        mayStoreFullDescription: false,
      },
      now,
    );

    expect(normalized.quarantineCodes.source_identity_mismatch).toBe(1);
    const completeness = computeFeedSnapshotCompleteness({
      retrievalComplete: true,
      withinByteLimit: true,
      extraction: {
        sourceRecordCount: 1,
        mappedRecordCount: 1,
        invalidRecordCount: 0,
        destinationDroppedCount: 0,
        truncated: false,
        parseComplete: true,
        containerFound: true,
        authoritativeEmpty: false,
        providerReportedCount: null,
      },
      quarantinedCount: normalized.quarantinedCount,
      acceptedCount: 0,
    });
    expect(completeness.complete).toBe(false);
    expect(completeness.reasons).toContain("records_quarantined");
  });
});

describe("truncation never authorizes closure", () => {
  it("a feed above the record cap is partial and closes nothing", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const oversized = xml(
      Array.from({ length: MAX_FEED_RECORDS + 1 }, (_, index) => ({
        id: `t${index}`,
      })),
    );
    const fetcher: FeedFetcher = async () => ({ ok: true, text: oversized });
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics?.truncated).toBe(true);
    expect(result.metrics?.fetched).toBe(MAX_FEED_RECORDS + 1);
    expect(result.metrics?.accepted).toBe(MAX_FEED_RECORDS);
    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(result.metrics?.incompletenessReasons).toContain(
      "record_limit_exceeded",
    );
    expect(result.metrics?.extractionReasonCodes).toContain(
      "record_limit_exceeded",
    );
    expect(result.metrics?.closed).toBe(0);
    // The originally seeded job is absent from the truncated view yet open.
    expect(store.openCount("acme_xml")).toBe(MAX_FEED_RECORDS + 1);
  });
});

describe("authoritative empty versus mapping failure", () => {
  async function runWith(
    config: EmployerFeedConfig,
    payload: string,
  ): Promise<{ store: MemoryStore; closed: number | undefined }> {
    const store = new MemoryStore();
    await seedOneOpenJob(store);
    const result = await runEmployerFeed(config, {
      now,
      fetcher: async () => ({ ok: true, text: payload }),
      store,
      policyGate: allowPolicy,
    });
    return { store, closed: result.metrics?.closed };
  }

  it("a permitted, structurally proven empty feed closes prior jobs", async () => {
    const { store, closed } = await runWith(
      feed({ allowAuthoritativeEmpty: true }),
      "<jobs></jobs>",
    );
    expect(closed).toBe(1);
    expect(store.openCount("acme_xml")).toBe(0);
    expect(store.snapshots.at(-1)).toMatchObject({ complete: true });
  });

  it("an empty feed without that permission closes nothing", async () => {
    const { store } = await runWith(
      feed({ allowAuthoritativeEmpty: false }),
      "<jobs></jobs>",
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a renamed XML id element cannot close jobs", async () => {
    const { store } = await runWith(
      feed({ allowAuthoritativeEmpty: true }),
      `<jobs><job><job_id>1</job_id><title>Role</title><url>https://careers.acme.com/jobs/1</url></job></jobs>`,
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a missing XML field mapping cannot close jobs", async () => {
    const { store } = await runWith(
      feed({ allowAuthoritativeEmpty: true }),
      `<jobs><job><id>9</id><url>https://careers.acme.com/jobs/9</url></job></jobs>`,
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a wrong JSON recordsPath cannot close jobs", async () => {
    const jsonFeed = feed({
      kind: "json",
      recordElement: undefined,
      expectedRootElement: undefined,
      recordsPath: "data.jobs",
      allowAuthoritativeEmpty: true,
      fieldMap: { externalId: "id", title: "title", sourceUrl: "url" },
    });
    const { store } = await runWith(
      jsonFeed,
      JSON.stringify({ results: [{ id: 1 }] }),
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a CSV header mismatch cannot close jobs", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);
    const csvFeed = feed({
      kind: "csv",
      url: null,
      recordElement: undefined,
      expectedRootElement: undefined,
      allowAuthoritativeEmpty: true,
      fieldMap: { externalId: "id", title: "title", sourceUrl: "url" },
    });

    await runEmployerFeed(csvFeed, {
      now,
      store,
      uploadedPayload: "ref,name,link\n1,Role,https://careers.acme.com/1",
      policyGate: allowPolicy,
    });
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a malformed payload cannot close jobs", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const result = await runEmployerFeed(
      feed({ allowAuthoritativeEmpty: true }),
      {
        now,
        fetcher: async () => ({ ok: true, text: "<jobs><job><id>1</id>" }),
        store,
        policyGate: allowPolicy,
      },
    );

    expect(result).toMatchObject({ ran: true, reason: "feed_error" });
    expect(store.snapshots.at(-1)).toMatchObject({
      complete: false,
      incompletenessReasons: ["parse_incomplete"],
    });
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a DTD payload cannot close jobs", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const result = await runEmployerFeed(
      feed({ allowAuthoritativeEmpty: true }),
      {
        now,
        fetcher: async () => ({
          ok: true,
          text: `<!DOCTYPE jobs [<!ENTITY x "y">]><jobs></jobs>`,
        }),
        store,
        policyGate: allowPolicy,
      },
    );

    expect(result.reason).toBe("feed_error");
    expect(store.openCount("acme_xml")).toBe(1);
  });
});

describe("retrieval and payload limits", () => {
  it("a failed retrieval records a partial snapshot and closes nothing", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: async () => ({ ok: false, text: "" }),
      store,
      policyGate: allowPolicy,
    });

    expect(result).toMatchObject({ ran: true, reason: "fetch_failed" });
    expect(store.snapshots.at(-1)).toMatchObject({
      complete: false,
      incompletenessReasons: ["retrieval_incomplete"],
    });
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("a fetcher that threw records a partial snapshot", async () => {
    const store = new MemoryStore();
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: async () => {
        throw new Error("socket hang up");
      },
      store,
      policyGate: allowPolicy,
    });
    expect(result).toMatchObject({ ran: true, reason: "fetch_failed" });
    expect(store.snapshots.at(-1)).toMatchObject({ complete: false });
  });

  it("an incomplete body is never treated as authoritative", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const result = await runEmployerFeed(
      feed({ allowAuthoritativeEmpty: true }),
      {
        now,
        // A body that parses but was cut short by the byte cap or deadline.
        fetcher: async () => ({ ok: true, text: xml([]), complete: false }),
        store,
        policyGate: allowPolicy,
      },
    );

    expect(result.metrics?.snapshotComplete).toBe(false);
    expect(result.metrics?.incompletenessReasons).toContain(
      "retrieval_incomplete",
    );
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("an oversized payload records a partial snapshot and closes nothing", async () => {
    const store = new MemoryStore();
    await seedOneOpenJob(store);

    const huge = `<jobs>${"<pad>x</pad>".repeat(900_000)}</jobs>`;
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: async () => ({ ok: true, text: huge }),
      store,
      policyGate: allowPolicy,
    });

    expect(result).toMatchObject({ ran: true, reason: "payload_too_large" });
    expect(store.snapshots.at(-1)).toMatchObject({
      complete: false,
      incompletenessReasons: ["payload_too_large"],
    });
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("refuses a config whose authorization fields were stripped after validation", () => {
    // Defensive: the schema already forbids enabled-without-rights, so this
    // guards against a config assembled outside the schema.
    const stripped = {
      ...feed(),
      rightsBasis: null,
    } as unknown as EmployerFeedConfig;
    expect(feedRunEligibility(stripped, now, allowPolicy)).toMatchObject({
      runnable: false,
      reason: "authorization_incomplete",
    });
  });

  it("counts a publication-filtered record without marking it quarantined", async () => {
    const store = new MemoryStore();
    // A role whose stated workplace resolves outside the published markets is
    // filtered by the shared publication gate, not quarantined.
    const payload = `<jobs><job><id>1</id><title>Analyst</title><location>Berlin, Germany</location><url>https://careers.acme.com/jobs/1</url></job></jobs>`;
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: async () => ({ ok: true, text: payload }),
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics?.filtered).toBeGreaterThan(0);
    expect(result.metrics?.quarantined).toBe(0);
    expect(result.metrics?.accepted).toBe(0);
    // Zero accepted records is never authoritative without permission.
    expect(result.metrics?.snapshotComplete).toBe(false);
  });

  it("rethrows an unexpected extraction error instead of hiding it as partial", async () => {
    // A programming fault must surface, not be silently recorded as a partial
    // snapshot that looks like an ordinary bad payload.
    vi.resetModules();
    vi.doMock("./index", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./index")>();
      return {
        ...actual,
        extractEmployerFeedRecords: () => {
          throw new TypeError("unexpected internal fault");
        },
      };
    });

    const { runEmployerFeed: isolatedRun } = await import("./runtime");
    const store = new MemoryStore();
    await expect(
      isolatedRun(feed(), {
        now,
        fetcher: async () => ({ ok: true, text: xml([{ id: "1" }]) }),
        store,
        policyGate: allowPolicy,
      }),
    ).rejects.toThrow("unexpected internal fault");

    vi.doUnmock("./index");
    vi.resetModules();
  });

  it("returns no_payload without a fetcher or an upload", async () => {
    const store = new MemoryStore();
    expect(
      await runEmployerFeed(feed(), { now, store, policyGate: allowPolicy }),
    ).toMatchObject({ ran: false, reason: "no_payload" });

    expect(
      await runEmployerFeed(
        feed({
          kind: "csv",
          url: null,
          recordElement: undefined,
          expectedRootElement: undefined,
        }),
        { now, store, policyGate: allowPolicy },
      ),
    ).toMatchObject({ ran: false, reason: "no_payload" });
  });
});

describe("healthy lifecycle still works", () => {
  it("inserts, is idempotent, and closes a genuinely withdrawn job", async () => {
    const store = new MemoryStore();
    let payload = xml([{ id: "1" }, { id: "2" }]);
    const fetcher: FeedFetcher = async () => ({ ok: true, text: payload });

    const first = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });
    expect(first.metrics).toMatchObject({
      inserted: 2,
      snapshotComplete: true,
    });

    const second = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });
    expect(second.metrics).toMatchObject({
      inserted: 0,
      updated: 0,
      closed: 0,
    });

    payload = xml([{ id: "1" }]);
    const third = await runEmployerFeed(feed(), {
      now,
      fetcher,
      store,
      policyGate: allowPolicy,
    });
    expect(third.metrics?.snapshotComplete).toBe(true);
    expect(third.metrics?.closed).toBe(1);
    expect(store.openCount("acme_xml")).toBe(1);
  });

  it("drops an unauthorized destination and marks the snapshot partial", async () => {
    const store = new MemoryStore();
    const result = await runEmployerFeed(feed(), {
      now,
      fetcher: async () => ({
        ok: true,
        text: xml([{ id: "1" }, { id: "2", host: "evil.example" }]),
      }),
      store,
      policyGate: allowPolicy,
    });

    expect(result.metrics).toMatchObject({
      accepted: 1,
      destinationDropped: 1,
      inserted: 1,
      closed: 0,
      snapshotComplete: false,
    });
    expect(result.metrics?.incompletenessReasons).toContain(
      "destination_dropped",
    );
  });

  it("accepts an authenticated CSV upload without a fetcher", async () => {
    const store = new MemoryStore();
    const csvFeed = feed({
      feedKey: "acme_csv",
      kind: "csv",
      url: null,
      recordElement: undefined,
      expectedRootElement: undefined,
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
      policyGate: allowPolicy,
    });

    expect(result.metrics).toMatchObject({
      accepted: 1,
      inserted: 1,
      snapshotComplete: true,
    });
    expect(store.openCount("acme_csv")).toBe(1);
  });
});

describe("one completeness contract", () => {
  const healthy = {
    retrievalComplete: true,
    withinByteLimit: true,
    extraction: {
      records: [],
      sourceRecordCount: 2,
      mappedRecordCount: 2,
      invalidRecordCount: 0,
      destinationDroppedCount: 0,
      truncated: false,
      parseComplete: true,
      containerFound: true,
      authoritativeEmpty: false,
      providerReportedCount: null,
    },
    quarantinedCount: 0,
    acceptedCount: 2,
  };

  it("is complete only when every condition holds", () => {
    expect(computeFeedSnapshotCompleteness(healthy).complete).toBe(true);
  });

  it("names each blocking condition", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ retrievalComplete: false }, "retrieval_incomplete"],
      [{ withinByteLimit: false }, "payload_too_large"],
      [{ quarantinedCount: 1 }, "records_quarantined"],
      [{ acceptedCount: 0 }, "empty_not_authoritative"],
    ];
    for (const [override, reason] of cases) {
      const result = computeFeedSnapshotCompleteness({
        ...healthy,
        ...override,
      } as typeof healthy);
      expect(result.complete, reason).toBe(false);
      expect(result.reasons, reason).toContain(reason);
    }
  });

  it("names each blocking extraction condition", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ parseComplete: false }, "parse_incomplete"],
      [{ truncated: true }, "record_limit_exceeded"],
      [{ containerFound: false }, "container_missing"],
      [{ invalidRecordCount: 1 }, "invalid_records_discarded"],
      [{ destinationDroppedCount: 1 }, "destination_dropped"],
      [{ providerReportedCount: 99 }, "provider_count_mismatch"],
      [{ mappedRecordCount: 1 }, "records_unaccounted"],
    ];
    for (const [override, reason] of cases) {
      const result = computeFeedSnapshotCompleteness({
        ...healthy,
        extraction: { ...healthy.extraction, ...override },
      } as typeof healthy);
      expect(result.complete, reason).toBe(false);
      expect(result.reasons, reason).toContain(reason);
    }
  });

  it("permits a proven authoritative empty result", () => {
    const result = computeFeedSnapshotCompleteness({
      ...healthy,
      extraction: {
        ...healthy.extraction,
        sourceRecordCount: 0,
        mappedRecordCount: 0,
        authoritativeEmpty: true,
      },
      acceptedCount: 0,
    });
    expect(result.complete).toBe(true);
  });
});
