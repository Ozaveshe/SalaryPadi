import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertCatalog } from "../../../src/lib/jobs/alert-catalog";
import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import type { RemotiveJob } from "../../../src/lib/jobs/remotive-schema";

import { runJobSourceSync } from "../job-source-sync.mjs";
import { OperationalError, type WorkerExecution } from "./runtime";

const sourceJob: RemotiveJob = {
  id: 51,
  url: "https://remotive.com/remote-jobs/software-dev/source-51",
  title: "Platform Engineer",
  company_name: "Example Ltd",
  company_logo: null,
  category: "Software Development",
  tags: ["TypeScript"],
  job_type: "full_time",
  publication_date: "2026-07-09T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$80,000",
  description: "<p>Build reliable systems.</p>",
};

const activePolicy = {
  adapter_key: "remotive",
  source_type: "permitted_api",
  status: "active",
  terms_url: "https://github.com/remotive-com/remote-jobs-api",
  terms_reviewed_at: "2026-07-10T00:00:00+00:00",
  terms_version: "remotive-public-api-repository-reviewed-2026-07-10",
  allow_public_listing: true,
  attribution_required: true,
  may_store_full_description: false,
  may_index_jobs: false,
  may_emit_jobposting_schema: false,
  required_destination_kind: "source_url",
  refresh_interval_seconds: 43_200,
};

function execution(): WorkerExecution {
  return {
    signal: new AbortController().signal,
    remainingMs: () => 20_000,
  };
}

