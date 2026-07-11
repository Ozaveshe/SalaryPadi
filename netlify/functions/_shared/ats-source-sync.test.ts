import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtsFetchResult } from "../../../src/lib/jobs/ats";
import type { AtsImportJob } from "../../../src/lib/jobs/ats-import";
import {
  chunkAtsImportRecords,
  runAtsSourceSync,
} from "../ats-source-sync.mjs";
import type { WorkerExecution } from "./runtime";

const now = new Date("2026-07-11T12:00:00.000Z");

function setEnvironment(enabled: string | undefined) {
  vi.stubGlobal("Netlify", {
    env: {
      get: (name: string) =>
        name === "ATS_SOURCE_SYNC_ENABLED" ? enabled : undefined,
    },
  });
}

function execution(): WorkerExecution {
  return {
    signal: new AbortController().signal,
    remainingMs: () => 20_000,
  };
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    adapter_key: "employer_ats_example",
    source_name: "Example careers",
    employer_name: "Example Nigeria",
    provider: "greenhouse",
    provider_region: null,
    tenant_identifier: "example",
    allowed_destination_hosts: ["boards.greenhouse.io"],
    allowed_destination_path_prefixes: ["/example"],
    fetch_interval_seconds: 43_200,
    daily_request_budget: 4,
    minimum_request_spacing_seconds: 300,
    publication_mode: "review",
    homepage_url: "https://example.com/careers",
    terms_url: "https://example.com/terms",
    terms_version: "permission-2026-07-11",
    attribution_required: true,
    attribution_text: "Source: Example careers",
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    may_email_jobs: false,
    required_destination_kind: "employer_application_url",
    authorization_basis: "written_permission",
    authorization_grantor: "Example Recruiting Operations",
    authorization_evidence_ref: "vault:source-permission/example/2026-07-11",
    authorization_reviewed_at: "2026-07-11T10:00:00.000Z",
    authorization_expires_at: "2027-07-11T10:00:00.000Z",
    ...overrides,
  };
}

function claimedPolicy(overrides: Record<string, unknown> = {}) {
  return { claimed: true, policy: policyRow(overrides) };
}

