import { describe, expect, it, vi } from "vitest";

import {
  loadRunnableEmployerFeeds,
  type FeedSnapshot,
} from "../../../src/lib/jobs/feeds/runtime";

import { createSupabaseFeedRunStore } from "./employer-feed-store";

function snapshot(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    feedKey: "acme_xml",
    runAt: "2026-07-24T12:00:00.000Z",
    complete: true,
    errorCodes: [],
    seenExternalIds: ["1"],
    envelopes: [],
    jobs: [],
    counts: {
      sourceRecords: 1,
      parsedRecords: 1,
      acceptedRecords: 1,
      invalidRecords: 0,
      filteredRecords: 0,
      quarantinedRecords: 0,
      destinationDropped: 0,
    },
    ...overrides,
  };
}

describe("employer feed registry is empty", () => {
  it("yields no runnable feeds, so the worker performs no request", () => {
    expect(loadRunnableEmployerFeeds(new Date())).toHaveLength(0);
  });
});

describe("Supabase feed run store (ATS snapshot RPC contract)", () => {
  it("passes the runtime's completeness decision straight to finalisation", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const callRpc = vi.fn(
      async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "worker_begin_ats_snapshot") {
          return [{ import_run_id: "run-1", should_run: true }];
        }
        if (name === "worker_store_ats_snapshot_batch") {
          return [{ inserted_count: 1, updated_count: 0, unchanged_count: 0 }];
        }
        return { closed_count: 2 };
      },
    );
    const store = createSupabaseFeedRunStore({
      callRpc,
      adapterKey: "acme_xml",
    });

    const result = await store.applySnapshot(
      snapshot({
        jobs: [{ external_id: "1" }] as never,
      }),
    );
    expect(result).toMatchObject({ inserted: 1, closed: 2 });

    const finalize = calls.find(
      (call) => call.name === "worker_finalize_ats_snapshot",
    )!;
    expect(finalize.args.p_complete).toBe(true);
  });

  it("finalises a partial snapshot as partial, carrying its error codes", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const callRpc = vi.fn(
      async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "worker_begin_ats_snapshot") {
          return [{ import_run_id: "run-2", should_run: true }];
        }
        if (name === "worker_store_ats_snapshot_batch") return [];
        return { closed_count: 0 };
      },
    );
    const store = createSupabaseFeedRunStore({
      callRpc,
      adapterKey: "acme_xml",
    });

    await store.applySnapshot(
      snapshot({
        complete: false,
        errorCodes: ["feed_import_quarantine"],
        counts: { ...snapshot().counts, quarantinedRecords: 1 },
      }),
    );

    const finalize = calls.find(
      (call) => call.name === "worker_finalize_ats_snapshot",
    )!;
    expect(finalize.args.p_complete).toBe(false);
    expect(finalize.args.p_error_codes).toContain("feed_import_quarantine");
    expect(finalize.args.p_quarantined_count).toBe(1);
  });

  it("writes nothing when the snapshot is a duplicate run", async () => {
    const callRpc = vi.fn(async (name: string) =>
      name === "worker_begin_ats_snapshot"
        ? [{ import_run_id: "run-3", should_run: false }]
        : {},
    );
    const store = createSupabaseFeedRunStore({
      callRpc,
      adapterKey: "acme_xml",
    });
    const result = await store.applySnapshot(snapshot());
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      closed: 0,
    });
    expect(callRpc).toHaveBeenCalledTimes(1);
  });

  it("forces a partial finalisation when a batch write fails", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const callRpc = vi.fn(
      async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "worker_begin_ats_snapshot") {
          return [{ import_run_id: "run-4", should_run: true }];
        }
        if (name === "worker_store_ats_snapshot_batch") {
          throw new Error("write failed");
        }
        return {};
      },
    );
    const store = createSupabaseFeedRunStore({
      callRpc,
      adapterKey: "acme_xml",
    });

    await expect(
      store.applySnapshot(snapshot({ jobs: [{ external_id: "1" }] as never })),
    ).rejects.toThrow("write failed");

    const finalize = calls.find(
      (call) => call.name === "worker_finalize_ats_snapshot",
    )!;
    expect(finalize.args.p_complete).toBe(false);
    expect(finalize.args.p_error_codes).toContain("feed_store_failed");
  });
});
