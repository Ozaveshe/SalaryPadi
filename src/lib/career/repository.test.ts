import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  getAlerts,
  getApplications,
  getSavedJobs,
} from "@/lib/career/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    limit: () => query,
    then: result.then.bind(result),
  };
  return {
    schema: () => ({ rpc: () => query }),
  } as never;
}

describe("private career repository states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

  it("distinguishes an unconfigured backend from an empty account", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await expect(getSavedJobs()).resolves.toEqual({
      state: "unconfigured",
      data: [],
      issues: [
        {
          operation: "get_my_saved_jobs",
          kind: "not_configured",
          code: "career_backend_unconfigured",
        },
      ],
    });
  });

  it("returns a real empty state only after a successful RPC", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([]));
    await expect(getSavedJobs()).resolves.toEqual({
      state: "ready",
      data: [],
      issues: [],
    });
  });

  it("fails closed and records a stable code for malformed rows", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ id: "not-a-uuid" }]),
    );
    await expect(getSavedJobs()).resolves.toEqual({
      state: "invalid",
      data: [],
      issues: [
        {
          operation: "get_my_saved_jobs",
          kind: "invalid_rows",
          code: "career_invalid_rows",
        },
      ],
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"code":"career_invalid_rows"'),
    );
  });

  it("rejects malformed account timestamps before rendering them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
          job_slug: "backend-engineer",
          title: "Backend Engineer",
          company_name: "Acme",
          source_name: "Acme careers",
          saved_at: "not-a-timestamp",
        },
      ]),
    );

    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "career_invalid_rows" }],
    });
  });

  it("rejects account rows beyond their bounded private-data contracts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const savedJob = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      job_slug: "backend-engineer",
      title: "Backend Engineer",
      company_name: "Acme",
      source_name: "Acme careers",
      saved_at: "2026-07-14T00:00:00Z",
    };
    mockedCreateClient.mockResolvedValue(
      clientReturning(Array.from({ length: 1_001 }, () => savedJob)),
    );
    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "career_invalid_rows" }],
    });
  });

  it("rejects duplicate or out-of-order private career history", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const savedJob = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      job_slug: "backend-engineer",
      title: "Backend Engineer",
      company_name: "Acme",
      source_name: "Acme careers",
      saved_at: "2026-07-14T00:00:00Z",
    };
    mockedCreateClient.mockResolvedValue(clientReturning([savedJob, savedJob]));
    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "career_invalid_rows" }],
    });

    mockedCreateClient.mockResolvedValue(
      clientReturning([
        { ...savedJob, saved_at: "2026-07-13T00:00:00Z" },
        {
          ...savedJob,
          id: "ff01e60a-1422-4c9b-b35b-0fdbb1f96337",
          saved_at: "2026-07-14T00:00:00Z",
        },
      ]),
    );
    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "career_invalid_rows" }],
    });
  });

  it("enforces stored application-note and alert-query bounds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
          job_slug: "backend-engineer",
          title: "Backend Engineer",
          company_name: "Acme",
          status: "applied",
          private_notes: "x".repeat(10_001),
          next_action_at: null,
          updated_at: "2026-07-14T00:00:00Z",
        },
      ]),
    );
    await expect(getApplications()).resolves.toMatchObject({
      state: "invalid",
    });

    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
          query: { schema_version: 1, q: "x".repeat(16_384) },
          cadence: "daily",
          active: true,
          created_at: "2026-07-14T00:00:00Z",
        },
      ]),
    );
    await expect(getAlerts()).resolves.toMatchObject({ state: "invalid" });
  });

  it("uses the delivery search contract for private alert reads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const alert = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      query: { schema_version: 1, q: "platform engineer" },
      cadence: "daily",
      active: true,
      created_at: "2026-07-14T00:00:00Z",
    };
    mockedCreateClient.mockResolvedValue(clientReturning([alert]));

    await expect(getAlerts()).resolves.toMatchObject({
      state: "ready",
      data: [
        {
          query: {
            schema_version: 1,
            q: "platform engineer",
            workMode: "all",
          },
        },
      ],
    });

    mockedCreateClient.mockResolvedValue(
      clientReturning([
        { ...alert, query: { ...alert.query, unreviewed_filter: true } },
      ]),
    );
    await expect(getAlerts()).resolves.toMatchObject({ state: "invalid" });
  });

  it("does not relabel an RPC outage as an empty account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    await expect(getSavedJobs()).resolves.toEqual({
      state: "unavailable",
      data: [],
      issues: [
        {
          operation: "get_my_saved_jobs",
          kind: "query_failed",
          code: "career_rpc_error",
        },
      ],
    });
  });

  it("maps a thrown client bootstrap failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("client bootstrap failed");
    mockedCreateClient.mockRejectedValue(failure);

    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "career_rpc_error" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("maps a thrown RPC transport failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("RPC transport failed");
    const rejected = Promise.reject(failure);
    const query = {
      limit: () => query,
      then: rejected.then.bind(rejected),
    };
    mockedCreateClient.mockResolvedValue({
      schema: () => ({ rpc: () => query }),
    } as never);

    await expect(getSavedJobs()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "career_rpc_error" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });
});
