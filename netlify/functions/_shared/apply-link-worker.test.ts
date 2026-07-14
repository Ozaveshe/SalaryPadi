import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./apply-link-check", () => ({ checkApplyLink: vi.fn() }));

import applyLinkCheck, { runApplyLinkChecks } from "../apply-link-check.mjs";
import { checkApplyLink, type ApplyLinkCheckResult } from "./apply-link-check";
import {
  installWorkerFetch,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
} from "./test-support/scheduled-worker";

const claims = [
  {
    job_id: "10000000-0000-4000-8000-000000000010",
    application_url: "https://jobs.example.test/healthy",
  },
  {
    job_id: "10000000-0000-4000-8000-000000000011",
    application_url: "https://jobs.example.test/broken",
  },
  {
    job_id: "10000000-0000-4000-8000-000000000012",
    application_url: "https://jobs.example.test/unknown",
  },
] as const;

const results = [
  {
    result: "healthy",
    httpStatus: 204,
    errorCode: null,
    responseMs: 12,
  },
  {
    result: "broken",
    httpStatus: 404,
    errorCode: "apply_link_http_404",
    responseMs: 23,
  },
  {
    result: "indeterminate",
    httpStatus: 429,
    errorCode: "apply_link_http_429",
    responseMs: 34,
  },
] as const satisfies readonly [
  ApplyLinkCheckResult,
  ApplyLinkCheckResult,
  ApplyLinkCheckResult,
];

function execution(remainingMs = 10_000) {
  return {
    signal: new AbortController().signal,
    remainingMs: () => remainingMs,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(checkApplyLink).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("apply link check worker", () => {
  it("records each classification and reports claimed versus processed work", async () => {
    stubWorkerEnvironment();
    vi.mocked(checkApplyLink)
      .mockResolvedValueOnce(results[0])
      .mockResolvedValueOnce(results[1])
      .mockResolvedValueOnce(results[2]);
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_apply_link_checks: claims,
        worker_record_apply_link_check: true,
      },
    });

    const response = await applyLinkCheck(
      scheduledRequest("apply_link_check"),
      workerContext,
    );

    expect(response.status).toBe(200);
    expect(rpcCallBodies(fetchMock, "worker_record_apply_link_check")).toEqual([
      expect.objectContaining({
        p_job_id: claims[0].job_id,
        p_result: "healthy",
        p_http_status: 204,
        p_error_code: null,
        p_response_ms: 12,
      }),
      expect.objectContaining({
        p_job_id: claims[1].job_id,
        p_result: "broken",
        p_http_status: 404,
        p_error_code: "apply_link_http_404",
        p_response_ms: 23,
      }),
      expect.objectContaining({
        p_job_id: claims[2].job_id,
        p_result: "indeterminate",
        p_http_status: 429,
        p_error_code: "apply_link_http_429",
        p_response_ms: 34,
      }),
    ]);
    expect(rpcCallBodies(fetchMock, "worker_finish")[0]).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        claimed: 3,
        processed: 3,
        deferred: 0,
        healthy: 1,
        broken: 1,
        indeterminate: 1,
      },
    });
  });

  it("defers every claim when the durable-write reserve would be consumed", async () => {
    stubWorkerEnvironment();
    installWorkerFetch({
      rpc: { worker_claim_apply_link_checks: claims.slice(0, 2) },
    });

    await expect(runApplyLinkChecks(execution(2_999))).rejects.toMatchObject({
      code: "apply_link_check_time_budget_exhausted",
      summary: {
        claimed: 2,
        processed: 0,
        deferred: 2,
        healthy: 0,
        broken: 0,
        indeterminate: 0,
      },
    });
    expect(checkApplyLink).not.toHaveBeenCalled();
  });

  it("uses distinct bounded signals for checking and durable recording", async () => {
    stubWorkerEnvironment();
    const parentExecution = execution();
    vi.mocked(checkApplyLink).mockResolvedValue(results[0]);
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_apply_link_checks: [claims[0]],
        worker_record_apply_link_check: true,
      },
    });

    await runApplyLinkChecks(parentExecution);

    const checkSignal = vi.mocked(checkApplyLink).mock.calls[0]?.[1];
    expect(checkSignal).toBeInstanceOf(AbortSignal);
    expect(checkSignal).not.toBe(parentExecution.signal);
    const recordCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("worker_record_apply_link_check"),
    );
    expect(recordCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(recordCall?.[1]?.signal).not.toBe(checkSignal);
    expect(parentExecution.signal.aborted).toBe(false);
  });

  it("timestamps a check after the network classification completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-14T00:00:00.000Z");
    stubWorkerEnvironment();
    vi.mocked(checkApplyLink).mockImplementation(async () => {
      vi.setSystemTime("2026-07-14T00:00:07.000Z");
      return results[0];
    });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_apply_link_checks: [claims[0]],
        worker_record_apply_link_check: true,
      },
    });

    await runApplyLinkChecks(execution());

    expect(
      rpcCallBodies(fetchMock, "worker_record_apply_link_check")[0],
    ).toMatchObject({ p_checked_at: "2026-07-14T00:00:07.000Z" });
  });

  it("fails closed and stops when the database rejects a durable record", async () => {
    stubWorkerEnvironment();
    vi.mocked(checkApplyLink).mockResolvedValue(results[0]);
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_apply_link_checks: claims.slice(0, 2),
        worker_record_apply_link_check: false,
      },
    });

    await expect(runApplyLinkChecks(execution())).rejects.toMatchObject({
      code: "apply_link_record_rejected",
    });
    expect(checkApplyLink).toHaveBeenCalledTimes(1);
    expect(
      rpcCallBodies(fetchMock, "worker_record_apply_link_check"),
    ).toHaveLength(1);
  });
});
