import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  employerFeedConfigSchema,
  type EmployerFeedConfig,
} from "../../../src/lib/jobs/feeds/types";
import type { FeedSnapshot } from "../../../src/lib/jobs/feeds/runtime";
import {
  recordFeedRunMetrics,
  SupabaseFeedRunStore,
  type StoreRpc,
} from "./feed-run-store";

const RUN_ID = "00000000-0000-4000-8000-0000000000aa";

function config(): EmployerFeedConfig {
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
  });
}

function job(externalId: string) {
  return {
    external_id: externalId,
    slug: `role-${externalId}`,
    title: `Role ${externalId}`,
    description_text: null,
    raw_payload: null,
    work_arrangement: "onsite",
    employment_type: "full_time",
    engagement_type: "employee",
    application_url: `https://careers.acme.com/jobs/${externalId}`,
    source_url: `https://careers.acme.com/jobs/${externalId}`,
    posted_at: null,
    last_checked_at: "2026-07-24T12:00:00.000Z",
    content_hash: "a".repeat(64),
    dedup_fingerprint: "b".repeat(64),
    eligibility: {
      scope: "nigeria",
      evidence_text: "Lagos, Nigeria",
      provenance: "source_provided",
      countries: [],
    },
    locations: [],
  } as unknown as FeedSnapshot["jobs"][number];
}

function snapshot(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    feedKey: "acme_xml",
    runAt: "2026-07-24T12:00:00.000Z",
    complete: true,
    incompletenessReasons: [],
    seenExternalIds: ["1"],
    raw: [],
    jobs: [job("1")],
    ...overrides,
  };
}

/** A fake RPC that records calls and returns valid acknowledgements. */
function fakeRpc(overrides: Record<string, unknown> = {}): {
  rpc: StoreRpc;
  calls: Array<{ name: string; params: unknown }>;
} {
  const calls: Array<{ name: string; params: unknown }> = [];
  const rpc: StoreRpc = async <T>(
    name: string,
    schema: z.ZodType<T>,
    params: Record<string, unknown> = {},
  ): Promise<T> => {
    calls.push({ name, params });
    if (name in overrides) {
      const value = overrides[name];
      if (typeof value === "function") {
        return (value as (p: unknown) => T)(params);
      }
      return value as T;
    }
    const defaults: Record<string, unknown> = {
      worker_begin_ats_snapshot: [{ import_run_id: RUN_ID, should_run: true }],
      worker_store_ats_snapshot_batch: [
        { accepted_count: 1, rejected_count: 0 },
      ],
      worker_finalize_ats_snapshot: [
        {
          outcome: "complete",
          created_count: 1,
          updated_count: 0,
          unchanged_count: 0,
          expired_count: 0,
          filtered_count: 0,
        },
      ],
      worker_store_feed_evidence: 1,
      worker_record_feed_run_metrics: true,
    };
    void schema;
    return defaults[name] as T;
  };
  return { rpc, calls };
}

