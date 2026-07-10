import type { Context } from "@netlify/functions";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLATFORM_SHUTDOWN_RESERVE_MS,
  RPC_TIMEOUT_MS,
  rpc,
  runTrackedWorker,
  SCHEDULED_FUNCTION_LIMIT_MS,
  SCHEDULED_WORKER_BUDGET_MS,
  WORKER_FINISH_RESERVE_MS,
  WORKER_OPERATION_BUDGET_MS,
  workerSkipped,
  workerSucceeded,
} from "./runtime";

function scheduledRequest() {
  return new Request("https://salarypadi.com/.netlify/functions/test", {
    method: "POST",
    body: JSON.stringify({ next_run: "2026-07-10T12:00:00.000Z" }),
  });
}

function netlifyEnvironment(values: Record<string, string | undefined>) {
  vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scheduled worker runtime", () => {
  it("reserves time for terminal persistence and platform shutdown", () => {
    expect(SCHEDULED_WORKER_BUDGET_MS).toBeLessThan(
      SCHEDULED_FUNCTION_LIMIT_MS,
    );
    expect(PLATFORM_SHUTDOWN_RESERVE_MS).toBeGreaterThanOrEqual(6_000);
    expect(WORKER_OPERATION_BUDGET_MS).toBeLessThan(SCHEDULED_WORKER_BUDGET_MS);
    expect(WORKER_FINISH_RESERVE_MS).toBeGreaterThanOrEqual(RPC_TIMEOUT_MS);
  });

  it("rejects a wrong Supabase project before sending a credential", async () => {
    netlifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://wrong-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-sent",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(rpc("worker_start")).rejects.toMatchObject({
      code: "invalid_supabase_project_url",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a false terminal write instead of logging success", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const terminalStatuses: unknown[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000001", should_run: true },
        ] as T;
      }
      terminalStatuses.push(parameters.p_status);
      return false as T;
    };

    await expect(
      runTrackedWorker(
        "test_worker",
        scheduledRequest(),
        { deploy: { id: "deploy-1" } } as Context,
        async () => workerSucceeded({ count: 1 }),
        { rpc: fakeRpc },
      ),
    ).rejects.toMatchObject({ code: "worker_finish_rejected" });
    expect(terminalStatuses).toEqual(["succeeded", "failed"]);
  });

  it("persists a disabled provider run as skipped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const terminalCalls: Record<string, unknown>[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000003", should_run: true },
        ] as T;
      }
      terminalCalls.push(parameters);
      return true as T;
    };

    const response = await runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      {} as Context,
      async () => workerSkipped("provider_disabled"),
      { rpc: fakeRpc },
    );

    await expect(response.json()).resolves.toEqual({ status: "skipped" });
    expect(terminalCalls).toContainEqual(
      expect.objectContaining({
        p_status: "skipped",
        p_summary: { reason: "provider_disabled" },
      }),
    );
  });

  it("threads the operation deadline and records a timed-out run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controllers = new Map<number, AbortController>();
    const timeoutSignal = (timeoutMs: number) => {
      const controller = new AbortController();
      controllers.set(timeoutMs, controller);
      return controller.signal;
    };
    const terminalCalls: Record<string, unknown>[] = [];
    const fakeRpc = async <T>(
      functionName: string,
      parameters: Record<string, unknown> = {},
    ): Promise<T> => {
      if (functionName === "worker_start") {
        return [
          { run_id: "00000000-0000-4000-8000-000000000002", should_run: true },
        ] as T;
      }
      terminalCalls.push(parameters);
      return true as T;
    };
    let operationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });

    const run = runTrackedWorker(
      "test_worker",
      scheduledRequest(),
      {} as Context,
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          operationStarted?.();
        }),
      { rpc: fakeRpc, timeoutSignal },
    );
    await started;
    controllers
      .get(WORKER_OPERATION_BUDGET_MS)
      ?.abort(new DOMException("deadline", "TimeoutError"));

    await expect(run).rejects.toMatchObject({ name: "TimeoutError" });
    expect(terminalCalls).toContainEqual(
      expect.objectContaining({
        p_status: "failed",
        p_error_code: "worker_deadline_exceeded",
      }),
    );
  });
});