function snapshot(): AlertCatalog {
  const checkedAt = new Date().toISOString();
  const job = normalizeRemotiveJob(sourceJob, checkedAt);
  return {
    schemaVersion: 1,
    checkedAt,
    jobs: [
      {
        ...job,
        description: "",
        requirements: null,
        benefits: null,
        riskIndicators: [],
      },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal("Netlify", {
    env: {
      get: (name: string) =>
        name === "REMOTIVE_SOURCE_ENABLED" ? "true" : undefined,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("job source sync orchestration", () => {
  it("stops a paused database source before any snapshot fetch or Blob write", async () => {
    const fetchSnapshot = vi.fn();
    const storeCatalog = vi.fn();
    const callRpc = vi.fn(async (name: string) => {
      expect(name).toBe("worker_get_job_source_policy");
      return [{ ...activePolicy, status: "paused" }];
    });

    await expect(
      runJobSourceSync(execution(), {
        rpc: callRpc,
        fetchSnapshot,
        storeCatalog,
      }),
    ).resolves.toEqual({
      status: "skipped",
      summary: { reason: "remotive_source_paused" },
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(storeCatalog).not.toHaveBeenCalled();
  });

  it("checks policy, warms the public snapshot, publishes it, then records evidence", async () => {
    const events: string[] = [];
    const current = snapshot();
    const workerExecution = execution();
    const callRpc = vi.fn(async (name: string): Promise<unknown> => {
      events.push(name);
      if (name === "worker_get_job_source_policy") return [activePolicy];
      if (name === "worker_record_source_import") {
        return "00000000-0000-4000-8000-000000000099";
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    const fetchSnapshot = vi.fn(async () => {
      events.push("fetch_snapshot");
      return current;
    });
    const storeCatalog = vi.fn(async () => {
      events.push("store_catalog");
      return 1;
    });

    await expect(
      runJobSourceSync(workerExecution, {
        rpc: callRpc,
        fetchSnapshot,
        storeCatalog,
      }),
    ).resolves.toEqual({
      status: "succeeded",
      summary: {
        source: "remotive",
        fetched_count: 1,
        alert_catalog_count: 1,
        persisted_descriptions: 0,
        import_recorded: true,
      },
    });
    expect(events).toEqual([
      "worker_get_job_source_policy",
      "fetch_snapshot",
      "store_catalog",
      "worker_record_source_import",
    ]);
    expect(storeCatalog).toHaveBeenCalledWith(
      current.jobs,
      workerExecution.signal,
      current.checkedAt,
    );
  });

  it("fails closed when source permissions drift", async () => {
    const fetchSnapshot = vi.fn();
    const callRpc = vi.fn(async (name: string) => {
      if (name === "worker_get_job_source_policy") {
        return [{ ...activePolicy, may_store_full_description: true }];
      }
      return "failure-import";
    });

    await expect(
      runJobSourceSync(execution(), { rpc: callRpc, fetchSnapshot }),
    ).rejects.toMatchObject({ code: "remotive_source_policy_mismatch" });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(callRpc).toHaveBeenLastCalledWith(
      "worker_record_source_import",
      expect.objectContaining({
        p_status: "failed",
        p_error_code: "remotive_source_policy_mismatch",
      }),
      expect.any(Object),
    );
  });

  it("records a safe failure code when snapshot publication cannot be warmed", async () => {
    const callRpc = vi.fn(async (name: string): Promise<unknown> => {
      if (name === "worker_get_job_source_policy") return [activePolicy];
      if (name === "worker_record_source_import") return "failure-import";
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      runJobSourceSync(execution(), {
        rpc: callRpc,
        fetchSnapshot: async () => {
          throw new OperationalError("job_snapshot_503");
        },
      }),
    ).rejects.toMatchObject({ code: "job_snapshot_503" });
    expect(callRpc).toHaveBeenLastCalledWith(
      "worker_record_source_import",
      expect.objectContaining({
        p_fetched_count: 0,
        p_status: "failed",
        p_error_code: "job_snapshot_503",
      }),
      expect.any(Object),
    );
  });

  it("rejects an empty source snapshot before Blob publication", async () => {
    const storeCatalog = vi.fn();
    const callRpc = vi.fn(async (name: string): Promise<unknown> => {
      if (name === "worker_get_job_source_policy") return [activePolicy];
      if (name === "worker_record_source_import") {
        return "00000000-0000-4000-8000-000000000098";
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      runJobSourceSync(execution(), {
        rpc: callRpc,
        fetchSnapshot: async () => ({
          schemaVersion: 1,
          checkedAt: new Date().toISOString(),
          jobs: [],
        }),
        storeCatalog,
      }),
    ).rejects.toMatchObject({ code: "remotive_source_empty" });
    expect(storeCatalog).not.toHaveBeenCalled();
    expect(callRpc).toHaveBeenLastCalledWith(
      "worker_record_source_import",
      expect.objectContaining({
        p_fetched_count: 0,
        p_status: "failed",
        p_error_code: "remotive_source_empty",
      }),
      expect.any(Object),
    );
  });

  it("rejects a Blob catalog count mismatch and records the failure", async () => {
    const callRpc = vi.fn(async (name: string): Promise<unknown> => {
      if (name === "worker_get_job_source_policy") return [activePolicy];
      if (name === "worker_record_source_import") {
        return "00000000-0000-4000-8000-000000000097";
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      runJobSourceSync(execution(), {
        rpc: callRpc,
        fetchSnapshot: async () => snapshot(),
        storeCatalog: async () => 0,
      }),
    ).rejects.toMatchObject({ code: "job_catalog_count_mismatch" });
    expect(callRpc).toHaveBeenLastCalledWith(
      "worker_record_source_import",
      expect.objectContaining({
        p_fetched_count: 1,
        p_status: "failed",
        p_error_code: "job_catalog_count_mismatch",
      }),
      expect.any(Object),
    );
  });

  it("requires durable UUID evidence before claiming a successful sync", async () => {
    const callRpc = vi.fn(async (name: string): Promise<unknown> => {
      if (name === "worker_get_job_source_policy") return [activePolicy];
      if (name === "worker_record_source_import") return "not-an-import-id";
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      runJobSourceSync(execution(), {
        rpc: callRpc,
        fetchSnapshot: async () => snapshot(),
        storeCatalog: async () => 1,
      }),
    ).rejects.toMatchObject({ code: "source_import_evidence_invalid" });
    expect(callRpc).toHaveBeenCalledTimes(3);
  });
});