describe("Supabase feed run store", () => {
  it("persists through the shared ATS snapshot lifecycle", async () => {
    const { rpc, calls } = fakeRpc();
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    const result = await store.applySnapshot(snapshot());

    expect(calls.map((call) => call.name)).toEqual([
      "worker_begin_ats_snapshot",
      "worker_store_feed_evidence",
      "worker_store_ats_snapshot_batch",
      "worker_finalize_ats_snapshot",
    ]);
    expect(result).toEqual({ inserted: 1, updated: 0, closed: 0 });
    expect(store.lastResult).toMatchObject({
      outcome: "complete",
      importRunId: RUN_ID,
    });
  });

  it("forwards the completeness decision verbatim to finalize", async () => {
    const { rpc, calls } = fakeRpc({
      worker_finalize_ats_snapshot: [
        {
          outcome: "partial",
          created_count: 0,
          updated_count: 0,
          unchanged_count: 1,
          expired_count: 0,
          filtered_count: 0,
        },
      ],
    });
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    await store.applySnapshot(
      snapshot({
        complete: false,
        incompletenessReasons: ["records_quarantined"],
      }),
    );

    const finalize = calls.find(
      (call) => call.name === "worker_finalize_ats_snapshot",
    );
    expect(finalize?.params).toMatchObject({
      p_complete: false,
      p_error_codes: ["records_quarantined"],
    });
  });

  it("refuses a partial snapshot that closed jobs", async () => {
    // Defence in depth: if the database ever expired rows under a partial
    // snapshot, that is a lifecycle violation and must fail loudly.
    const { rpc } = fakeRpc({
      worker_finalize_ats_snapshot: [
        {
          outcome: "partial",
          created_count: 0,
          updated_count: 0,
          unchanged_count: 0,
          expired_count: 3,
          filtered_count: 0,
        },
      ],
    });
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    await expect(
      store.applySnapshot(snapshot({ complete: false })),
    ).rejects.toMatchObject({ code: "feed_partial_snapshot_closed_jobs" });
  });

  it("fails an unacknowledged batch instead of reporting success", async () => {
    const { rpc } = fakeRpc({
      worker_store_ats_snapshot_batch: [
        { accepted_count: 0, rejected_count: 0 },
      ],
    });
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    await expect(store.applySnapshot(snapshot())).rejects.toMatchObject({
      code: "feed_batch_not_acknowledged",
    });
  });

  it("records a terminal failed snapshot when persistence fails", async () => {
    const finalizeCalls: unknown[] = [];
    const { rpc } = fakeRpc({
      worker_store_ats_snapshot_batch: () => {
        throw new Error("database unavailable");
      },
      worker_finalize_ats_snapshot: (params: unknown) => {
        finalizeCalls.push(params);
        return [
          {
            outcome: "failed",
            created_count: 0,
            updated_count: 0,
            unchanged_count: 0,
            expired_count: 0,
            filtered_count: 0,
          },
        ];
      },
    });
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    await expect(store.applySnapshot(snapshot())).rejects.toThrow(
      "database unavailable",
    );
    // The snapshot is closed out as failed rather than left open forever.
    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0]).toMatchObject({ p_complete: false });
    expect(store.lastResult).toMatchObject({ outcome: "failed" });
  });

  it("treats a duplicate run as duplicate, not as fresh work", async () => {
    const { rpc, calls } = fakeRpc({
      worker_begin_ats_snapshot: [{ import_run_id: RUN_ID, should_run: false }],
    });
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });

    const result = await store.applySnapshot(snapshot());
    expect(result).toEqual({ inserted: 0, updated: 0, closed: 0 });
    expect(store.lastResult?.outcome).toBe("duplicate");
    expect(calls.map((call) => call.name)).toEqual([
      "worker_begin_ats_snapshot",
    ]);
  });

  it("withholds the payload when the policy forbids full storage", async () => {
    const { rpc, calls } = fakeRpc();
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
    });
    await store.applySnapshot(snapshot());

    const evidence = calls.find(
      (call) => call.name === "worker_store_feed_evidence",
    )?.params as { p_records: Array<Record<string, unknown>> };
    expect(evidence.p_records[0]?.permitted_payload).toBeNull();
    // The hash and metadata are always retained, so the record is still
    // accounted for.
    expect(evidence.p_records[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.p_records[0]?.parser_version).toBeTruthy();
    expect(evidence.p_records[0]?.field_map_version).toBeTruthy();
  });

  it("records evidence for records excluded before normalization", async () => {
    const { rpc, calls } = fakeRpc();
    const store = new SupabaseFeedRunStore({
      rpc,
      config: config(),
      mayStoreFullDescription: false,
      excluded: { destinationNotAuthorized: 2, requiredFieldMissing: 1 },
    });
    await store.applySnapshot(snapshot());

    const evidence = calls.find(
      (call) => call.name === "worker_store_feed_evidence",
    )?.params as { p_records: Array<Record<string, unknown>> };
    const outcomes = evidence.p_records.map(
      (record) => record.extraction_outcome,
    );
    expect(outcomes).toContain("destination_not_authorized");
    expect(outcomes).toContain("required_field_missing");
  });
});

describe("durable feed run metrics", () => {
  it("records a terminal outcome for an attempt that never opened a snapshot", async () => {
    const rpc = vi.fn(async () => true) as unknown as StoreRpc;
    await recordFeedRunMetrics(rpc, {
      feed_key: "acme_xml",
      run_at: "2026-07-24T12:00:00.000Z",
      outcome: "policy_blocked",
      error_code: "policy_disabled",
    });
    expect(rpc).toHaveBeenCalledWith(
      "worker_record_feed_run_metrics",
      expect.anything(),
      {
        p_metrics: expect.objectContaining({ outcome: "policy_blocked" }),
      },
      { signal: undefined },
    );
  });
});