function fetched(overrides: Partial<AtsFetchResult> = {}): AtsFetchResult {
  return {
    checkedAt: now.toISOString(),
    endpoint:
      "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true",
    records: [
      {
        provider: "greenhouse",
        sourceKey: "employer_ats_example",
        employerName: "Example Nigeria",
        externalId: "123",
        title: "Platform Engineer",
        location: "Lagos, Nigeria",
        workplaceType: null,
        employmentType: null,
        department: "Engineering",
        team: null,
        descriptionHtml: "<p>Build reliable systems for African customers.</p>",
        descriptionText: null,
        publishedAt: null,
        updatedAt: "2026-07-11T10:00:00.000Z",
        sourceUrl: "https://boards.greenhouse.io/example/jobs/123",
        applicationUrl: "https://boards.greenhouse.io/example/jobs/123",
        checkedAt: now.toISOString(),
      },
    ],
    invalidRecords: [],
    snapshot: {
      status: "complete",
      providerRecordCount: 1,
      providerReportedTotal: 1,
      acceptedRecordCount: 1,
      filteredRecordCount: 0,
      invalidRecordCount: 0,
      isEmpty: false,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ATS source sync worker", () => {
  it("skips before any RPC or network call when the emergency gate is off", async () => {
    setEnvironment("false");
    const callRpc = vi.fn();
    const fetchSource = vi.fn();
    await expect(
      runAtsSourceSync(execution(), { rpc: callRpc, fetchSource }),
    ).resolves.toMatchObject({
      status: "skipped",
      summary: { reason: "ats_source_sync_disabled" },
    });
    expect(callRpc).not.toHaveBeenCalled();
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it("skips when the trusted registry has no authorized source", async () => {
    setEnvironment("true");
    const callRpc = vi.fn().mockResolvedValue([]);
    const fetchSource = vi.fn();
    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      summary: { reason: "no_authorized_ats_sources" },
    });
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it("claims, imports and finalizes a complete source snapshot", async () => {
    setEnvironment("true");
    const events: string[] = [];
    const callRpc = vi.fn(
      async (name: string, parameters?: Record<string, unknown>) => {
        events.push(name);
        if (name === "worker_list_authorized_ats_sources") return [policyRow()];
        if (name === "worker_claim_authorized_ats_source") {
          return claimedPolicy();
        }
        if (name === "worker_begin_ats_snapshot") {
          expect(parameters).toMatchObject({
            p_provider_count: 1,
            p_expected_record_count: 1,
          });
          return [
            {
              import_run_id: "30000000-0000-4000-8000-000000000001",
              should_run: true,
            },
          ];
        }
        if (name === "worker_store_ats_snapshot_batch") {
          expect(parameters?.p_records).toEqual([
            expect.objectContaining({
              external_id: "123",
              raw_payload: null,
              eligibility: expect.objectContaining({ scope: "nigeria" }),
            }),
          ]);
          return { created_count: 1 };
        }
        if (name === "worker_finalize_ats_snapshot") {
          expect(parameters).toMatchObject({
            p_complete: true,
            p_quarantined_count: 0,
            p_error_codes: [],
          });
          return { outcome: "complete", created_count: 1 };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    );

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource: vi.fn().mockResolvedValue(fetched()),
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({
      status: "succeeded",
      summary: {
        completed_sources: 1,
        provider_records: 1,
        stored_records: 1,
        quarantined_records: 0,
      },
    });
    expect(events).toEqual([
      "worker_list_authorized_ats_sources",
      "worker_claim_authorized_ats_source",
      "worker_begin_ats_snapshot",
      "worker_store_ats_snapshot_batch",
      "worker_finalize_ats_snapshot",
    ]);
  });

  it("fetches with the exact fresh policy returned by the atomic claim", async () => {
    setEnvironment("true");
    const callRpc = vi.fn(async (name: string) => {
      if (name === "worker_list_authorized_ats_sources") {
        return [
          policyRow({
            employer_name: "Stale employer name",
            tenant_identifier: "stale-tenant",
          }),
        ];
      }
      if (name === "worker_claim_authorized_ats_source") {
        return claimedPolicy({
          employer_name: "Fresh employer name",
          tenant_identifier: "fresh-tenant",
        });
      }
      if (name === "worker_begin_ats_snapshot") {
        return [
          {
            import_run_id: "30000000-0000-4000-8000-000000000001",
            should_run: true,
          },
        ];
      }
      if (name === "worker_store_ats_snapshot_batch") {
        return { created_count: 1 };
      }
      if (name === "worker_finalize_ats_snapshot") {
        return { outcome: "complete" };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const freshResult = fetched();
    freshResult.records = freshResult.records.map((record) => ({
      ...record,
      employerName: "Fresh employer name",
    }));
    const fetchSource = vi.fn().mockResolvedValue(freshResult);

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource,
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({ status: "succeeded" });
    expect(fetchSource).toHaveBeenCalledWith(
      expect.objectContaining({
        employerName: "Fresh employer name",
        tenant: "fresh-tenant",
      }),
      expect.anything(),
    );
    expect(fetchSource).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenant: "stale-tenant" }),
      expect.anything(),
    );
  });

  it("accepts a complete zero-record snapshot for omission reconciliation", async () => {
    setEnvironment("true");
    const callRpc = vi.fn(
      async (name: string, parameters?: Record<string, unknown>) => {
        if (name === "worker_list_authorized_ats_sources") return [policyRow()];
        if (name === "worker_claim_authorized_ats_source") {
          return claimedPolicy();
        }
        if (name === "worker_begin_ats_snapshot")
          return [
            {
              import_run_id: "30000000-0000-4000-8000-000000000001",
              should_run: true,
            },
          ];
        if (name === "worker_finalize_ats_snapshot") {
          expect(parameters).toMatchObject({
            p_complete: true,
            p_quarantined_count: 0,
          });
          return { outcome: "complete", expired_count: 0 };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    );
    const empty = fetched({
      records: [],
      snapshot: {
        status: "complete",
        providerRecordCount: 0,
        providerReportedTotal: 0,
        acceptedRecordCount: 0,
        filteredRecordCount: 0,
        invalidRecordCount: 0,
        isEmpty: true,
      },
    });

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource: vi.fn().mockResolvedValue(empty),
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({ status: "succeeded" });
    expect(callRpc).not.toHaveBeenCalledWith(
      "worker_store_ats_snapshot_batch",
      expect.anything(),
      expect.anything(),
    );
  });

  it("treats a previously finalized snapshot as an idempotent no-op", async () => {
    setEnvironment("true");
    const callRpc = vi.fn(async (name: string) => {
      if (name === "worker_list_authorized_ats_sources") return [policyRow()];
      if (name === "worker_claim_authorized_ats_source") {
        return claimedPolicy();
      }
      if (name === "worker_begin_ats_snapshot") {
        return [
          {
            import_run_id: "30000000-0000-4000-8000-000000000001",
            should_run: false,
          },
        ];
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource: vi.fn().mockResolvedValue(fetched()),
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({
      status: "succeeded",
      summary: {
        completed_sources: 0,
        duplicate_sources: 1,
        stored_records: 0,
      },
    });
    expect(callRpc).not.toHaveBeenCalledWith(
      "worker_store_ats_snapshot_batch",
      expect.anything(),
      expect.anything(),
    );
    expect(callRpc).not.toHaveBeenCalledWith(
      "worker_finalize_ats_snapshot",
      expect.anything(),
      expect.anything(),
    );
  });

  it("finalizes a quarantined source as partial and fails worker health", async () => {
    setEnvironment("true");
    const callRpc = vi.fn(
      async (name: string, parameters?: Record<string, unknown>) => {
        if (name === "worker_list_authorized_ats_sources") return [policyRow()];
        if (name === "worker_claim_authorized_ats_source") {
          return claimedPolicy();
        }
        if (name === "worker_begin_ats_snapshot")
          return [
            {
              import_run_id: "30000000-0000-4000-8000-000000000001",
              should_run: true,
            },
          ];
        if (name === "worker_store_ats_snapshot_batch")
          return { created_count: 1 };
        if (name === "worker_finalize_ats_snapshot") {
          expect(parameters).toMatchObject({
            p_complete: false,
            p_quarantined_count: 1,
            p_error_codes: ["ats_invalid_records"],
          });
          return { outcome: "partial" };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    );
    const partial = fetched({
      invalidRecords: [
        { index: 1, stage: "validation", issuePaths: ["title"] },
      ],
      snapshot: {
        status: "complete",
        providerRecordCount: 2,
        providerReportedTotal: 2,
        acceptedRecordCount: 1,
        filteredRecordCount: 0,
        invalidRecordCount: 1,
        isEmpty: false,
      },
    });

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource: vi.fn().mockResolvedValue(partial),
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({
      code: "ats_source_sync_incomplete",
      summary: { partial_sources: 1, quarantined_records: 1 },
    });
  });

  it("rejects an oversized provider snapshot before opening an import", async () => {
    setEnvironment("true");
    const callRpc = vi.fn(
      async (name: string, parameters?: Record<string, unknown>) => {
        if (name === "worker_list_authorized_ats_sources") {
          return [policyRow()];
        }
        if (name === "worker_claim_authorized_ats_source") {
          return claimedPolicy();
        }
        if (name === "worker_record_source_import") {
          expect(parameters).toMatchObject({
            p_adapter_key: "employer_ats_example",
            p_fetched_count: 401,
            p_status: "failed",
            p_error_code: "ats_source_record_limit_exceeded",
          });
          return true;
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    );
    const oversized = fetched({
      snapshot: {
        status: "complete",
        providerRecordCount: 401,
        providerReportedTotal: 401,
        acceptedRecordCount: 1,
        filteredRecordCount: 400,
        invalidRecordCount: 0,
        isEmpty: false,
      },
    });

    await expect(
      runAtsSourceSync(execution(), {
        rpc: callRpc,
        fetchSource: vi.fn().mockResolvedValue(oversized),
        now: () => now,
        randomUuid: () => "40000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({
      code: "ats_source_sync_incomplete",
      summary: { failed_sources: 1, provider_records: 401 },
    });
    expect(callRpc).not.toHaveBeenCalledWith(
      "worker_begin_ats_snapshot",
      expect.anything(),
      expect.anything(),
    );
  });

  it("uses a fresh reserve signal to finalize after the operation aborts", async () => {
    setEnvironment("true");
    const operation = new AbortController();
    let cleanupSignal: AbortSignal | undefined;
    const callRpc = vi.fn(
      async (
        name: string,
        _parameters?: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ) => {
        if (name === "worker_list_authorized_ats_sources") {
          return [policyRow()];
        }
        if (name === "worker_claim_authorized_ats_source") {
          return claimedPolicy();
        }
        if (name === "worker_begin_ats_snapshot") {
          return [
            {
              import_run_id: "30000000-0000-4000-8000-000000000001",
              should_run: true,
            },
          ];
        }
        if (name === "worker_store_ats_snapshot_batch") {
          operation.abort(new DOMException("deadline", "AbortError"));
          throw operation.signal.reason;
        }
        if (name === "worker_finalize_ats_snapshot") {
          cleanupSignal = options?.signal;
          return { outcome: "failed" };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    );

    await expect(
      runAtsSourceSync(
        { signal: operation.signal, remainingMs: () => 20_000 },
        {
          rpc: callRpc,
          fetchSource: vi.fn().mockResolvedValue(fetched()),
          now: () => now,
          randomUuid: () => "40000000-0000-4000-8000-000000000001",
        },
      ),
    ).rejects.toMatchObject({
      code: "ats_source_sync_incomplete",
      summary: { failed_sources: 1 },
    });
    expect(operation.signal.aborted).toBe(true);
    expect(cleanupSignal).toBeDefined();
    expect(cleanupSignal).not.toBe(operation.signal);
    expect(cleanupSignal?.aborted).toBe(false);
  });
});

describe("ATS import batching", () => {
  const job = { external_id: "one", title: "Example" } as AtsImportJob;

  it("bounds batches by record count", () => {
    expect(chunkAtsImportRecords([job, job, job], 10_000, 2)).toEqual([
      [job, job],
      [job],
    ]);
  });

  it("keeps default batches inside the database 200-record boundary", () => {
    const records = Array.from({ length: 201 }, (_, index) => ({
      ...job,
      external_id: String(index),
    }));
    expect(chunkAtsImportRecords(records).map((batch) => batch.length)).toEqual(
      [200, 1],
    );
  });

  it("rejects a single record larger than the RPC batch budget", () => {
    expect(() =>
      chunkAtsImportRecords(
        [{ ...job, description_text: "x".repeat(2_000) }],
        1024,
        10,
      ),
    ).toThrow("ats_import_record_too_large");
  });
});
